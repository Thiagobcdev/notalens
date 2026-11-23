import "server-only";
import { extracaoBrutaSchema, normalizar, paraBruto, type Documento, type ExtracaoBruta } from "@/domain/documentos";
import type { ContextoSerializado } from "@/lib/contexto";
import { prisma } from "@/server/db";
import { isoDe, montarContexto } from "@/server/pipeline";

/** Ordem da fila: urgentes primeiro, depois o mais antigo. */
export const ORDEM_DA_FILA = [{ urgente: "desc" }, { recebidoEm: "asc" }, { criadoEm: "asc" }] as const;

export async function proximoDaFila(excetoId: string): Promise<string | null> {
  const d = await prisma.documento.findFirst({
    where: { status: "EM_REVISAO", id: { not: excetoId } },
    orderBy: [...ORDEM_DA_FILA],
    select: { id: true },
  });
  return d?.id ?? null;
}

export async function getRevisao(id: string) {
  const d = await prisma.documento.findUnique({
    where: { id },
    include: {
      extracao: true,
      fornecedor: { select: { nome: true, ativo: true } },
      decididoPor: { select: { nome: true } },
      enviadoPor: { select: { nome: true } },
      violacoes: true,
      correcoes: { orderBy: { campo: "asc" }, include: { usuario: { select: { nome: true } } } },
    },
  });
  if (!d) return null;

  const recebidoEm = isoDe(d.recebidoEm);
  const dados = d.dados as Documento | null;
  let formulario: ExtracaoBruta | null = null;
  let leituraDaIa: ExtracaoBruta | null = null;
  let contexto: ContextoSerializado | null = null;

  if (dados && d.extracao) {
    formulario = paraBruto(dados);
    // A leitura da IA passa pela mesma formatação, para comparar campo a campo com o formulário.
    leituraDaIa = paraBruto(normalizar(extracaoBrutaSchema.parse(d.extracao.bruto)));
    const ctx = await montarContexto(prisma, dados, { hash: d.hashArquivo, recebidoEm, ignorarId: d.id });
    contexto = {
      ...ctx,
      jaRecebidos: { chaves: [...ctx.jaRecebidos.chaves], linhas: [...ctx.jaRecebidos.linhas], hashes: [...ctx.jaRecebidos.hashes] },
    };
  }

  const [proximo, naFila] = await Promise.all([proximoDaFila(id), prisma.documento.count({ where: { status: "EM_REVISAO" } })]);

  return {
    id: d.id,
    tipo: d.tipo,
    status: d.status,
    nomeArquivo: d.nomeArquivo,
    recebidoEm,
    enviadoPor: d.enviadoPor.nome,
    fornecedor: d.fornecedor,
    exigeGestor: d.exigeGestor,
    urgente: d.urgente,
    motivo: d.motivo,
    decididoPor: d.decididoPor?.nome ?? null,
    decididoEm: d.decididoEm?.toISOString() ?? null,
    extracao: d.extracao && { origem: d.extracao.origem, modelo: d.extracao.modelo, duracaoMs: d.extracao.duracaoMs },
    violacoes: d.violacoes.map(({ regra, codigo, campo, severidade, mensagem }) => ({ regra, codigo, campo, severidade, mensagem })),
    correcoes: d.correcoes.map((c) => ({ campo: c.campo, valorIa: c.valorIa, valorFinal: c.valorFinal, por: c.usuario.nome })),
    formulario,
    leituraDaIa,
    contexto,
    proximo,
    naFila,
  };
}

export type DadosRevisao = NonNullable<Awaited<ReturnType<typeof getRevisao>>>;
