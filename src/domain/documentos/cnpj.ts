/**
 * CNPJ numérico e alfanumérico.
 * Desde jul/2026 a Receita emite CNPJ com letras nas 12 primeiras posições; os 2 DVs continuam numéricos.
 * O cálculo é o mesmo módulo 11 de sempre, com cada caractere valendo (código ASCII − 48):
 * '0'–'9' → 0–9, 'A' → 17, 'B' → 18…
 */

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

const valor = (c: string) => c.charCodeAt(0) - 48;

function dv(base: string, pesos: number[]): number {
  const soma = [...base].reduce((acc, c, i) => acc + valor(c) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Tira pontuação e passa para maiúsculas: "12.ABC.345/01DE-35" → "12ABC34501DE35". */
export function normalizarCnpj(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function cnpjValido(texto: string): boolean {
  const c = normalizarCnpj(texto);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111…
  const d1 = dv(c.slice(0, 12), PESOS_1);
  const d2 = dv(c.slice(0, 12) + d1, PESOS_2);
  return c.endsWith(`${d1}${d2}`);
}

/** Completa os 12 primeiros caracteres com os 2 DVs (usado pelo seed e pelos testes). */
export function completarCnpj(base12: string): string {
  const b = normalizarCnpj(base12);
  if (!/^[0-9A-Z]{12}$/.test(b)) throw new Error(`Base de CNPJ inválida: ${base12}`);
  const d1 = dv(b, PESOS_1);
  return `${b}${d1}${dv(b + d1, PESOS_2)}`;
}

export function formatarCnpj(texto: string): string {
  const c = normalizarCnpj(texto);
  if (c.length !== 14) return texto;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
