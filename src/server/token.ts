/**
 * Token de sessão (JWT HS256 com `jose`). Sem dependência de Next ou banco,
 * então pode ser usado tanto no proxy quanto nos Server Components.
 */
import { jwtVerify, SignJWT } from "jose";

export const COOKIE_SESSAO = "nl_sessao";
export const DURACAO_SESSAO_S = 8 * 60 * 60; // 8 horas (um expediente)

export type PapelSessao = "ANALISTA" | "GESTOR";
export type DadosSessao = { usuarioId: string; papel: PapelSessao };

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres) — veja .env.example");
  }
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(dados: DadosSessao): Promise<string> {
  return new SignJWT({ papel: dados.papel })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(dados.usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(chave());
}

/** Retorna os dados da sessão ou null se o token for inválido/expirado. */
export async function verificarSessao(token: string | undefined): Promise<DadosSessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    const papel = payload.papel;
    if (!payload.sub || (papel !== "ANALISTA" && papel !== "GESTOR")) return null;
    return { usuarioId: payload.sub, papel };
  } catch {
    return null;
  }
}

/** Página inicial de cada papel. */
export const HOME_DO_PAPEL: Record<PapelSessao, string> = {
  ANALISTA: "/documentos",
  GESTOR: "/painel",
};
