/**
 * Camada de acesso à sessão (Data Access Layer).
 * Com cacheComponents, ler cookies só é permitido dentro de um <Suspense>:
 * chame estas funções em componentes envolvidos por Suspense, nunca no topo de um layout.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import {
  assinarSessao,
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  HOME_DO_PAPEL,
  verificarSessao,
  type DadosSessao,
  type PapelSessao,
} from "./token";

export type UsuarioAtual = {
  id: string;
  nome: string;
  email: string;
  papel: PapelSessao;
};

export async function iniciarSessao(dados: DadosSessao): Promise<void> {
  const token = await assinarSessao(dados);
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE_SESSAO);
}

/** Usuário logado (verificado no banco a cada request) ou redireciona para /login. */
export async function getUsuarioAtual(): Promise<UsuarioAtual> {
  const sessao = await verificarSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!sessao) redirect("/login");

  const u = await prisma.usuario.findUnique({
    where: { id: sessao.usuarioId },
    select: { id: true, nome: true, email: true, papel: true },
  });
  // Usuário removido ou papel alterado desde o login: a sessão não vale mais. Vai para /sair, que apaga o
  // cookie; mandar direto para /login criaria um laço (o proxy vê o token válido e devolve para cá).
  if (!u || u.papel !== sessao.papel) redirect("/sair");
  return u;
}

/**
 * Exige um dos papéis. Defesa em profundidade: o proxy já filtra por rota,
 * mas toda leitura de dados também confere o papel aqui.
 */
export async function exigirPapel(...papeis: PapelSessao[]): Promise<UsuarioAtual> {
  const u = await getUsuarioAtual();
  if (!papeis.includes(u.papel)) redirect(HOME_DO_PAPEL[u.papel]);
  return u;
}
