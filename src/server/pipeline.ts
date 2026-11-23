import {
  decidir,
  normalizar,
  normalizarChave,
  normalizarCnpj,
  soDigitos,
  vencimentoDoDocumento,
  valorDoDocumento,
  type Contexto,
  type Decisao,
  type Documento,
  type Nfe,
  type NotaConhecida,
} from "@/domain/documentos";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import { ErroDeExtracao, type Extrator } from "@/server/extracao/extrator";
import { salvarPdf } from "@/server/storage";

/** V9: acima disso, só o gestor aprova. */
export const ALCADA_CENTAVOS = 1_000_000;

type Tx = Prisma.TransactionClient;

/** Documentos que ainda "valem" para duplicidade e para casar boletos. */
const VIGENTES: Prisma.EnumStatusDocumentoFilter = { notIn: ["REJEITADO", "FALHA_EXTRACAO"] };

const paraData = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const isoDe = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Monta o contexto que as regras precisam, só com o que importa para ESTE documento
 * (mesma chave, mesma linha, mesmo hash, notas do mesmo fornecedor).
 * `ignorarId`: na revisão, o próprio documento não conta como duplicado de si mesmo.
 */
export async function montarContexto(
  tx: Tx,
  doc: Documento,
  { hash, recebidoEm, ignorarId }: { hash: string; recebidoEm: string; ignorarId?: string },
): Promise<Contexto> {
  const outros = { status: VIGENTES, ...(ignorarId ? { id: { not: ignorarId } } : {}) };
  const chave = doc.tipo === "NFE" && doc.chaveAcesso ? normalizarChave(doc.chaveAcesso) : null;
  const linha = doc.tipo === "BOLETO" && doc.linhaDigitavel ? soDigitos(doc.linhaDigitavel) : null;
  const beneficiario = doc.tipo === "BOLETO" && doc.beneficiarioCnpj ? normalizarCnpj(doc.beneficiarioCnpj) : null;

  const [cnpjs, fornecedores, mesmoHash, mesmaChave, mesmaLinha, notas] = await Promise.all([
    tx.cnpj.findMany({ select: { cnpj: true } }),
    tx.fornecedor.findMany({ select: { cnpj: true, nome: true, ativo: true } }),
    tx.documento.count({ where: { ...outros, hashArquivo: hash } }),
    chave ? tx.documento.count({ where: { ...outros, chaveAcesso: chave } }) : 0,
    linha ? tx.documento.count({ where: { ...outros, linhaDigitavel: linha } }) : 0,
    beneficiario
      ? tx.documento.findMany({ where: { ...outros, tipo: "NFE", fornecedor: { cnpj: beneficiario } }, select: { dados: true } })
      : [],
  ]);

  return {
    cnpjsDoGrupo: cnpjs.map((c) => c.cnpj),
    fornecedores,
    jaRecebidos: {
      chaves: new Set(mesmaChave && chave ? [chave] : []),
      linhas: new Set(mesmaLinha && linha ? [linha] : []),
      hashes: new Set(mesmoHash ? [hash] : []),
    },
    notas: notas.map((n) => n.dados as Nfe).flatMap(notaConhecida),
    hashArquivo: hash,
    recebidoEm,
    alcadaCentavos: ALCADA_CENTAVOS,
  };
}

function notaConhecida(n: Nfe): NotaConhecida[] {
  if (n.emitenteCnpj === null || n.numero === null) return [];
  return [
    {
      emitenteCnpj: n.emitenteCnpj,
      numero: n.numero,
      totalNotaCentavos: n.totalNotaCentavos,
      duplicatas: n.duplicatas.flatMap((d) =>
        d.valorCentavos !== null && d.vencimento !== null ? [{ valorCentavos: d.valorCentavos, vencimento: d.vencimento }] : [],
      ),
    },
  ];
}

/** Colunas de busca e o fornecedor, a partir do documento normalizado. */
export async function camposDeBusca(tx: Tx, doc: Documento, decisao: Decisao) {
  const cnpj = doc.tipo === "NFE" ? doc.emitenteCnpj : doc.beneficiarioCnpj;
  const fornecedor = cnpj ? await tx.fornecedor.findUnique({ where: { cnpj: normalizarCnpj(cnpj) }, select: { id: true } }) : null;
  const vencimento = vencimentoDoDocumento(doc);
  return {
    tipo: doc.tipo,
    fornecedorId: fornecedor?.id ?? null,
    chaveAcesso: doc.tipo === "NFE" && doc.chaveAcesso ? normalizarChave(doc.chaveAcesso) : null,
    linhaDigitavel: doc.tipo === "BOLETO" && doc.linhaDigitavel ? soDigitos(doc.linhaDigitavel) : null,
    numero: doc.tipo === "NFE" ? (doc.numero === null ? null : String(doc.numero)) : doc.numeroDocumento,
    valorCentavos: valorDoDocumento(doc),
    vencimento: vencimento ? paraData(vencimento) : null,
    urgente: decisao.urgente,
    exigeGestor: decisao.exigeGestor,
    dados: doc as unknown as Prisma.InputJsonValue,
  };
}

export const violacoesParaGravar = (d: Decisao) =>
  d.violacoes.map(({ regra, codigo, campo, severidade, mensagem }) => ({ regra, codigo, campo, severidade, mensagem }));

/** Repete a transação se o Postgres abortar por conflito de serialização (dois uploads ao mesmo tempo). */
export async function emSerializavel<T>(db: Db, fn: (tx: Tx) => Promise<T>, tentativas = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable", timeout: 20_000 });
    } catch (e) {
      const conflito = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!conflito || i >= tentativas) throw e;
    }
  }
}

export type Recebimento = {
  bytes: Uint8Array;
  nomeArquivo: string;
  usuarioId: string;
  /** ISO; por padrão, hoje. */
  recebidoEm: string;
};

export type Processado = { documentoId: string; status: string; decisao: Decisao | null; origem?: "CLAUDE" | "GRAVADA"; modelo?: string | null; erro?: string };

/**
 * Upload → extração (IA ou gravada) → normalização → regras → documento gravado.
 * As regras rodam DENTRO de uma transação serializável: dois envios da mesma nota ao mesmo
 * tempo não passam os dois pela checagem de duplicidade (V4).
 */
export async function processarDocumento(db: Db, extrator: Extrator, r: Recebimento): Promise<Processado> {
  const hash = await salvarPdf(r.bytes);
  const base = {
    nomeArquivo: r.nomeArquivo,
    hashArquivo: hash,
    tamanhoBytes: r.bytes.byteLength,
    recebidoEm: paraData(r.recebidoEm),
    enviadoPorId: r.usuarioId,
  };

  let extracao;
  try {
    extracao = await extrator.extrair(r.bytes, hash);
  } catch (e) {
    if (!(e instanceof ErroDeExtracao)) throw e;
    const falha = await db.documento.create({ data: { ...base, status: "FALHA_EXTRACAO", motivo: e.message } });
    await db.auditoria.create({
      data: { usuarioId: r.usuarioId, acao: "EXTRACAO_FALHOU", entidade: "Documento", entidadeId: falha.id, dados: { erro: e.message } },
    });
    return { documentoId: falha.id, status: "FALHA_EXTRACAO", decisao: null, erro: e.message };
  }

  const doc = normalizar(extracao.bruto);
  return emSerializavel(db, async (tx) => {
    const ctx = await montarContexto(tx, doc, { hash, recebidoEm: r.recebidoEm });
    const decisao = decidir(doc, ctx);
    const criado = await tx.documento.create({
      data: {
        ...base,
        ...(await camposDeBusca(tx, doc, decisao)),
        status: decisao.status,
        extracao: {
          create: {
            origem: extracao.origem,
            modelo: extracao.modelo,
            bruto: extracao.bruto as unknown as Prisma.InputJsonValue,
            tokensEntrada: extracao.tokensEntrada,
            tokensSaida: extracao.tokensSaida,
            duracaoMs: extracao.duracaoMs,
          },
        },
        violacoes: { create: violacoesParaGravar(decisao) },
      },
    });
    await tx.auditoria.create({
      data: {
        usuarioId: r.usuarioId,
        acao: "DOCUMENTO_RECEBIDO",
        entidade: "Documento",
        entidadeId: criado.id,
        dados: { status: decisao.status, regras: decisao.violacoes.map((v) => v.codigo) },
      },
    });
    return { documentoId: criado.id, status: decisao.status, decisao, origem: extracao.origem, modelo: extracao.modelo };
  });
}
