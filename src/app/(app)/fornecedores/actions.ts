"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPapel } from "@/server/auth";
import { prisma } from "@/server/db";
import { criarFornecedor, definirAtivo, ErroDeFornecedor } from "@/server/fornecedores";

export type EstadoCadastro = { ok: boolean; mensagem: string | null; campos?: { cnpj: string; nome: string } };

const texto = z.string().max(200);

export async function cadastrarFornecedor(_: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const u = await exigirPapel("GESTOR");
  const cnpj = texto.safeParse(form.get("cnpj"));
  const nome = texto.safeParse(form.get("nome"));
  if (!cnpj.success || !nome.success) return { ok: false, mensagem: "Dados inválidos." };
  try {
    const f = await criarFornecedor(prisma, { cnpj: cnpj.data, nome: nome.data }, u);
    revalidatePath("/fornecedores");
    return { ok: true, mensagem: `${f.nome} cadastrado.` };
  } catch (e) {
    if (e instanceof ErroDeFornecedor) return { ok: false, mensagem: e.message, campos: { cnpj: cnpj.data, nome: nome.data } };
    throw e;
  }
}

export async function alternarFornecedor(form: FormData): Promise<void> {
  const u = await exigirPapel("GESTOR");
  const id = z.string().min(1).max(40).safeParse(form.get("id"));
  const ativo = form.get("ativo");
  if (!id.success || (ativo !== "true" && ativo !== "false")) return;
  try {
    await definirAtivo(prisma, id.data, ativo === "true", u);
  } catch (e) {
    if (!(e instanceof ErroDeFornecedor)) throw e;
  }
  revalidatePath("/fornecedores");
}
