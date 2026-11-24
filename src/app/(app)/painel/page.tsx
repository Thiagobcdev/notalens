import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { rotuloTipo } from "@/components/status";
import { Badge, Card, CardHeader, Skeleton, Stat } from "@/components/ui";
import { rotuloCampoGenerico } from "@/lib/campos";
import { dataBR, formatarBRL } from "@/lib/formato";
import { formatarUSD, porcento } from "@/lib/metricas";
import { rotuloCodigo } from "@/lib/regras";
import { cn } from "@/lib/utils";
import { exigirPapel } from "@/server/auth";
import { getPainel, lerPeriodo, PERIODOS, type Painel, type Periodo } from "@/server/consultas/painel";

export const metadata: Metadata = { title: "Painel" };

export default function PainelPage({ searchParams }: PageProps<"/painel">) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense fallback={<Skeleton className="h-[80vh] w-full" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const inteiro = (n: number) => n.toLocaleString("pt-BR");

/** Barra horizontal de uma cor só (magnitude). O número fica sempre escrito ao lado. */
function Barra({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-surface-2" title={rotulo} aria-hidden>
      <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%` }} />
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel">["searchParams"] }) {
  await exigirPapel("GESTOR");
  const periodo = lerPeriodo((await searchParams).periodo);
  const p = await getPainel(periodo);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Painel</h1>
          <p className="text-sm text-muted">
            {p.inicio ? `Documentos recebidos de ${dataBR(p.inicio)} a ${dataBR(p.hoje)}.` : "Nenhum documento recebido ainda."}
          </p>
        </div>
        <nav aria-label="Período" className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {(Object.keys(PERIODOS) as Periodo[]).map((k) => (
            <Link
              key={k}
              href={k === "90" ? "/painel" : `/painel?periodo=${k}`}
              aria-current={periodo === k ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 text-sm", periodo === k ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              {PERIODOS[k]}
            </Link>
          ))}
        </nav>
      </header>

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4 [&>div]:bg-surface">
        <Stat label="Recebidos" value={inteiro(p.total)} hint={p.status.FALHA_EXTRACAO ? `${p.status.FALHA_EXTRACAO} sem leitura` : "todos lidos"} />
        <Stat label="Aprovados sozinhos" value={porcento(p.taxaAuto)} hint={`${inteiro(p.automaticos)} de ${inteiro(p.lidos)} lidos`} tom="pos" />
        <Stat
          label="Lidos sem correção"
          value={p.aprovados ? porcento(p.aprovadosSemCorrecao / p.aprovados) : "—"}
          hint={`${inteiro(p.aprovadosSemCorrecao)} de ${inteiro(p.aprovados)} aprovados`}
        />
        <Stat label="Na fila agora" value={inteiro(p.status.EM_REVISAO)} hint={p.naAlcada ? `${p.naAlcada} na sua alçada` : "nenhum na sua alçada"} />
      </Card>

      {p.naAlcada > 0 && <Alcada p={p} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Semanas p={p} />
        <Motivos p={p} />
      </div>

      <Acerto p={p} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Leitura p={p} />
        <RevisaoHumana p={p} />
      </div>
    </>
  );
}

function Alcada({ p }: { p: Painel }) {
  return (
    <Card>
      <CardHeader
        title="Esperando a sua alçada"
        description="Acima de R$ 10.000,00 (regra V9), só a gestora aprova, mesmo que todas as regras passem."
        action={
          p.naAlcada > p.alcada.length ? (
            <Link href="/documentos" className="text-sm text-brand underline-offset-4 hover:underline">
              Ver todos ({p.naAlcada})
            </Link>
          ) : undefined
        }
      />
      <ul className="divide-y divide-line">
        {p.alcada.map((d) => (
          <li key={d.id}>
            <Link href={`/revisao/${d.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-surface-2">
              <span className="min-w-0">
                <span className="font-medium">{d.fornecedor?.nome ?? "Fornecedor não identificado"}</span>
                <span className="text-muted">
                  {" · "}
                  {rotuloTipo(d.tipo)} {d.numero}
                  {d.vencimento && ` · vence ${dataBR(d.vencimento)}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {d.urgente && <Badge tom="neg">Urgente</Badge>}
                <span className="tabular font-semibold">{d.valorCentavos !== null ? formatarBRL(d.valorCentavos) : "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Semanas({ p }: { p: Painel }) {
  return (
    <Card>
      <CardHeader title="Aprovação automática por semana" description="Dos documentos recebidos na semana, quantos passaram em tudo e foram aprovados sem ninguém olhar." />
      {p.semanas.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Sem documentos no período.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Taxa de aprovação automática por semana</caption>
          <thead className="text-left text-xs text-muted">
            <tr>
              <th scope="col" className="whitespace-nowrap px-5 py-2 font-medium">Semana de</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Recebidos</th>
              <th scope="col" className="w-full px-5 py-2 font-medium">Aprovados sozinhos</th>
            </tr>
          </thead>
          <tbody>
            {p.semanas.map((s) => (
              <tr key={s.inicio}>
                <th scope="row" className="tabular whitespace-nowrap px-5 py-1.5 text-left font-normal">{dataBR(s.inicio).slice(0, 5)}</th>
                <td className="tabular px-2 py-1.5 text-right">{s.recebidos}</td>
                <td className="px-5 py-1.5">
                  <div className="flex items-center gap-3">
                    <Barra fracao={s.taxa} rotulo={`${s.automaticos} de ${s.recebidos}`} />
                    <span className="tabular w-10 shrink-0 text-right">{porcento(s.taxa)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Motivos({ p }: { p: Painel }) {
  const top = p.motivos.slice(0, 8);
  const maior = top[0]?.documentos ?? 0;
  return (
    <Card>
      <CardHeader
        title="Por que vão para a revisão"
        description={`Regras que barraram os documentos na chegada, antes de qualquer correção. ${p.foramParaRevisao} documento(s) foram para a fila.`}
      />
      {top.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nenhuma regra barrou documentos no período.</p>
      ) : (
        <ul className="space-y-3 px-5 py-4 text-sm">
          {top.map((m) => (
            <li key={m.codigo} className="space-y-1">
              <div className="flex justify-between gap-3">
                <span>{rotuloCodigo(m.codigo)}</span>
                <span className="tabular text-muted">{m.documentos}</span>
              </div>
              <Barra fracao={maior ? m.documentos / maior : 0} rotulo={`${m.documentos} documento(s)`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Acerto({ p }: { p: Painel }) {
  return (
    <Card>
      <CardHeader
        title="Acerto da IA por campo"
        description="Base: documentos aprovados no período. Quem foi aprovado sozinho conta como lido certo (passou em todas as regras); na revisão, cada campo corrigido conta um erro da IA. Só aparecem os campos que já precisaram de correção."
      />
      {p.campos.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nenhum campo corrigido no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Acerto da IA por campo, do pior para o melhor</caption>
            <thead className="text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">Campo</th>
                <th scope="col" className="px-2 py-2 font-medium max-sm:hidden">Tipo</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Corrigidos</th>
                <th scope="col" className="w-2/5 px-5 py-2 font-medium">Acerto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.campos.map((c) => (
                <tr key={`${c.tipo}-${c.campo}`}>
                  <th scope="row" className="px-5 py-2 text-left font-normal">
                    {rotuloCampoGenerico(c.campo)}
                    <span className="block text-xs text-muted sm:hidden">{rotuloTipo(c.tipo)}</span>
                  </th>
                  <td className="px-2 py-2 text-muted max-sm:hidden">{rotuloTipo(c.tipo)}</td>
                  <td className="tabular px-2 py-2 text-right">
                    {c.corrigidos} <span className="text-muted">de {c.lidos}</span>
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-3">
                      <Barra fracao={c.acerto} rotulo={`${c.lidos - c.corrigidos} de ${c.lidos} certos`} />
                      <span className="tabular w-10 shrink-0 text-right">{porcento(c.acerto)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Leitura({ p }: { p: Painel }) {
  const l = p.leitura;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Leitura pela IA: tempo e custo" description="Medidos em cada chamada real ao Claude. O custo é estimado pela tabela de preços (src/lib/metricas.ts)." />
      {l.reais === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          Nenhuma leitura real no período: {l.gravadas} documento(s) foram lidos pelas respostas gravadas da demonstração. Com{" "}
          <code className="font-mono">ANTHROPIC_API_KEY</code> configurada, cada PDF enviado passa pelo Claude e este quadro mostra tempo, tokens e custo por
          documento.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-px bg-line text-sm [&>div]:bg-surface [&>div]:px-5 [&>div]:py-3">
          <div>
            <dt className="text-xs text-muted">Custo médio por documento</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold">{l.custoMedio !== null ? formatarUSD(l.custoMedio) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Tempo de leitura (mediana)</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold">{l.duracaoMedianaMs !== null ? `${(l.duracaoMedianaMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Tokens médios (entrada / saída)</dt>
            <dd className="tabular mt-0.5">
              {l.tokensEntradaMedio !== null ? inteiro(l.tokensEntradaMedio) : "—"} / {l.tokensSaidaMedio !== null ? inteiro(l.tokensSaidaMedio) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Leituras reais · custo total</dt>
            <dd className="tabular mt-0.5">
              {l.reais} · {formatarUSD(l.custoTotal)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted">Modelos</dt>
            <dd className="mt-0.5 font-mono text-xs">{l.modelos.join(", ") || "—"}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function RevisaoHumana({ p }: { p: Painel }) {
  const r = p.revisao;
  const dias = r.diasAteDecisao;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Revisão humana" description="O que passou pela fila e foi decidido por uma pessoa." />
      <dl className="grid grid-cols-2 gap-px bg-line text-sm [&>div]:bg-surface [&>div]:px-5 [&>div]:py-3">
        <div>
          <dt className="text-xs text-muted">Decididos na revisão</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold">{r.decididos}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Do recebimento à decisão (mediana)</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold">{dias === null ? "—" : dias === 1 ? "1 dia" : `${dias.toLocaleString("pt-BR")} dias`}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Rejeitados</dt>
          <dd className="tabular mt-0.5">{r.rejeitados}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Aprovados apesar de uma regra</dt>
          <dd className="tabular mt-0.5">{r.aprovadosComJustificativa} <span className="text-muted">(com justificativa)</span></dd>
        </div>
      </dl>
    </Card>
  );
}
