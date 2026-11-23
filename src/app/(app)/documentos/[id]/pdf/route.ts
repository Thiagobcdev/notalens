import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { lerPdf } from "@/server/storage";
import { COOKIE_SESSAO, verificarSessao } from "@/server/token";

/** Serve o PDF original de um documento, só para usuários logados. */
export async function GET(_req: Request, ctx: RouteContext<"/documentos/[id]/pdf">) {
  const sessao = await verificarSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!sessao) return new Response("Não autenticado", { status: 401 });

  const { id } = await ctx.params;
  const doc = await prisma.documento.findUnique({ where: { id }, select: { hashArquivo: true, nomeArquivo: true } });
  if (!doc) return new Response("Documento não encontrado", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await lerPdf(doc.hashArquivo);
  } catch {
    return new Response("Arquivo não encontrado no armazenamento", { status: 404 });
  }
  const nome = doc.nomeArquivo.replace(/[^\w.\-]+/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store", // documento financeiro: nada fica no cache depois do logout
      "X-Content-Type-Options": "nosniff",
    },
  });
}
