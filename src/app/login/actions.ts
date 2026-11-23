"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { encerrarSessao, iniciarSessao } from "@/server/auth";
import { prisma } from "@/server/db";
import { HOME_DO_PAPEL } from "@/server/token";

export type EstadoLogin = { erro?: string; email?: string };

const credenciais = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
  senha: z.string().min(1, "Informe a senha"),
});

// Hash fixo para comparar quando o e-mail não existe: o tempo de resposta não revela se a conta existe.
const HASH_FALSO = bcrypt.hashSync("conta-inexistente", 10);

export async function entrar(_anterior: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const dados = credenciais.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Dados inválidos", email: String(form.get("email") ?? "") };
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: dados.data.email } });
  const senhaOk = await bcrypt.compare(dados.data.senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !senhaOk) {
    return { erro: "E-mail ou senha incorretos", email: dados.data.email };
  }

  await iniciarSessao({ usuarioId: usuario.id, papel: usuario.papel });
  await prisma.auditoria.create({ data: { usuarioId: usuario.id, acao: "LOGIN", entidade: "Usuario", entidadeId: usuario.id } });
  redirect(HOME_DO_PAPEL[usuario.papel]);
}

export async function sair(): Promise<void> {
  await encerrarSessao();
  redirect("/login");
}
