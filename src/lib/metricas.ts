import { campoGenerico } from "@/domain/documentos";

/**
 * Métricas do painel do gestor. Funções puras (testadas): a consulta busca as linhas,
 * aqui elas viram números. Sem float em dinheiro: o custo é inteiro, em 1e-8 dólar.
 */

type Tipo = "NFE" | "BOLETO";

// ---------------------------------------------------------------- custo da IA

/** Preço por milhão de tokens, em centavos de dólar (entrada, saída). Fonte: tabela pública da Anthropic. */
export const PRECOS: { prefixo: string; entrada: number; saida: number }[] = [
  { prefixo: "claude-sonnet-5", entrada: 200, saida: 1000 }, // Sonnet 5 e 5.5: US$ 2 / US$ 10
  { prefixo: "claude-opus-5", entrada: 400, saida: 2000 }, // Opus 5.5: US$ 4 / US$ 20
  { prefixo: "claude-haiku-5", entrada: 10, saida: 50 }, // Haiku 5.5: US$ 0,10 / US$ 0,50 (até 100K tokens)
];

/**
 * Custo estimado em unidades de 1e-8 dólar (centavo × token / milhão), ou null se o modelo
 * não está na tabela. Conta a leitura de cache pelo preço cheio: é uma estimativa para cima.
 */
export function custoEstimado(modelo: string | null, tokensEntrada: number | null, tokensSaida: number | null): number | null {
  if (!modelo || tokensEntrada === null || tokensSaida === null) return null;
  const p = PRECOS.find((x) => modelo.startsWith(x.prefixo));
  return p ? tokensEntrada * p.entrada + tokensSaida * p.saida : null;
}

/** 1e-8 dólar → "US$ 0,0123" (só para exibir). */
export function formatarUSD(unidades: number): string {
  const dolares = unidades / 1e8;
  const casas = dolares < 1 ? 4 : 2;
  return `US$ ${dolares.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

// ---------------------------------------------------------------- acerto da IA

export type AcertoCampo = { tipo: Tipo; campo: string; lidos: number; corrigidos: number; acerto: number };

/**
 * Acerto da IA por campo, nos documentos APROVADOS (o valor final foi conferido: pelas regras,
 * no automático, ou por uma pessoa, na revisão). Um campo de item conta uma vez por documento:
 * "itens.0.quantidade" e "itens.3.quantidade" corrigidos no mesmo documento = 1 erro em "itens.quantidade".
 * Devolve só os campos que tiveram alguma correção, do pior para o melhor.
 */
export function acertoPorCampo(docs: { id: string; tipo: Tipo }[], correcoes: { documentoId: string; campo: string }[]): AcertoCampo[] {
  const tipoDe = new Map(docs.map((d) => [d.id, d.tipo]));
  const lidosPorTipo = { NFE: 0, BOLETO: 0 };
  for (const d of docs) lidosPorTipo[d.tipo]++;

  const erros = new Map<string, Set<string>>(); // "NFE|campo" → documentos
  for (const c of correcoes) {
    const tipo = tipoDe.get(c.documentoId);
    if (!tipo) continue;
    const chave = `${tipo}|${campoGenerico(c.campo)}`;
    if (!erros.has(chave)) erros.set(chave, new Set());
    erros.get(chave)!.add(c.documentoId);
  }

  return [...erros.entries()]
    .map(([chave, ids]) => {
      const [tipo, campo] = chave.split("|") as [Tipo, string];
      const lidos = lidosPorTipo[tipo];
      return { tipo, campo, lidos, corrigidos: ids.size, acerto: lidos ? 1 - ids.size / lidos : 0 };
    })
    .sort((a, b) => a.acerto - b.acerto || b.corrigidos - a.corrigidos || a.campo.localeCompare(b.campo));
}

/** Quantos documentos aprovados não precisaram de nenhuma correção. */
export function semCorrecao(docs: { id: string }[], correcoes: { documentoId: string }[]): number {
  const corrigidos = new Set(correcoes.map((c) => c.documentoId));
  return docs.filter((d) => !corrigidos.has(d.id)).length;
}

// ---------------------------------------------------------------- motivos

/** Quantos documentos cada regra barrou NA CHEGADA (antes de qualquer correção), do mais comum ao menos. */
export function motivosNaChegada(recebidos: { codigos: string[] }[]): { codigo: string; documentos: number }[] {
  const contagem = new Map<string, number>();
  for (const r of recebidos) for (const c of new Set(r.codigos)) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  return [...contagem.entries()].map(([codigo, documentos]) => ({ codigo, documentos })).sort((a, b) => b.documentos - a.documentos || a.codigo.localeCompare(b.codigo));
}

// ---------------------------------------------------------------- semanas

/** Segunda-feira da semana de uma data ISO ("2026-11-19" → "2026-11-16"). */
export function inicioDaSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dia = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return d.toISOString().slice(0, 10);
}

export type Semana = { inicio: string; recebidos: number; automaticos: number; taxa: number };

/** Documentos recebidos por semana e quantos foram aprovados sozinhos, da mais antiga à mais recente. */
export function porSemana(docs: { recebidoEm: string; status: string }[]): Semana[] {
  const mapa = new Map<string, { recebidos: number; automaticos: number }>();
  for (const d of docs) {
    const s = inicioDaSemana(d.recebidoEm);
    const atual = mapa.get(s) ?? { recebidos: 0, automaticos: 0 };
    atual.recebidos++;
    if (d.status === "APROVADO_AUTO") atual.automaticos++;
    mapa.set(s, atual);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inicio, v]) => ({ inicio, ...v, taxa: v.recebidos ? v.automaticos / v.recebidos : 0 }));
}

// ---------------------------------------------------------------- utilidades

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Dias corridos entre duas datas ISO. */
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export const porcento = (x: number) => `${Math.round(x * 100)}%`;
