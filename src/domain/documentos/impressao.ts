import { formatarLinhaDigitavel } from "./boleto";
import { formatarChave } from "./chave-nfe";
import { formatarCnpj } from "./cnpj";
import type { ExtracaoBruta } from "./extracao";
import { ESCALA4 } from "./numeros";
import type { Documento } from "./tipos";

/**
 * O caminho inverso da normalização: como cada campo aparece impresso no DANFE ou no boleto.
 * Usado para gerar os PDFs do seed, as extrações gravadas e para mostrar valores na revisão.
 */

const grupos = (inteiro: number) => inteiro.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function decimal(valor: number, casas: number): string {
  const sinal = valor < 0 ? "-" : "";
  const abs = Math.abs(valor);
  const escala = 10 ** casas;
  return `${sinal}${grupos(Math.floor(abs / escala))},${String(abs % escala).padStart(casas, "0")}`;
}

/** 105000 → "1.050,00" */
export const imprimirCentavos = (centavos: number) => decimal(centavos, 2);
/** 25000 → "2,5000" */
export const imprimirDecimal4 = (valor: number) => decimal(valor, Math.log10(ESCALA4));
/** "2026-12-05" → "05/12/2026" */
export const imprimirData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const ou = <T, R>(v: T | null, f: (x: T) => R) => (v === null ? null : f(v));

export function paraBruto(doc: Documento): ExtracaoBruta {
  if (doc.tipo === "NFE") {
    return {
      tipo: "NFE",
      chaveAcesso: ou(doc.chaveAcesso, formatarChave),
      numero: ou(doc.numero, (n) => String(n).padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.")), // 000.004.521
      serie: ou(doc.serie, (s) => String(s).padStart(3, "0")),
      dataEmissao: ou(doc.dataEmissao, imprimirData),
      emitenteCnpj: ou(doc.emitenteCnpj, formatarCnpj),
      emitenteNome: doc.emitenteNome,
      destinatarioCnpj: ou(doc.destinatarioCnpj, formatarCnpj),
      itens: doc.itens.map((i) => ({
        descricao: i.descricao,
        quantidade: ou(i.quantidade, imprimirDecimal4),
        valorUnitario: ou(i.valorUnitario, imprimirDecimal4),
        valorTotal: ou(i.valorTotalCentavos, imprimirCentavos),
      })),
      totalProdutos: ou(doc.totalProdutosCentavos, imprimirCentavos),
      frete: ou(doc.freteCentavos, imprimirCentavos),
      ipi: ou(doc.ipiCentavos, imprimirCentavos),
      desconto: ou(doc.descontoCentavos, imprimirCentavos),
      totalNota: ou(doc.totalNotaCentavos, imprimirCentavos),
      duplicatas: doc.duplicatas.map((d) => ({
        numero: d.numero,
        vencimento: ou(d.vencimento, imprimirData),
        valor: ou(d.valorCentavos, imprimirCentavos),
      })),
    };
  }
  return {
    tipo: "BOLETO",
    linhaDigitavel: ou(doc.linhaDigitavel, formatarLinhaDigitavel),
    beneficiarioCnpj: ou(doc.beneficiarioCnpj, formatarCnpj),
    beneficiarioNome: doc.beneficiarioNome,
    pagadorCnpj: ou(doc.pagadorCnpj, formatarCnpj),
    vencimento: ou(doc.vencimento, imprimirData),
    valor: ou(doc.valorCentavos, imprimirCentavos),
    numeroDocumento: doc.numeroDocumento,
  };
}
