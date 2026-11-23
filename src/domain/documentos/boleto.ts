import { diasEntre, somarDias } from "./datas";
import { soDigitos } from "./numeros";

/**
 * Boleto bancário (padrão Febraban).
 *
 * Código de barras (44): banco(3) moeda(1) DV(1) fator(4) valor(10) campo livre(25).
 * Linha digitável (47):
 *   campo 1 = banco + moeda + livre[0..5)  + DV mód. 10   (10)
 *   campo 2 = livre[5..15)                 + DV mód. 10   (11)
 *   campo 3 = livre[15..25)                + DV mód. 10   (11)
 *   campo 4 = DV geral do código de barras (mód. 11)      (1)
 *   campo 5 = fator de vencimento + valor                 (14)
 *
 * Fator de vencimento: dias desde 07/10/1997. Ele chegou a 9999 em 21/02/2025 e recomeçou em 1000
 * no dia 22/02/2025. Por isso o mesmo fator pode significar duas datas; escolhemos a mais
 * próxima de uma data de referência (a de recebimento do documento).
 */

const BASE_ANTIGA = "1997-10-07";
const BASE_NOVA = "2025-02-22"; // fator 1000 no ciclo novo
const CICLO = 9000; // fatores 1000..9999

export function mod10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    const p = Number(numero[i]) * peso;
    soma += p > 9 ? p - 9 : p; // soma dos algarismos do produto
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/** DV geral do código de barras: mód. 11, pesos 2..9; resultado 0, 10 ou 11 vira 1. */
export function dvCodigoBarras(semDv43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = semDv43.length - 1; i >= 0; i--) {
    soma += Number(semDv43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv > 9 ? 1 : dv;
}

export function dataParaFator(iso: string): number {
  if (iso >= BASE_NOVA) return 1000 + diasEntre(BASE_NOVA, iso);
  return diasEntre(BASE_ANTIGA, iso);
}

/** Fator → data, escolhendo o ciclo mais próximo de `referencia`. Fator 0 = boleto sem vencimento. */
export function fatorParaData(fator: number, referencia: string): string | null {
  if (fator === 0) return null;
  const candidatos = [somarDias(BASE_ANTIGA, fator)];
  for (let ciclo = 0; ciclo < 3; ciclo++) candidatos.push(somarDias(BASE_NOVA, fator - 1000 + ciclo * CICLO));
  return candidatos.reduce((melhor, d) =>
    Math.abs(diasEntre(referencia, d)) < Math.abs(diasEntre(referencia, melhor)) ? d : melhor,
  );
}

export type ProblemaLinha = "TAMANHO" | "DV_CAMPO_1" | "DV_CAMPO_2" | "DV_CAMPO_3" | "DV_GERAL";

export type LinhaLida = {
  problemas: ProblemaLinha[];
  codigoBarras: string | null;
  banco: string | null;
  fator: number | null;
  /** 0 = boleto com valor em aberto. */
  valorCentavos: number | null;
};

export function lerLinhaDigitavel(texto: string): LinhaLida {
  const l = soDigitos(texto);
  if (l.length !== 47) return { problemas: ["TAMANHO"], codigoBarras: null, banco: null, fator: null, valorCentavos: null };

  const c1 = l.slice(0, 10);
  const c2 = l.slice(10, 21);
  const c3 = l.slice(21, 32);
  const dvGeral = l.slice(32, 33);
  const c5 = l.slice(33);
  const problemas: ProblemaLinha[] = [];
  if (mod10(c1.slice(0, 9)) !== Number(c1[9])) problemas.push("DV_CAMPO_1");
  if (mod10(c2.slice(0, 10)) !== Number(c2[10])) problemas.push("DV_CAMPO_2");
  if (mod10(c3.slice(0, 10)) !== Number(c3[10])) problemas.push("DV_CAMPO_3");

  const livre = c1.slice(4, 9) + c2.slice(0, 10) + c3.slice(0, 10);
  const codigoBarras = c1.slice(0, 4) + dvGeral + c5 + livre;
  if (dvCodigoBarras(codigoBarras.slice(0, 4) + codigoBarras.slice(5)) !== Number(dvGeral)) problemas.push("DV_GERAL");

  return {
    problemas,
    codigoBarras,
    banco: c1.slice(0, 3),
    fator: Number(c5.slice(0, 4)),
    valorCentavos: Number(c5.slice(4)),
  };
}

/** Monta uma linha digitável válida (seed e testes). */
export function montarLinhaDigitavel(p: { banco: string; valorCentavos: number; vencimento: string; campoLivre: string }): string {
  if (!/^\d{3}$/.test(p.banco) || !/^\d{25}$/.test(p.campoLivre)) throw new Error("Banco ou campo livre inválido");
  const fator = String(dataParaFator(p.vencimento)).padStart(4, "0");
  const valor = String(p.valorCentavos).padStart(10, "0");
  const semDv = p.banco + "9" + fator + valor + p.campoLivre;
  const dv = dvCodigoBarras(semDv);
  const livre = p.campoLivre;
  const c1 = p.banco + "9" + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${dv}${fator}${valor}`;
}

/** "23790.12345 60000.000005 …" como impresso no boleto. */
export function formatarLinhaDigitavel(texto: string): string {
  const l = soDigitos(texto);
  if (l.length !== 47) return texto;
  return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
}
