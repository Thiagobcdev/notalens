import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { getUsuarioAtual } from "@/server/auth";
import { prisma } from "@/server/db";
import { sair } from "../login/actions";

const NAV = {
  ANALISTA: [
    { href: "/documentos", label: "Documentos", fila: true },
    { href: "/enviar", label: "Enviar PDFs" },
  ],
  GESTOR: [
    { href: "/painel", label: "Painel" },
    { href: "/documentos", label: "Documentos", fila: true },
    { href: "/enviar", label: "Enviar PDFs" },
    { href: "/fornecedores", label: "Fornecedores" },
  ],
} as const;

const NOME_PAPEL = { ANALISTA: "Analista de contas a pagar", GESTOR: "Gestora (alçada)" } as const;

/** Lê a sessão: fica dentro de <Suspense> (exigência do cacheComponents). */
async function Navegacao() {
  const [u, naFila] = await Promise.all([getUsuarioAtual(), prisma.documento.count({ where: { status: "EM_REVISAO" } })]);
  return (
    <>
      <nav aria-label="Principal" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {NAV[u.papel].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            {item.label}
            {"fila" in item && naFila > 0 && (
              <span className="tabular rounded-md bg-warn-bg px-1.5 text-xs text-warn">
                {naFila}
                <span className="sr-only"> em revisão</span>
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-3 md:mt-auto md:flex-col md:items-stretch md:border-t md:border-line md:pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{u.nome}</p>
          <p className="text-xs text-muted">{NOME_PAPEL[u.papel]}</p>
        </div>
        <form action={sair}>
          <button type="submit" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Sair
          </button>
        </form>
      </div>
    </>
  );
}

export default function AreaLogadaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col gap-4 border-b border-line bg-surface px-4 py-4 md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <p className="px-3 text-sm font-semibold text-brand">NotaLens</p>
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <Navegacao />
        </Suspense>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
