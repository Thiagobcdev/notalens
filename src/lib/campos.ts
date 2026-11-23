import { formatarBRL, formatarCnpj, formatarChave, formatarLinhaDigitavel, imprimirData, imprimirDecimal4 } from "@/domain/documentos";

/**
 * Ponte entre os nomes de campo do documento normalizado (usados pelas regras: "totalNotaCentavos",
 * "itens.2.valorTotalCentavos") e os da extração bruta (usados no formulário: "totalNota", "itens.2.valorTotal").
 */
export const campoBruto = (campo: string) => campo.replace(/Centavos$/, "");

const ROTULOS: Record<string, string> = {
  chaveAcesso: "Chave de acesso",
  numero: "Número",
  serie: "Série",
  dataEmissao: "Data de emissão",
  emitenteCnpj: "CNPJ do emitente",
  emitenteNome: "Emitente",
  destinatarioCnpj: "CNPJ do destinatário",
  totalProdutos: "Total dos produtos",
  frete: "Frete",
  ipi: "IPI",
  desconto: "Desconto",
  totalNota: "Total da nota",
  linhaDigitavel: "Linha digitável",
  beneficiarioCnpj: "CNPJ do beneficiário",
  beneficiarioNome: "Beneficiário",
  pagadorCnpj: "CNPJ do pagador",
  vencimento: "Vencimento",
  valor: "Valor",
  numeroDocumento: "Nº do documento",
  descricao: "Descrição",
  quantidade: "Quantidade",
  valorUnitario: "Valor unitário",
  valorTotal: "Valor total",
  arquivo: "Arquivo",
  itens: "Itens",
  duplicatas: "Parcelas",
};

/** "itens.2.valorTotalCentavos" → "Item 3 · Valor total" */
export function rotuloCampo(campo: string): string {
  const partes = campoBruto(campo).split(".");
  if (partes.length === 3) {
    const grupo = partes[0] === "itens" ? "Item" : "Parcela";
    return `${grupo} ${Number(partes[1]) + 1} · ${ROTULOS[partes[2]] ?? partes[2]}`;
  }
  return ROTULOS[partes[0]] ?? campo;
}

/** Valor normalizado (como gravado nas correções, em JSON) → texto legível. */
export function formatarValorCampo(campo: string, json: string | null): string {
  if (json === null) return "(vazio)";
  const v: unknown = JSON.parse(json);
  if (v === null) return "(vazio)";
  const nome = campo.split(".").at(-1)!;
  if (typeof v === "number") {
    if (nome.endsWith("Centavos")) return formatarBRL(v);
    if (nome === "quantidade" || nome === "valorUnitario") return imprimirDecimal4(v);
    return String(v);
  }
  if (typeof v === "string") {
    if (nome.endsWith("Cnpj")) return formatarCnpj(v);
    if (nome === "chaveAcesso") return formatarChave(v);
    if (nome === "linhaDigitavel") return formatarLinhaDigitavel(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return imprimirData(v);
    return v;
  }
  return JSON.stringify(v);
}
