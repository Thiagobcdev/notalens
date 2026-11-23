import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BadgeStatus, rotuloTipo } from "@/components/status";
import { Badge, Card, Skeleton } from "@/components/ui";
import { formatarValorCampo, rotuloCampo } from "@/lib/campos";
import { dataBR } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { getRevisao } from "@/server/consultas/revisao";
import { RejeitarFalha, Revisao } from "./revisao";

export const metadata: Metadata = { title: "Revisão" };

export default function RevisaoPage({ params, searchParams }: PageProps<"/revisao/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[80vh] w-full" />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

async function Conteudo({ params, searchParams }: Pick<PageProps<"/revisao/[id]">, "params" | "searchParams">) {
  const usuario = await exigirPapel("ANALISTA", "GESTOR");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const r = await getRevisao(id);
  if (!r) notFound();
  const acabouDeDecidir = typeof sp.feito === "string";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      {acabouDeDecidir && (
        <p role="status" className="rounded-lg bg-pos-bg px-4 py-2 text-sm text-pos">
          Decisão registrada. {r.status === "EM_REVISAO" ? "Este é o próximo da fila." : ""}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/documentos" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Documentos
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {rotuloTipo(r.tipo)} {r.formulario?.tipo === "NFE" && r.formulario.numero && <span className="tabular">nº {r.formulario.numero}</span>}
            {r.formulario?.tipo === "BOLETO" && r.formulario.numeroDocumento && <span className="tabular">{r.formulario.numeroDocumento}</span>}
          </h1>
          <p className="text-sm text-muted">
            {r.fornecedor?.nome ?? "Fornecedor não identificado"} · recebido em {dataBR(r.recebidoEm)} por {r.enviadoPor} · {r.nomeArquivo}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.urgente && r.status === "EM_REVISAO" && <Badge tom="neg">Urgente</Badge>}
          {r.exigeGestor && <Badge tom="brand">Alçada do gestor</Badge>}
          <BadgeStatus status={r.status} />
          {r.status === "EM_REVISAO" && (
            <span className="text-sm text-muted">
              {r.naFila} na fila
              {r.proximo && (
                <>
                  {" · "}
                  <Link href={`/revisao/${r.proximo}`} className="text-brand underline-offset-4 hover:underline">
                    pular para o próximo
                  </Link>
                </>
              )}
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm">
            <span className="font-medium">PDF recebido</span>
            <a href={`/documentos/${r.id}/pdf`} target="_blank" rel="noopener" className="text-brand underline-offset-4 hover:underline">
              Abrir em nova aba<span className="sr-only"> (PDF)</span>
            </a>
          </div>
          <iframe src={`/documentos/${r.id}/pdf#navpanes=0&view=FitH`} title={`PDF de ${r.nomeArquivo}`} className="h-[60vh] w-full bg-surface-2 lg:h-full" />
        </Card>

        <div className="space-y-4">
          {r.status !== "EM_REVISAO" && r.status !== "FALHA_EXTRACAO" && (
            <Card className="space-y-1 px-5 py-4 text-sm">
              <p>
                {r.status === "APROVADO_AUTO"
                  ? "Aprovado automaticamente: passou em todas as regras e está dentro da alçada."
                  : `${r.status === "APROVADO" ? "Aprovado" : "Rejeitado"} por ${r.decididoPor ?? "—"}${r.decididoEm ? ` em ${dataHora(r.decididoEm)}` : ""}.`}
              </p>
              {r.motivo && (
                <p className="text-muted">
                  {r.status === "APROVADO" ? "Justificativa" : "Motivo"}: {r.motivo}
                </p>
              )}
            </Card>
          )}

          {r.status === "FALHA_EXTRACAO" || !r.formulario || !r.contexto || !r.leituraDaIa ? (
            <Card className="space-y-3 px-5 py-4 text-sm">
              <p className="font-medium">A leitura deste arquivo falhou.</p>
              <p className="text-muted">{r.motivo}</p>
              {r.status === "FALHA_EXTRACAO" && <RejeitarFalha id={r.id} />}
            </Card>
          ) : (
            <Revisao
              id={r.id}
              editavel={r.status === "EM_REVISAO"}
              papel={usuario.papel}
              inicial={r.formulario}
              leituraDaIa={r.leituraDaIa}
              contexto={r.contexto}
            />
          )}

          {r.correcoes.length > 0 && (
            <Card>
              <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Correções feitas na revisão</h2>
              <table className="w-full text-sm">
                <caption className="sr-only">Campos corrigidos: o que a IA leu e o valor final</caption>
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium">Campo</th>
                    <th scope="col" className="px-5 py-2 font-medium">A IA leu</th>
                    <th scope="col" className="px-5 py-2 font-medium">Valor final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.correcoes.map((c) => (
                    <tr key={c.campo}>
                      <td className="px-5 py-2">{rotuloCampo(c.campo)}</td>
                      <td className="tabular px-5 py-2 text-muted line-through decoration-muted/50">{formatarValorCampo(c.campo, c.valorIa)}</td>
                      <td className="tabular px-5 py-2 font-medium">{formatarValorCampo(c.campo, c.valorFinal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {r.extracao && (
            <p className="text-xs text-muted">
              Leitura: {r.extracao.origem === "GRAVADA" ? "resposta gravada (demonstração sem chave de API)" : `Claude (${r.extracao.modelo})`}
              {r.extracao.duracaoMs !== null && ` · ${r.extracao.duracaoMs} ms`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
