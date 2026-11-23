/**
 * Chave de acesso da NF-e (44 posições):
 * cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) código(8) DV(1).
 * DV: módulo 11 com pesos 2..9 da direita para a esquerda; resto 0 ou 1 → DV 0.
 * Com CNPJ alfanumérico, cada caractere vale (ASCII − 48), como no CNPJ.
 */

export type PartesChave = {
  uf: string;
  /** "AAMM" da emissão. */
  aamm: string;
  cnpj: string;
  modelo: string;
  serie: number;
  numero: number;
  tipoEmissao: string;
  codigo: string;
  dv: number;
};

export function normalizarChave(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function dvChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += (base43.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Decompõe uma chave bem formada (44 posições, só a parte do CNPJ pode ter letras). Não confere o DV. */
export function decomporChave(texto: string): PartesChave | null {
  const c = normalizarChave(texto);
  if (!/^\d{6}[0-9A-Z]{12}\d{26}$/.test(c)) return null;
  return {
    uf: c.slice(0, 2),
    aamm: c.slice(2, 6),
    cnpj: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: Number(c.slice(22, 25)),
    numero: Number(c.slice(25, 34)),
    tipoEmissao: c.slice(34, 35),
    codigo: c.slice(35, 43),
    dv: Number(c.slice(43)),
  };
}

export function dvDaChaveConfere(texto: string): boolean {
  const c = normalizarChave(texto);
  return decomporChave(c) !== null && dvChave(c.slice(0, 43)) === Number(c[43]);
}

/** Monta uma chave válida (seed e testes). */
export function montarChave(p: Omit<PartesChave, "dv" | "modelo" | "tipoEmissao"> & { modelo?: string; tipoEmissao?: string }): string {
  const base =
    p.uf.padStart(2, "0") +
    p.aamm +
    p.cnpj +
    (p.modelo ?? "55") +
    String(p.serie).padStart(3, "0") +
    String(p.numero).padStart(9, "0") +
    (p.tipoEmissao ?? "1") +
    p.codigo.padStart(8, "0");
  if (base.length !== 43) throw new Error(`Partes da chave com tamanho errado: ${base}`);
  return base + dvChave(base);
}

/** "3526 1112 3456 …" em blocos de 4, como no DANFE. */
export const formatarChave = (texto: string) => normalizarChave(texto).replace(/(.{4})(?=.)/g, "$1 ");
