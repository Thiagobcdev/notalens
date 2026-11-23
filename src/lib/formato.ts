export { formatarBRL } from "@/domain/documentos";

/** "2026-10-15" → "15/10/2026" */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Data de hoje ("YYYY-MM-DD") no fuso de Brasília. */
export function hojeISO(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export const isoDeData = (d: Date) => d.toISOString().slice(0, 10);
