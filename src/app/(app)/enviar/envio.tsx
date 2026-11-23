"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { enviarArquivo, type ResultadoEnvio } from "./actions";

const MAX_ARQUIVOS = 20;
const LIMITE_BYTES = 5 * 1024 * 1024;

type Item = { id: string; arquivo: File; estado: "aguardando" | "enviando" | "pronto"; resultado?: ResultadoEnvio };

const tamanho = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function Envio() {
  const [itens, setItens] = useState<Item[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const pendentes = itens.filter((i) => i.estado === "aguardando");
  const prontos = itens.filter((i) => i.resultado);

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novos = [...lista];
    const naoPdf = novos.filter((f) => !f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf");
    const aceitos = novos.filter((f) => !naoPdf.includes(f));
    const vagas = MAX_ARQUIVOS - pendentes.length;
    setAviso(
      [naoPdf.length > 0 && `${naoPdf.length} arquivo(s) ignorado(s): só PDF.`, aceitos.length > vagas && `Máximo de ${MAX_ARQUIVOS} arquivos por envio.`]
        .filter(Boolean)
        .join(" ") || null,
    );
    setItens((atual) => [
      ...atual,
      ...aceitos.slice(0, Math.max(0, vagas)).map((arquivo) => ({ id: crypto.randomUUID(), arquivo, estado: "aguardando" as const })),
    ]);
    if (input.current) input.current.value = "";
  }

  async function enviar() {
    setEnviando(true);
    // Um por vez, na ordem escolhida: a nota precisa chegar antes do boleto dela (V6).
    for (const item of pendentes) {
      setItens((a) => a.map((i) => (i.id === item.id ? { ...i, estado: "enviando" } : i)));
      let resultado: ResultadoEnvio;
      if (item.arquivo.size > LIMITE_BYTES) {
        resultado = { ok: false, erro: "Arquivo maior que 5 MB." };
      } else {
        const form = new FormData();
        form.set("arquivo", item.arquivo);
        try {
          resultado = await enviarArquivo(form);
        } catch {
          resultado = { ok: false, erro: "Falha de conexão. Tente de novo." };
        }
      }
      setItens((a) => a.map((i) => (i.id === item.id ? { ...i, estado: "pronto", resultado } : i)));
    }
    setEnviando(false);
    router.refresh(); // atualiza o contador da fila no menu
  }

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    adicionar(e.dataTransfer.files);
  };

  const aprovados = prontos.filter((i) => i.resultado?.ok && i.resultado.status === "APROVADO_AUTO").length;
  const revisao = prontos.filter((i) => i.resultado?.ok && i.resultado.status === "EM_REVISAO").length;
  const falhas = prontos.length - aprovados - revisao;

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={cn(
          "rounded-xl border-2 border-dashed border-line bg-surface p-8 text-center transition-colors",
          arrastando && "border-brand bg-brand/5",
        )}
      >
        <input
          ref={input}
          id="arquivos"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="peer sr-only"
          onChange={(e) => adicionar(e.target.files)}
          disabled={enviando}
        />
        <label
          htmlFor="arquivos"
          className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2 peer-focus-visible:outline-2 peer-focus-visible:outline-brand"
        >
          Escolher PDFs
        </label>
        <p className="mt-3 text-sm text-muted">ou arraste os arquivos para cá · DANFE de NF-e ou boleto · até 5 MB cada, {MAX_ARQUIVOS} por vez</p>
        {aviso && (
          <p role="alert" className="mt-2 text-sm text-warn">
            {aviso}
          </p>
        )}
      </div>

      {itens.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <p className="text-sm" aria-live="polite">
              {prontos.length === 0 ? (
                `${pendentes.length} arquivo(s) pronto(s) para enviar`
              ) : (
                <>
                  <span className="text-pos">{aprovados} aprovado(s) automaticamente</span> ·{" "}
                  <span className="text-warn">{revisao} para revisão</span>
                  {falhas > 0 && (
                    <>
                      {" "}
                      · <span className="text-neg">{falhas} com falha</span>
                    </>
                  )}
                </>
              )}
            </p>
            <div className="flex gap-2">
              {!enviando && itens.length > 0 && (
                <Button variante="secundario" type="button" onClick={() => setItens([])}>
                  Limpar lista
                </Button>
              )}
              <Button type="button" onClick={enviar} disabled={enviando || pendentes.length === 0}>
                {enviando ? "Processando…" : `Enviar ${pendentes.length || ""}`.trim()}
              </Button>
            </div>
          </div>
          <ol className="divide-y divide-line">
            {itens.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.arquivo.name}</p>
                  <p className="text-xs text-muted">
                    {tamanho(i.arquivo.size)}
                    {i.resultado?.ok && i.resultado.leitura && ` · lido por ${i.resultado.leitura}`}
                  </p>
                  {i.resultado?.ok && i.resultado.violacoes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {i.resultado.violacoes.map((v, k) => (
                        <li key={k} className={v.severidade === "BLOQUEIA" ? "text-fg" : "text-warn"}>
                          <span className="font-medium">{v.regra}</span> {v.mensagem}
                        </li>
                      ))}
                    </ul>
                  )}
                  {i.resultado && (!i.resultado.ok || i.resultado.erro) && <p className="mt-1 text-xs text-neg">{i.resultado.erro}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Estado item={i} />
                  {i.resultado?.ok && i.resultado.status === "EM_REVISAO" && (
                    <Link href={`/revisao/${i.resultado.documentoId}`} className="font-medium text-brand underline-offset-4 hover:underline">
                      Revisar
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function Estado({ item }: { item: Item }) {
  if (item.estado === "aguardando") return <Badge>Aguardando</Badge>;
  if (item.estado === "enviando") return <Badge tom="brand">Lendo e conferindo…</Badge>;
  const r = item.resultado!;
  if (!r.ok || r.status === "FALHA_EXTRACAO") return <Badge tom="neg">Falhou</Badge>;
  if (r.status === "APROVADO_AUTO") return <Badge tom="pos">Aprovado automático</Badge>;
  return (
    <span className="flex gap-1">
      {r.urgente && <Badge tom="neg">Urgente</Badge>}
      {r.exigeGestor && <Badge tom="brand">Alçada</Badge>}
      <Badge tom="warn">Em revisão</Badge>
    </span>
  );
}
