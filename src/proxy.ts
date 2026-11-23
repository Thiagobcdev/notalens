/**
 * Checagem otimista de autenticação e papel por rota (roda antes da renderização).
 * A checagem definitiva acontece na camada de dados (src/server/auth.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, HOME_DO_PAPEL, verificarSessao, type PapelSessao } from "@/server/token";

/** Rotas só do gestor. As demais áreas logadas valem para os dois papéis. */
const AREAS: Record<string, PapelSessao> = {
  "/painel": "GESTOR",
  "/fornecedores": "GESTOR",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessao = await verificarSessao(request.cookies.get(COOKIE_SESSAO)?.value);

  if (pathname === "/login") {
    return sessao ? NextResponse.redirect(new URL(HOME_DO_PAPEL[sessao.papel], request.url)) : NextResponse.next();
  }

  if (!sessao) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("de", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(HOME_DO_PAPEL[sessao.papel], request.url));
  }

  const area = Object.keys(AREAS).find((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
  if (area && AREAS[area] !== sessao.papel) {
    return NextResponse.redirect(new URL(HOME_DO_PAPEL[sessao.papel], request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Tudo, exceto arquivos estáticos e internos do Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
