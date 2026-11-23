/**
 * Números sem float (V10): dinheiro em centavos inteiros, quantidade e preço unitário
 * em inteiros com 4 casas decimais (a NF-e imprime até 4 casas nesses campos).
 */

/** 4 casas decimais: 1,5 un → 15_000. */
export const ESCALA4 = 10_000;

/**
 * Lê um decimal pt-BR ("1.234,56", "R$ 10,00", "12,5") ou com ponto ("1234.56") como inteiro
 * com `casas` decimais, usando só aritmética de strings. Devolve null se não for um número.
 * `milhar`: "25.000" sem vírgula vira vinte e cinco mil (campos de dinheiro).
 */
export function lerDecimal(texto: string, casas: number, { milhar = false } = {}): number | null {
  let t = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (t === "") return null;
  let negativo = false;
  if (t.startsWith("-")) {
    negativo = true;
    t = t.slice(1);
  }
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (milhar && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const [, inteiro, fracao = ""] = m;
  if (fracao.length > casas) return null;
  const valor = Number(inteiro) * 10 ** casas + Number(fracao.padEnd(casas, "0") || "0");
  if (!Number.isSafeInteger(valor)) return null;
  return negativo ? -valor : valor;
}

/** Dinheiro digitado ou extraído → centavos. */
export const lerCentavos = (texto: string) => lerDecimal(texto, 2, { milhar: true });

/** Divisão inteira com arredondamento half-up (para positivos), em BigInt para não estourar. */
export function dividirArredondando(numerador: bigint, divisor: bigint): number {
  const q = numerador / divisor;
  const r = numerador % divisor;
  return Number(r * 2n >= divisor ? q + 1n : q);
}

/** quantidade (4 casas) × unitário (4 casas, em reais) → centavos, arredondado half-up. */
export function totalDoItemCentavos(quantidade: number, valorUnitario: number): number {
  // q/1e4 × u/1e4 reais = q×u/1e8 reais = q×u/1e6 centavos
  return dividirArredondando(BigInt(quantidade) * BigInt(valorUnitario), 1_000_000n);
}

export const somar = (valores: readonly number[]) => valores.reduce((a, b) => a + b, 0);

export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const soDigitos = (texto: string) => texto.replace(/\D/g, "");
