/** Datas como string ISO "AAAA-MM-DD" (V10). As contas usam UTC para não sofrer com fuso. */

const DIA_MS = 86_400_000;

export const isoValida = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && paraIso(paraUtc(iso)) === iso;

export const paraUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export const paraIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const somarDias = (iso: string, dias: number) => paraIso(paraUtc(iso) + dias * DIA_MS);

/** Dias corridos de `a` até `b` (positivo se b for depois). */
export const diasEntre = (a: string, b: string) => Math.round((paraUtc(b) - paraUtc(a)) / DIA_MS);

/** Feriados nacionais de data fixa. Os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) ficam de fora no MVP. */
const FERIADOS_FIXOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);

export function ehDiaUtil(iso: string): boolean {
  const dia = new Date(paraUtc(iso)).getUTCDay();
  return dia !== 0 && dia !== 6 && !FERIADOS_FIXOS.has(iso.slice(5));
}

/** Dias úteis depois de `de` até `ate`, inclusive `ate` (0 se `ate` não for depois de `de`). */
export function diasUteisAte(de: string, ate: string): number {
  let n = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) if (ehDiaUtil(d)) n++;
  return n;
}
