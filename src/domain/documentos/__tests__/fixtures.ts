import { montarLinhaDigitavel } from "../boleto";
import { montarChave } from "../chave-nfe";
import { completarCnpj } from "../cnpj";
import type { Boleto, Contexto, Nfe } from "../tipos";

export const MATRIZ = completarCnpj("112223330001"); // 11222333000181
export const FILIAL = completarCnpj("112223330002");
export const FORNECEDOR = completarCnpj("445556660001");
export const INATIVO = completarCnpj("778889990001");
export const DESCONHECIDO = completarCnpj("990001110001");

export const RECEBIDO_EM = "2026-11-10"; // terça-feira

/** NF-e coerente: 2 itens, frete, IPI e desconto, duas parcelas. Total R$ 1.050,00. */
export function nfe(ajustes: Partial<Nfe> = {}): Nfe {
  return {
    tipo: "NFE",
    chaveAcesso: montarChave({ uf: "53", aamm: "2611", cnpj: FORNECEDOR, serie: 1, numero: 4521, codigo: "12345678" }),
    numero: 4521,
    serie: 1,
    dataEmissao: "2026-11-05",
    emitenteCnpj: FORNECEDOR,
    emitenteNome: "Cimentos Planalto Ltda",
    destinatarioCnpj: MATRIZ,
    itens: [
      // 10 × R$ 50,00 = R$ 500,00
      { descricao: "Cimento CP-II 50kg", quantidade: 100_000, valorUnitario: 500_000, valorTotalCentavos: 50_000 },
      // 2,5 × R$ 180,00 = R$ 450,00
      { descricao: "Areia média m³", quantidade: 25_000, valorUnitario: 1_800_000, valorTotalCentavos: 45_000 },
    ],
    totalProdutosCentavos: 95_000,
    freteCentavos: 12_000,
    ipiCentavos: 3_000,
    descontoCentavos: 5_000,
    totalNotaCentavos: 105_000, // 950 + 120 + 30 − 50
    duplicatas: [
      { numero: "4521/1", vencimento: "2026-12-05", valorCentavos: 52_500 },
      { numero: "4521/2", vencimento: "2027-01-05", valorCentavos: 52_500 },
    ],
    ...ajustes,
  };
}

export const linha = (valorCentavos = 52_500, vencimento = "2026-12-05") =>
  montarLinhaDigitavel({ banco: "237", valorCentavos, vencimento, campoLivre: "1234567890123456789012345" });

/** Boleto da 1ª parcela da nota acima. */
export function boleto(ajustes: Partial<Boleto> = {}): Boleto {
  return {
    tipo: "BOLETO",
    linhaDigitavel: linha(),
    beneficiarioCnpj: FORNECEDOR,
    beneficiarioNome: "Cimentos Planalto Ltda",
    pagadorCnpj: MATRIZ,
    vencimento: "2026-12-05",
    valorCentavos: 52_500,
    numeroDocumento: "4521/1",
    ...ajustes,
  };
}

export function contexto(ajustes: Partial<Contexto> = {}): Contexto {
  return {
    cnpjsDoGrupo: [MATRIZ, FILIAL],
    fornecedores: [
      { cnpj: FORNECEDOR, nome: "Cimentos Planalto", ativo: true },
      { cnpj: INATIVO, nome: "Tintas Antigas", ativo: false },
    ],
    jaRecebidos: { chaves: new Set(), linhas: new Set(), hashes: new Set() },
    notas: [
      {
        emitenteCnpj: FORNECEDOR,
        numero: 4521,
        totalNotaCentavos: 105_000,
        duplicatas: [
          { valorCentavos: 52_500, vencimento: "2026-12-05" },
          { valorCentavos: 52_500, vencimento: "2027-01-05" },
        ],
      },
    ],
    hashArquivo: "abc",
    recebidoEm: RECEBIDO_EM,
    alcadaCentavos: 1_000_000,
    ...ajustes,
  };
}
