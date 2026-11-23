"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { decidir, normalizar, type ExtracaoBruta, type Violacao } from "@/domain/documentos";
import { campoBruto, rotuloCampo } from "@/lib/campos";
import { desserializarContexto, type ContextoSerializado } from "@/lib/contexto";
import { cn } from "@/lib/utils";
import { aprovarDocumento, rejeitarDocumento, salvarCorrecoes } from "./actions";

type Props = {
  id: string;
  editavel: boolean;
  papel: "ANALISTA" | "GESTOR";
  inicial: ExtracaoBruta;
  leituraDaIa: ExtracaoBruta;
  contexto: ContextoSerializado;
};

/** Achata qualquer objeto em "caminho.com.indice" → valor folha. */
function achatar(obj: unknown, prefixo = "", out: Record<string, unknown> = {}) {
  if (Array.isArray(obj)) obj.forEach((v, i) => achatar(v, `${prefixo}.${i}`, out));
  else if (obj !== null && typeof obj === "object") for (const [k, v] of Object.entries(obj)) achatar(v, prefixo ? `${prefixo}.${k}` : k, out);
  else out[prefixo] = obj;
  return out;
}

/** Atualização imutável por caminho ("itens.2.quantidade"). */
function comValor<T>(obj: T, caminho: string, valor: unknown): T {
  const [cabeca, ...resto] = caminho.split(".");
  const copia: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) };
  const chave = Array.isArray(copia) ? Number(cabeca) : cabeca;
  (copia as Record<string | number, unknown>)[chave] =
    resto.length === 0 ? valor : comValor((copia as Record<string | number, unknown>)[chave], resto.join("."), valor);
  return copia as T;
}

export function Revisao({ id, editavel, papel, inicial, leituraDaIa, contexto }: Props) {
  const router = useRouter();
  const [bruto, setBruto] = useState<ExtracaoBruta>(inicial);
  const [base, setBase] = useState<ExtracaoBruta>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvoAgora, setSalvoAgora] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();

  const ctx = useMemo(() => desserializarContexto(contexto), [contexto]);
  // O MESMO motor do servidor, rodando a cada tecla.
  const { decisao, invalidos } = useMemo(() => {
    const doc = normalizar(bruto);
    const lido = achatar(doc);
    const digitado = achatar(bruto);
    const invalidos = new Set(
      Object.entries(digitado)
        .filter(([c, v]) => typeof v === "string" && v.trim() !== "" && lidoDe(lido, c) === null)
        .map(([c]) => c),
    );
    return { decisao: decidir(doc, ctx), invalidos };
  }, [bruto, ctx]);

  const ia = useMemo(() => achatar(leituraDaIa), [leituraDaIa]);
  const sujo = JSON.stringify(bruto) !== JSON.stringify(base);
  const porCampo = new Map<string, Violacao[]>();
  for (const v of decisao.violacoes) {
    const c = campoBruto(v.campo);
    porCampo.set(c, [...(porCampo.get(c) ?? []), v]);
  }

  const bloqueios = decisao.violacoes.filter((v) => v.severidade === "BLOQUEIA" && v.regra !== "V9");
  const alertas = decisao.violacoes.filter((v) => v.severidade === "ALERTA");
  const podeAprovar =
    invalidos.size === 0 && (papel === "GESTOR" ? bloqueios.length === 0 || justificativa.trim().length >= 10 : bloqueios.length === 0 && !decisao.exigeGestor);
  const motivoBloqueio =
    invalidos.size > 0
      ? "Há campos com valor inválido."
      : papel === "ANALISTA" && bloqueios.length > 0
        ? "Ainda há regras bloqueando: corrija os campos ou rejeite."
        : papel === "ANALISTA" && decisao.exigeGestor
          ? "Acima da alçada: a aprovação é do gestor."
          : papel === "GESTOR" && bloqueios.length > 0 && justificativa.trim().length < 10
            ? "Para aprovar apesar das regras, escreva a justificativa (mín. 10 caracteres)."
            : null;

  const set = (caminho: string, valor: unknown) => {
    setSalvoAgora(false);
    setBruto((b) => comValor(b, caminho, valor));
  };

  const campo = (caminho: string, opcoes: { mono?: boolean; largo?: boolean; placeholder?: string } = {}) => (
    <Campo
      key={caminho}
      caminho={caminho}
      valor={(achatar(bruto)[caminho] as string | null) ?? ""}
      ia={ia[caminho] as string | null | undefined}
      violacoes={porCampo.get(caminho) ?? []}
      invalido={invalidos.has(caminho)}
      editavel={editavel}
      onChange={(v) => set(caminho, v)}
      {...opcoes}
    />
  );

  function executar(acao: () => Promise<{ ok: boolean; erro?: string } | void>, depois?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r && !r.ok) setErro(r.erro ?? "Não foi possível concluir.");
      else depois?.();
    });
  }

  return (
    <div className="space-y-4">
      <Card aria-live="polite" className="px-5 py-4">
        {decisao.violacoes.length === 0 ? (
          <p className="text-sm text-pos">Tudo certo: o documento passa em todas as regras.</p>
        ) : (
          <div className="space-y-3">
            {[...bloqueios, ...decisao.violacoes.filter((v) => v.regra === "V9")].length > 0 && (
              <ListaRegras titulo="Bloqueiam a aprovação" violacoes={[...bloqueios, ...decisao.violacoes.filter((v) => v.regra === "V9")]} tom="neg" />
            )}
            {alertas.length > 0 && <ListaRegras titulo="Alertas" violacoes={alertas} tom="warn" />}
          </div>
        )}
        {editavel && (
          <p className="mt-3 text-xs text-muted">
            As regras rodam no navegador a cada alteração. Duplicidade (V4) e fornecedor/nota (V6) são confirmados de novo no servidor ao salvar.
          </p>
        )}
      </Card>

      {bruto.tipo === "NFE" ? (
        <>
          <Secao titulo="Identificação">
            <div className="sm:col-span-2">{campo("chaveAcesso", { mono: true, largo: true })}</div>
            {campo("numero")}
            {campo("serie")}
            {campo("dataEmissao", { placeholder: "DD/MM/AAAA" })}
          </Secao>
          <Secao titulo="Emitente e destinatário">
            <div className="sm:col-span-2">{campo("emitenteNome")}</div>
            {campo("emitenteCnpj", { mono: true })}
            {campo("destinatarioCnpj", { mono: true })}
          </Secao>
          <Card>
            <h2 className="flex items-center justify-between border-b border-line px-5 py-3 text-sm font-semibold">
              Itens
              {editavel && (
                <button
                  type="button"
                  className="text-sm font-normal text-brand underline-offset-4 hover:underline"
                  onClick={() =>
                    bruto.tipo === "NFE" &&
                    set("itens", [...bruto.itens, { descricao: "", quantidade: "", valorUnitario: "", valorTotal: "" }])
                  }
                >
                  + item
                </button>
              )}
            </h2>
            <ol className="divide-y divide-line">
              {bruto.itens.map((_, i) => (
                <li key={i} className="grid gap-3 px-5 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
                  <div className="sm:col-span-4">{campo(`itens.${i}.descricao`)}</div>
                  {campo(`itens.${i}.quantidade`)}
                  {campo(`itens.${i}.valorUnitario`)}
                  {campo(`itens.${i}.valorTotal`)}
                  {editavel && (
                    <button
                      type="button"
                      aria-label={`Remover item ${i + 1}`}
                      className="mt-6 h-9 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-neg"
                      onClick={() => bruto.tipo === "NFE" && set("itens", bruto.itens.filter((__, k) => k !== i))}
                    >
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {porCampo.get("itens") && <p className="px-5 pb-3 text-sm text-neg">{porCampo.get("itens")![0].mensagem}</p>}
          </Card>
          <Secao titulo="Totais">
            {campo("totalProdutos")}
            {campo("frete")}
            {campo("ipi")}
            {campo("desconto")}
            {campo("totalNota")}
          </Secao>
          <Card>
            <h2 className="flex items-center justify-between border-b border-line px-5 py-3 text-sm font-semibold">
              Parcelas
              {editavel && (
                <button
                  type="button"
                  className="text-sm font-normal text-brand underline-offset-4 hover:underline"
                  onClick={() => bruto.tipo === "NFE" && set("duplicatas", [...bruto.duplicatas, { numero: "", vencimento: "", valor: "" }])}
                >
                  + parcela
                </button>
              )}
            </h2>
            {bruto.duplicatas.length === 0 ? (
              <p className="px-5 py-3 text-sm text-muted">Pagamento à vista (sem parcelas).</p>
            ) : (
              <ol className="divide-y divide-line">
                {bruto.duplicatas.map((_, i) => (
                  <li key={i} className="grid gap-3 px-5 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
                    {campo(`duplicatas.${i}.numero`)}
                    {campo(`duplicatas.${i}.vencimento`, { placeholder: "DD/MM/AAAA" })}
                    {campo(`duplicatas.${i}.valor`)}
                    {editavel && (
                      <button
                        type="button"
                        aria-label={`Remover parcela ${i + 1}`}
                        className="mt-6 h-9 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-neg"
                        onClick={() => bruto.tipo === "NFE" && set("duplicatas", bruto.duplicatas.filter((__, k) => k !== i))}
                      >
                        Remover
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {porCampo.get("duplicatas") && <p className="px-5 pb-3 text-sm text-neg">{porCampo.get("duplicatas")![0].mensagem}</p>}
          </Card>
        </>
      ) : (
        <>
          <Secao titulo="Código">
            <div className="sm:col-span-2">{campo("linhaDigitavel", { mono: true, largo: true })}</div>
            {campo("valor")}
            {campo("vencimento", { placeholder: "DD/MM/AAAA" })}
          </Secao>
          <Secao titulo="Partes">
            <div className="sm:col-span-2">{campo("beneficiarioNome")}</div>
            {campo("beneficiarioCnpj", { mono: true })}
            {campo("pagadorCnpj", { mono: true })}
            {campo("numeroDocumento")}
          </Secao>
        </>
      )}

      {editavel && (
        <Card className="space-y-3 px-5 py-4 lg:sticky lg:bottom-4">
          {erro && (
            <p role="alert" className="rounded-lg bg-neg-bg px-3 py-2 text-sm text-neg">
              {erro}
            </p>
          )}
          {papel === "GESTOR" && bloqueios.length > 0 && !rejeitando && (
            <div className="space-y-1">
              <label htmlFor="justificativa" className="text-sm font-medium">
                Justificativa para aprovar apesar das regras
              </label>
              <textarea
                id="justificativa"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ex.: pago com juros; o fornecedor enviou o boleto com atraso."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
          )}
          {rejeitando ? (
            <div className="space-y-2">
              <label htmlFor="motivo" className="text-sm font-medium">
                Motivo da rejeição
              </label>
              <textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                maxLength={500}
                autoFocus
                placeholder={bloqueios[0]?.mensagem ?? "Ex.: valor não confere com o pedido."}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-neg hover:bg-neg/90"
                  disabled={pendente || motivo.trim().length < 5}
                  onClick={() => executar(() => rejeitarDocumento(id, motivo))}
                >
                  {pendente ? "Rejeitando…" : "Confirmar rejeição"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setRejeitando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={pendente || !podeAprovar} onClick={() => executar(() => aprovarDocumento(id, sujo ? bruto : null, justificativa))}>
                {pendente ? "Salvando…" : sujo ? "Salvar e aprovar" : "Aprovar"}
              </Button>
              <Button
                type="button"
                variante="secundario"
                disabled={pendente || !sujo || invalidos.size > 0}
                onClick={() =>
                  executar(
                    () => salvarCorrecoes(id, bruto),
                    () => {
                      setBase(bruto);
                      setSalvoAgora(true);
                      router.refresh();
                    },
                  )
                }
              >
                Salvar correções
              </Button>
              <Button type="button" variante="secundario" disabled={pendente} onClick={() => setRejeitando(true)}>
                Rejeitar
              </Button>
              {sujo && (
                <button type="button" className="text-sm text-muted underline-offset-4 hover:underline" onClick={() => setBruto(base)}>
                  Desfazer alterações
                </button>
              )}
              <p className="w-full text-xs text-muted" aria-live="polite">
                {motivoBloqueio ?? (salvoAgora ? "Correções salvas." : sujo ? "Alterações ainda não salvas." : "")}
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/** Valor normalizado correspondente a um caminho do formulário ("totalNota" → "totalNotaCentavos"). */
function lidoDe(lido: Record<string, unknown>, caminhoBruto: string): unknown {
  if (caminhoBruto in lido) return lido[caminhoBruto];
  return lido[`${caminhoBruto}Centavos`] ?? null;
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">{titulo}</h2>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function ListaRegras({ titulo, violacoes, tom }: { titulo: string; violacoes: Violacao[]; tom: "neg" | "warn" }) {
  return (
    <div>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", tom === "neg" ? "text-neg" : "text-warn")}>{titulo}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {violacoes.map((v, i) => {
          const alvo = campoBruto(v.campo);
          const temCampo = !["arquivo", "valor"].includes(alvo);
          return (
            <li key={i} className="flex gap-2">
              <Badge tom={tom}>{v.regra}</Badge>
              <span>
                {temCampo ? (
                  <a href={`#campo-${alvo.replace(/\./g, "-")}`} className="font-medium underline-offset-4 hover:underline">
                    {rotuloCampo(v.campo)}
                  </a>
                ) : null}
                {temCampo ? ": " : ""}
                {v.mensagem}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Campo({
  caminho,
  valor,
  ia,
  violacoes,
  invalido,
  editavel,
  onChange,
  mono,
  placeholder,
}: {
  caminho: string;
  valor: string;
  ia: string | null | undefined;
  violacoes: Violacao[];
  invalido: boolean;
  editavel: boolean;
  onChange: (v: string) => void;
  mono?: boolean;
  largo?: boolean;
  placeholder?: string;
}) {
  const id = `campo-${caminho.replace(/\./g, "-")}`;
  const bloqueia = violacoes.some((v) => v.severidade === "BLOQUEIA");
  const alerta = !bloqueia && violacoes.length > 0;
  const mudouDaIa = ia !== undefined && (ia ?? "") !== valor;
  const ajuda = `${id}-ajuda`;
  const rotulo = rotuloCampo(caminho).replace(/^(Item|Parcela) \d+ · /, "");

  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!editavel}
        placeholder={placeholder}
        aria-invalid={bloqueia || invalido}
        aria-describedby={violacoes.length || invalido || mudouDaIa ? ajuda : undefined}
        className={cn(
          "tabular h-9 w-full rounded-lg border bg-surface px-3 text-sm read-only:bg-surface-2",
          mono && "font-mono text-[13px]",
          bloqueia || invalido ? "border-neg bg-neg-bg/40" : alerta ? "border-warn" : mudouDaIa ? "border-brand" : "border-line",
        )}
      />
      {(violacoes.length > 0 || invalido || mudouDaIa) && (
        <div id={ajuda} className="space-y-0.5 text-xs">
          {invalido && <p className="text-neg">Valor inválido.</p>}
          {violacoes.map((v, i) => (
            <p key={i} className={v.severidade === "BLOQUEIA" ? "text-neg" : "text-warn"}>
              {v.regra}: {v.mensagem}
            </p>
          ))}
          {mudouDaIa && <p className="text-brand">A IA leu: {ia === null || ia === "" ? "(vazio)" : ia}</p>}
        </div>
      )}
    </div>
  );
}

/** Documento cuja leitura falhou: só dá para rejeitar (e reenviar um arquivo melhor). */
export function RejeitarFalha({ id }: { id: string }) {
  const [motivo, setMotivo] = useState("Arquivo ilegível. Pedido reenvio ao fornecedor.");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      <label htmlFor="motivo-falha" className="text-sm font-medium">
        Motivo da rejeição
      </label>
      <textarea
        id="motivo-falha"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        maxLength={500}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      />
      {erro && (
        <p role="alert" className="text-sm text-neg">
          {erro}
        </p>
      )}
      <Button
        type="button"
        variante="secundario"
        disabled={pendente || motivo.trim().length < 5}
        onClick={() =>
          iniciar(async () => {
            const r = await rejeitarDocumento(id, motivo);
            if (r && !r.ok) setErro(r.erro);
          })
        }
      >
        Rejeitar
      </Button>
    </div>
  );
}
