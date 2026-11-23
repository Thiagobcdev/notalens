"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { extracaoBrutaSchema, normalizar, type Violacao } from "@/domain/documentos";
import { exigirPapel } from "@/server/auth";
import { proximoDaFila } from "@/server/consultas/revisao";
import { prisma } from "@/server/db";
import { aprovar, corrigir, ErroDeRevisao, rejeitar } from "@/server/revisao";

export type ResultadoAcao = { ok: true; violacoes: Violacao[] } | { ok: false; erro: string };

const id = z.string().min(1).max(40);

async function irParaProximo(atual: string): Promise<never> {
  const proximo = await proximoDaFila(atual);
  redirect(proximo ? `/revisao/${proximo}?feito=${atual}` : `/documentos?feito=${atual}`);
}

/** Salva as correções e roda as regras de novo no servidor (com contexto atualizado). */
export async function salvarCorrecoes(docId: string, bruto: unknown): Promise<ResultadoAcao> {
  const u = await exigirPapel("ANALISTA", "GESTOR");
  const dados = extracaoBrutaSchema.safeParse(bruto);
  if (!id.safeParse(docId).success || !dados.success) return { ok: false, erro: "Dados inválidos." };
  try {
    const decisao = await corrigir(prisma, docId, normalizar(dados.data), u);
    return { ok: true, violacoes: decisao.violacoes };
  } catch (e) {
    if (e instanceof ErroDeRevisao) return { ok: false, erro: e.message };
    throw e;
  }
}

/** Salva o que mudou (se mudou), aprova e vai para o próximo da fila. */
export async function aprovarDocumento(docId: string, bruto: unknown | null, justificativa: string): Promise<ResultadoAcao> {
  const u = await exigirPapel("ANALISTA", "GESTOR");
  if (!id.safeParse(docId).success) return { ok: false, erro: "Documento inválido." };
  try {
    if (bruto !== null) {
      const dados = extracaoBrutaSchema.safeParse(bruto);
      if (!dados.success) return { ok: false, erro: "Dados inválidos." };
      await corrigir(prisma, docId, normalizar(dados.data), u);
    }
    await aprovar(prisma, docId, u, justificativa.slice(0, 500) || undefined);
  } catch (e) {
    if (e instanceof ErroDeRevisao) return { ok: false, erro: e.message };
    throw e;
  }
  return irParaProximo(docId);
}

export async function rejeitarDocumento(docId: string, motivo: string): Promise<ResultadoAcao> {
  const u = await exigirPapel("ANALISTA", "GESTOR");
  if (!id.safeParse(docId).success) return { ok: false, erro: "Documento inválido." };
  try {
    await rejeitar(prisma, docId, u, motivo.slice(0, 500));
  } catch (e) {
    if (e instanceof ErroDeRevisao) return { ok: false, erro: e.message };
    throw e;
  }
  return irParaProximo(docId);
}
