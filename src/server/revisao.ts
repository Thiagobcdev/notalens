import { decidir, diferencas, normalizar, extracaoBrutaSchema, type Decisao, type Documento } from "@/domain/documentos";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import { camposDeBusca, emSerializavel, isoDe, montarContexto, violacoesParaGravar } from "@/server/pipeline";

export class ErroDeRevisao extends Error {}

/** `em`: data da decisão (o seed usa para montar o histórico; a aplicação usa agora). */
type Quem = { id: string; papel: "ANALISTA" | "GESTOR"; em?: Date };
type Tx = Prisma.TransactionClient;

async function carregar(tx: Tx, id: string) {
  const d = await tx.documento.findUnique({ where: { id }, include: { extracao: true } });
  if (!d) throw new ErroDeRevisao("Documento não encontrado.");
  return d;
}

async function revalidar(tx: Tx, d: Awaited<ReturnType<typeof carregar>>, doc: Documento): Promise<Decisao> {
  const ctx = await montarContexto(tx, doc, { hash: d.hashArquivo, recebidoEm: isoDe(d.recebidoEm), ignorarId: d.id });
  return decidir(doc, ctx);
}

const valorJson = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

/**
 * Grava os campos corrigidos, roda as regras de novo e registra o que mudou em relação à IA.
 * As correções são sempre "o que a IA leu × o valor atual": corrigir duas vezes o mesmo campo
 * não conta dois erros da IA.
 */
export async function corrigir(db: Db, id: string, doc: Documento, quem: Quem): Promise<Decisao> {
  return emSerializavel(db, async (tx) => {
    const d = await carregar(tx, id);
    if (d.status !== "EM_REVISAO") throw new ErroDeRevisao("Só documentos em revisão podem ser corrigidos.");
    if (!d.extracao || d.tipo !== doc.tipo) throw new ErroDeRevisao("O tipo do documento não pode mudar.");

    const daIa = normalizar(extracaoBrutaSchema.parse(d.extracao.bruto));
    const mudancas = diferencas(daIa, doc);
    const decisao = await revalidar(tx, d, doc);

    await tx.correcao.deleteMany({ where: { documentoId: id } });
    await tx.correcao.createMany({
      data: mudancas.map((m) => ({
        documentoId: id,
        campo: m.campo,
        valorIa: valorJson(m.antes),
        valorFinal: valorJson(m.depois),
        usuarioId: quem.id,
        em: quem.em ?? new Date(),
      })),
    });
    await tx.resultadoRegra.deleteMany({ where: { documentoId: id } });
    await tx.documento.update({
      where: { id },
      data: { ...(await camposDeBusca(tx, doc, decisao)), violacoes: { create: violacoesParaGravar(decisao) } },
    });
    await tx.auditoria.create({
      data: { em: quem.em ?? new Date(), usuarioId: quem.id, acao: "DOCUMENTO_CORRIGIDO", entidade: "Documento", entidadeId: id, dados: { campos: mudancas.map((m) => m.campo) } },
    });
    return decisao;
  });
}

/**
 * Aprova um documento em revisão.
 * - Analista: só sem nenhuma regra bloqueando e dentro da alçada.
 * - Gestor: pode aprovar acima da alçada (V9) e, com justificativa, apesar de uma regra
 *   (ex.: boleto vencido que será pago com juros).
 */
export async function aprovar(db: Db, id: string, quem: Quem, justificativa?: string) {
  return emSerializavel(db, async (tx) => {
    const d = await carregar(tx, id);
    if (d.status !== "EM_REVISAO") throw new ErroDeRevisao("Este documento não está em revisão.");
    const decisao = await revalidar(tx, d, d.dados as unknown as Documento);
    const bloqueios = decisao.violacoes.filter((v) => v.severidade === "BLOQUEIA" && v.regra !== "V9");

    if (decisao.exigeGestor && quem.papel !== "GESTOR") throw new ErroDeRevisao("Acima da alçada: só o gestor aprova.");
    if (bloqueios.length > 0) {
      if (quem.papel !== "GESTOR") throw new ErroDeRevisao("Ainda há regras bloqueando. Corrija os campos ou rejeite.");
      if (!justificativa?.trim()) throw new ErroDeRevisao("Para aprovar apesar de uma regra, escreva a justificativa.");
    }

    await tx.documento.update({
      where: { id },
      data: { status: "APROVADO", decididoPorId: quem.id, decididoEm: quem.em ?? new Date(), motivo: bloqueios.length > 0 ? justificativa!.trim() : null },
    });
    await tx.auditoria.create({
      data: {
        em: quem.em ?? new Date(),
        usuarioId: quem.id,
        acao: "DOCUMENTO_APROVADO",
        entidade: "Documento",
        entidadeId: id,
        dados: { apesarDe: bloqueios.map((b) => b.codigo), justificativa: justificativa ?? null },
      },
    });
  });
}

export async function rejeitar(db: Db, id: string, quem: Quem, motivo: string) {
  if (!motivo.trim()) throw new ErroDeRevisao("Informe o motivo da rejeição.");
  return emSerializavel(db, async (tx) => {
    const d = await carregar(tx, id);
    if (d.status !== "EM_REVISAO" && d.status !== "FALHA_EXTRACAO") throw new ErroDeRevisao("Este documento não pode ser rejeitado.");
    await tx.documento.update({ where: { id }, data: { status: "REJEITADO", decididoPorId: quem.id, decididoEm: quem.em ?? new Date(), motivo: motivo.trim() } });
    await tx.auditoria.create({ data: { em: quem.em ?? new Date(), usuarioId: quem.id, acao: "DOCUMENTO_REJEITADO", entidade: "Documento", entidadeId: id, dados: { motivo } } });
  });
}
