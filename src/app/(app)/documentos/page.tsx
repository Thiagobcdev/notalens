import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeStatus, rotuloTipo } from "@/components/status";
import { Badge, Card, Skeleton } from "@/components/ui";
import { dataBR, formatarBRL, isoDeData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { exigirPapel } from "@/server/auth";
import { ABAS, lerFiltros, listarDocumentos, type Aba, type Filtros, type LinhaDocumento } from "@/server/consultas/documentos";

export const metadata: Metadata = { title: "Documentos" };

export default function DocumentosPage({ searchParams }: PageProps<"/documentos">) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Documentos</h1>
          <p className="text-sm text-muted">Notas fiscais e boletos recebidos, conferidos pelas regras V1–V9.</p>
        </div>
        <Link href="/enviar" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand/90">
          Enviar PDFs
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function urlCom(f: Filtros, mudancas: Partial<Filtros>) {
  const g = { ...f, pagina: 1, ...mudancas };
  const p = new URLSearchParams();
  if (g.aba !== "fila") p.set("aba", g.aba);
  if (g.tipo) p.set("tipo", g.tipo);
  if (g.fornecedorId) p.set("fornecedor", g.fornecedorId);
  if (g.pagina > 1) p.set("pagina", String(g.pagina));
  const q = p.toString();
  return q ? `/documentos?${q}` : "/documentos";
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/documentos">["searchParams"] }) {
  await exigirPapel("ANALISTA", "GESTOR");
  const f = lerFiltros(await searchParams);
  const { itens, total, contagens, fornecedores, paginas } = await listarDocumentos(f);

  return (
    <div className="space-y-4">
      <nav aria-label="Situação" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {(Object.keys(ABAS) as Aba[]).map((aba) => (
          <Link
            key={aba}
            href={urlCom(f, { aba })}
            aria-current={f.aba === aba ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
              f.aba === aba ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {ABAS[aba].rotulo}
            <span className="tabular text-xs opacity-75">{contagens[aba]}</span>
          </Link>
        ))}
      </nav>

      <form action="/documentos" className="flex flex-wrap items-end gap-3">
        {f.aba !== "fila" && <input type="hidden" name="aba" value={f.aba} />}
        <div className="space-y-1">
          <label htmlFor="tipo" className="text-xs font-medium text-muted">
            Tipo
          </label>
          <select id="tipo" name="tipo" defaultValue={f.tipo ?? ""} className="block h-9 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">Todos</option>
            <option value="NFE">NF-e</option>
            <option value="BOLETO">Boleto</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="fornecedor" className="text-xs font-medium text-muted">
            Fornecedor
          </label>
          <select
            id="fornecedor"
            name="fornecedor"
            defaultValue={f.fornecedorId ?? ""}
            className="block h-9 max-w-[16rem] rounded-lg border border-line bg-surface px-2 text-sm"
          >
            <option value="">Todos</option>
            {fornecedores.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2">
          Filtrar
        </button>
        {(f.tipo || f.fornecedorId) && (
          <Link href={urlCom(f, { tipo: null, fornecedorId: null })} className="h-9 px-1 text-sm leading-9 text-muted underline-offset-4 hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {itens.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {f.aba === "fila" ? "Nenhum documento esperando revisão." : "Nenhum documento com esses filtros."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line md:hidden">
            {itens.map((d) => (
              <li key={d.id}>
                <ItemCompacto d={d} />
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">
              {ABAS[f.aba].rotulo}: {total} documento(s)
            </caption>
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Recebido</th>
                <th scope="col" className="px-4 py-2 font-medium">Documento</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Valor</th>
                <th scope="col" className="px-4 py-2 font-medium">Vencimento</th>
                <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                <th scope="col" className="px-4 py-2 font-medium"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {itens.map((d) => (
                <tr key={d.id} className="align-top">
                  <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{dataBR(isoDeData(d.recebidoEm))}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {rotuloTipo(d.tipo)} {d.numero && <span className="tabular">nº {d.numero}</span>}
                    </p>
                    <p className="text-muted">{d.fornecedor?.nome ?? <span className="italic">fornecedor não identificado</span>}</p>
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-right">{d.valorCentavos === null ? "—" : formatarBRL(d.valorCentavos)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3">
                    {d.vencimento ? dataBR(isoDeData(d.vencimento)) : "—"}
                    {d.urgente && d.status === "EM_REVISAO" && (
                      <Badge tom="neg" className="ml-2">
                        Urgente
                      </Badge>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <Situacao d={d} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Acoes d={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Página {f.pagina} de {paginas} · {total} documentos
          </span>
          <span className="flex gap-2">
            {f.pagina > 1 && (
              <Link href={urlCom(f, { pagina: f.pagina - 1 })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">
                Anterior
              </Link>
            )}
            {f.pagina < paginas && (
              <Link href={urlCom(f, { pagina: f.pagina + 1 })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">
                Próxima
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}

function Situacao({ d }: { d: LinhaDocumento }) {
  const bloqueios = d.violacoes.filter((v) => v.severidade === "BLOQUEIA");
  const alertas = d.violacoes.filter((v) => v.severidade === "ALERTA");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <BadgeStatus status={d.status} />
        {d.exigeGestor && d.status === "EM_REVISAO" && <Badge tom="brand">Alçada do gestor</Badge>}
      </div>
      {d.status === "EM_REVISAO" && bloqueios[0] && (
        <p className="text-xs text-muted">
          <span className="font-medium text-fg">{bloqueios[0].regra}</span> {bloqueios[0].mensagem}
          {bloqueios.length > 1 && ` (+${bloqueios.length - 1})`}
        </p>
      )}
      {d.status !== "EM_REVISAO" && d.motivo && <p className="text-xs text-muted">{d.motivo}</p>}
      {alertas.length > 0 && d.status !== "EM_REVISAO" && (
        <p className="text-xs text-warn">
          {alertas.length} alerta{alertas.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function Acoes({ d }: { d: LinhaDocumento }) {
  return (
    <span className="inline-flex gap-3 text-sm">
      {d.tipo && (
        <Link href={`/revisao/${d.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
          {d.status === "EM_REVISAO" ? "Revisar" : "Detalhes"}
        </Link>
      )}
      <a href={`/documentos/${d.id}/pdf`} target="_blank" rel="noopener" className="text-muted underline-offset-4 hover:underline">
        PDF<span className="sr-only"> de {d.nomeArquivo} (abre em nova aba)</span>
      </a>
    </span>
  );
}

function ItemCompacto({ d }: { d: LinhaDocumento }) {
  return (
    <div className="space-y-2 px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {rotuloTipo(d.tipo)} {d.numero && <span className="tabular">nº {d.numero}</span>}
          </p>
          <p className="truncate text-muted">{d.fornecedor?.nome ?? "fornecedor não identificado"}</p>
        </div>
        <p className="tabular shrink-0 font-medium">{d.valorCentavos === null ? "—" : formatarBRL(d.valorCentavos)}</p>
      </div>
      <p className="tabular text-xs text-muted">
        Recebido {dataBR(isoDeData(d.recebidoEm))}
        {d.vencimento && ` · vence ${dataBR(isoDeData(d.vencimento))}`}
        {d.urgente && d.status === "EM_REVISAO" && (
          <Badge tom="neg" className="ml-2">
            Urgente
          </Badge>
        )}
      </p>
      <Situacao d={d} />
      <Acoes d={d} />
    </div>
  );
}
