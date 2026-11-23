import { z } from "zod";
import { normalizarChave } from "./chave-nfe";
import { normalizarCnpj } from "./cnpj";
import { isoValida } from "./datas";
import { lerCentavos, lerDecimal, soDigitos } from "./numeros";
import type { Boleto, Documento, Nfe } from "./tipos";

/**
 * O que a IA devolve: os campos como texto, do jeito que estão impressos, ou null.
 * Pedimos texto (e não números) de propósito: quem converte "1.234,56" em centavos é código
 * determinístico, não o modelo (V10).
 */
const texto = z.string().nullable();

export const itemBrutoSchema = z.object({
  descricao: texto,
  quantidade: texto,
  valorUnitario: texto,
  valorTotal: texto,
});

export const nfeBrutaSchema = z.object({
  tipo: z.literal("NFE"),
  chaveAcesso: texto,
  numero: texto,
  serie: texto,
  dataEmissao: texto.describe("DD/MM/AAAA como impresso"),
  emitenteCnpj: texto,
  emitenteNome: texto,
  destinatarioCnpj: texto,
  itens: z.array(itemBrutoSchema),
  totalProdutos: texto,
  frete: texto,
  ipi: texto,
  desconto: texto,
  totalNota: texto,
  duplicatas: z.array(z.object({ numero: texto, vencimento: texto, valor: texto })),
});

export const boletoBrutoSchema = z.object({
  tipo: z.literal("BOLETO"),
  linhaDigitavel: texto,
  beneficiarioCnpj: texto,
  beneficiarioNome: texto,
  pagadorCnpj: texto,
  vencimento: texto,
  valor: texto,
  numeroDocumento: texto,
});

export const extracaoBrutaSchema = z.discriminatedUnion("tipo", [nfeBrutaSchema, boletoBrutoSchema]);
export type ExtracaoBruta = z.infer<typeof extracaoBrutaSchema>;

const vazio = (t: string | null) => (t === null || t.trim() === "" ? null : t.trim());

/** "05/11/2026" ou "2026-11-05" → ISO; qualquer outra coisa → null (V8 aponta). */
export function lerData(t: string | null): string | null {
  const s = vazio(t);
  if (s === null) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : s;
  return isoValida(iso) ? iso : null;
}

const lerInteiro = (t: string | null) => {
  const s = vazio(t);
  if (s === null) return null;
  const d = soDigitos(s);
  return d === "" || d.length > 15 ? null : Number(d);
};

const dinheiro = (t: string | null) => {
  const s = vazio(t);
  return s === null ? null : lerCentavos(s);
};

const decimal4 = (t: string | null) => {
  const s = vazio(t);
  return s === null ? null : lerDecimal(s, 4, { milhar: true });
};

const cnpj = (t: string | null) => {
  const s = vazio(t);
  return s === null ? null : normalizarCnpj(s);
};

/** Converte a extração bruta para o documento normalizado que as regras validam. */
export function normalizar(bruta: ExtracaoBruta): Documento {
  if (bruta.tipo === "NFE") {
    const nfe: Nfe = {
      tipo: "NFE",
      chaveAcesso: vazio(bruta.chaveAcesso) && normalizarChave(bruta.chaveAcesso!),
      numero: lerInteiro(bruta.numero),
      serie: lerInteiro(bruta.serie),
      dataEmissao: lerData(bruta.dataEmissao),
      emitenteCnpj: cnpj(bruta.emitenteCnpj),
      emitenteNome: vazio(bruta.emitenteNome),
      destinatarioCnpj: cnpj(bruta.destinatarioCnpj),
      itens: bruta.itens.map((i) => ({
        descricao: vazio(i.descricao),
        quantidade: decimal4(i.quantidade),
        valorUnitario: decimal4(i.valorUnitario),
        valorTotalCentavos: dinheiro(i.valorTotal),
      })),
      totalProdutosCentavos: dinheiro(bruta.totalProdutos),
      freteCentavos: dinheiro(bruta.frete),
      ipiCentavos: dinheiro(bruta.ipi),
      descontoCentavos: dinheiro(bruta.desconto),
      totalNotaCentavos: dinheiro(bruta.totalNota),
      duplicatas: bruta.duplicatas.map((d) => ({
        numero: vazio(d.numero),
        vencimento: lerData(d.vencimento),
        valorCentavos: dinheiro(d.valor),
      })),
    };
    return nfe;
  }
  const boleto: Boleto = {
    tipo: "BOLETO",
    linhaDigitavel: vazio(bruta.linhaDigitavel) && soDigitos(bruta.linhaDigitavel!),
    beneficiarioCnpj: cnpj(bruta.beneficiarioCnpj),
    beneficiarioNome: vazio(bruta.beneficiarioNome),
    pagadorCnpj: cnpj(bruta.pagadorCnpj),
    vencimento: lerData(bruta.vencimento),
    valorCentavos: dinheiro(bruta.valor),
    numeroDocumento: vazio(bruta.numeroDocumento),
  };
  return boleto;
}
