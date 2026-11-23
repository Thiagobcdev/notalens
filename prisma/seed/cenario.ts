/**
 * Cenário do Grupo Vértice (fictício): fornecedores, notas, boletos e os defeitos de propósito.
 * Tudo determinístico (PRNG com semente fixa): rodar o seed duas vezes gera os mesmos PDFs.
 */
import {
  completarCnpj,
  montarChave,
  montarLinhaDigitavel,
  somarDias,
  totalDoItemCentavos,
  type Boleto,
  type Documento,
  type ItemNfe,
  type Nfe,
} from "../../src/domain/documentos";

// ── PRNG (mulberry32) ──
let estado = 20261123;
export function rand(): number {
  estado |= 0;
  estado = (estado + 0x6d2b79f5) | 0;
  let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const entre = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
export const escolher = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const digitos = (n: number) => Array.from({ length: n }, () => entre(0, 9)).join("");

// ── Grupo Vértice ──
export const GRUPO = {
  nome: "Grupo Vértice Materiais de Construção",
  matriz: { cnpj: completarCnpj("374158200001"), descricao: "Matriz — Brasília/DF", nome: "Vértice Materiais de Construção Ltda", endereco: "SIA Trecho 3, Lote 625 — Brasília/DF — 71200-030" },
  filial: { cnpj: completarCnpj("374158200002"), descricao: "Filial — Águas Claras/DF", nome: "Vértice Materiais de Construção Ltda (Filial)", endereco: "Av. Castanheiras, 1200 — Águas Claras/DF — 71900-100" },
};

type Produto = { descricao: string; unitario: number /* reais × 10⁴ */; fracionado?: boolean };

export type FornecedorSeed = {
  cnpj: string;
  nome: string;
  uf: string;
  endereco: string;
  banco: [string, string];
  ativo: boolean;
  produtos: Produto[];
};

const R = (reais: number) => Math.round(reais * 10_000);

export const FORNECEDORES: FornecedorSeed[] = [
  { cnpj: completarCnpj("458213760001"), nome: "Cimentos Planalto Ltda", uf: "52", endereco: "Rod. GO-060, km 12 — Goiânia/GO", banco: ["237", "Bradesco"], ativo: true, produtos: [{ descricao: "Cimento CP-II 50kg", unitario: R(38.9) }, { descricao: "Cimento CP-V ARI 40kg", unitario: R(42.5) }, { descricao: "Cal hidratada 20kg", unitario: R(17.35) }] },
  { cnpj: completarCnpj("219874530001"), nome: "Aço Forte Distribuidora S.A.", uf: "31", endereco: "Av. Amazonas, 7400 — Belo Horizonte/MG", banco: ["341", "Itaú"], ativo: true, produtos: [{ descricao: "Vergalhão CA-50 10mm 12m", unitario: R(54.9) }, { descricao: "Vergalhão CA-50 8mm 12m", unitario: R(36.4) }, { descricao: "Tela soldada Q-138 2x3m", unitario: R(189.0) }] },
  { cnpj: completarCnpj("CE7Q2B5K0001"), nome: "Tintas Cerrado Indústria Ltda", uf: "53", endereco: "Setor de Indústria, Qd 2 — Ceilândia/DF", banco: ["001", "Banco do Brasil"], ativo: true, produtos: [{ descricao: "Tinta acrílica fosca 18L branco", unitario: R(289.9) }, { descricao: "Massa corrida 25kg", unitario: R(64.75) }, { descricao: "Selador acrílico 18L", unitario: R(159.0) }] },
  { cnpj: completarCnpj("603318920001"), nome: "Madeireira Ipê Dourado", uf: "51", endereco: "Rod. BR-163, km 5 — Sinop/MT", banco: ["104", "Caixa"], ativo: true, produtos: [{ descricao: "Viga de eucalipto 6x12 3m", unitario: R(48.6) }, { descricao: "Tábua de pinus 30cm 3m", unitario: R(27.9) }, { descricao: "Compensado naval 18mm", unitario: R(214.5) }] },
  { cnpj: completarCnpj("174452680001"), nome: "Elétrica Luz Norte Comércio", uf: "53", endereco: "SCIA Qd 14, Conj 6 — Brasília/DF", banco: ["237", "Bradesco"], ativo: true, produtos: [{ descricao: "Cabo flexível 2,5mm rolo 100m", unitario: R(219.0) }, { descricao: "Disjuntor DIN 20A", unitario: R(14.9) }, { descricao: "Quadro de distribuição 12 disj.", unitario: R(98.5) }] },
  { cnpj: completarCnpj("332907150001"), nome: "Hidráulica Fluxo Ltda", uf: "35", endereco: "Av. do Estado, 3300 — São Paulo/SP", banco: ["341", "Itaú"], ativo: true, produtos: [{ descricao: "Tubo PVC soldável 25mm 6m", unitario: R(22.4) }, { descricao: "Caixa d'água 1000L", unitario: R(489.0) }, { descricao: "Registro de gaveta 3/4", unitario: R(46.9) }] },
  { cnpj: completarCnpj("518624370001"), nome: "Cerâmica Vale Dourado", uf: "52", endereco: "Distrito Industrial — Anápolis/GO", banco: ["001", "Banco do Brasil"], ativo: true, produtos: [{ descricao: "Porcelanato 60x60 cx 1,44m²", unitario: R(69.9) }, { descricao: "Piso cerâmico 45x45 cx 2m²", unitario: R(32.5) }, { descricao: "Argamassa AC-II 20kg", unitario: R(19.8) }] },
  { cnpj: completarCnpj("280451960001"), nome: "Ferragens União", uf: "53", endereco: "SOF Sul Qd 9 — Brasília/DF", banco: ["033", "Santander"], ativo: true, produtos: [{ descricao: "Parafuso sextavado 1/4 cx 100", unitario: R(31.2) }, { descricao: "Dobradiça 3,5 pol. aço", unitario: R(8.95) }, { descricao: "Fechadura externa cromada", unitario: R(87.0) }] },
  { cnpj: completarCnpj("446092810001"), nome: "Vidros Brasília Temperados", uf: "53", endereco: "SAAN Qd 2 — Brasília/DF", banco: ["104", "Caixa"], ativo: true, produtos: [{ descricao: "Vidro temperado 8mm m²", unitario: R(245.0), fracionado: true }, { descricao: "Espelho 4mm m²", unitario: R(168.0), fracionado: true }] },
  { cnpj: completarCnpj("129387640001"), nome: "Areal e Pedreira Alvorada", uf: "53", endereco: "Núcleo Rural Alexandre Gusmão — Brazlândia/DF", banco: ["237", "Bradesco"], ativo: true, produtos: [{ descricao: "Areia média m³", unitario: R(180.0), fracionado: true }, { descricao: "Brita 1 m³", unitario: R(155.0), fracionado: true }, { descricao: "Pedrisco m³", unitario: R(162.5), fracionado: true }] },
  { cnpj: completarCnpj("397716250001"), nome: "Telhas Goiás Ltda", uf: "52", endereco: "Av. Brasil Norte, 2100 — Anápolis/GO", banco: ["341", "Itaú"], ativo: true, produtos: [{ descricao: "Telha de fibrocimento 2,44m", unitario: R(52.9) }, { descricao: "Cumeeira fibrocimento", unitario: R(29.9) }] },
  { cnpj: completarCnpj("652238190001"), nome: "Iluminação Aurora", uf: "35", endereco: "R. Santa Ifigênia, 410 — São Paulo/SP", banco: ["033", "Santander"], ativo: true, produtos: [{ descricao: "Painel LED 18W embutir", unitario: R(27.45) }, { descricao: "Lâmpada LED 9W cx 10", unitario: R(59.9) }] },
  { cnpj: completarCnpj("083145570001"), nome: "Ferramentas Mestre Ltda", uf: "41", endereco: "Rod. BR-277, km 2 — Curitiba/PR", banco: ["001", "Banco do Brasil"], ativo: true, produtos: [{ descricao: "Furadeira de impacto 650W", unitario: R(279.0) }, { descricao: "Nível de alumínio 60cm", unitario: R(45.9) }, { descricao: "Trena 8m", unitario: R(32.0) }] },
  { cnpj: completarCnpj("701928460001"), nome: "Impermeabilizantes Seco Total", uf: "33", endereco: "Av. Brasil, 15000 — Rio de Janeiro/RJ", banco: ["104", "Caixa"], ativo: true, produtos: [{ descricao: "Manta asfáltica 4mm rolo 10m", unitario: R(312.0) }, { descricao: "Impermeabilizante 18kg", unitario: R(189.9) }] },
  // Descredenciado em out/2026: notas dele vão para revisão (V6).
  { cnpj: completarCnpj("564410380001"), nome: "Pisos & Cia Revestimentos", uf: "35", endereco: "Av. Sapopemba, 900 — São Paulo/SP", banco: ["237", "Bradesco"], ativo: false, produtos: [{ descricao: "Piso vinílico cx 3m²", unitario: R(129.0) }] },
];

export const ATIVOS = FORNECEDORES.filter((f) => f.ativo);

// ── Eventos (cada um vira um PDF recebido) ──

export type Defeito =
  // problema no próprio documento (a IA leu certo)
  | "ITEM_ERRADO"
  | "TOTAL_ERRADO"
  | "NOTA_DUPLICADA"
  | "ARQUIVO_DUPLICADO"
  | "FORNECEDOR_INATIVO"
  | "BOLETO_VENCIDO"
  | "BOLETO_SEM_NOTA"
  | "BOLETO_FALSO"
  // a IA leu errado (o documento está certo)
  | "IA_CAMPO_ILEGIVEL"
  | "IA_DIGITO_LINHA"
  | "IA_VALOR"
  | "IA_VENCIMENTO"
  | "IA_CNPJ"
  | "IA_QUANTIDADE";

export const ERRO_DA_IA = (d?: Defeito) => d?.startsWith("IA_") ?? false;

export type Evento = {
  /** O que está impresso no PDF. */
  verdade: Documento;
  /** O que a "IA" leu (gravado). Igual à verdade, salvo nos defeitos IA_*. */
  lida: Documento;
  recebidoEm: string;
  nomeArquivo: string;
  fornecedor: FornecedorSeed | null;
  destinatario: typeof GRUPO.matriz;
  segundaVia?: boolean;
  /** ARQUIVO_DUPLICADO: reenvia exatamente os bytes deste evento. */
  copiaDe?: Evento;
  /** Boleto: o evento da nota de onde ele saiu. */
  nota?: Evento;
  defeito?: Defeito;
};

const numeros = new Map<string, number>();
const proximoNumero = (f: FornecedorSeed) => {
  const n = (numeros.get(f.cnpj) ?? entre(1200, 9000)) + entre(1, 40);
  numeros.set(f.cnpj, n);
  return n;
};

/** Divide o total em n parcelas; a última leva a sobra dos centavos. */
function parcelas(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

export function novaNota(f: FornecedorSeed, emissao: string, opcoes: { grande?: boolean } = {}): Nfe {
  const destino = rand() < 0.7 ? GRUPO.matriz : GRUPO.filial;
  const qtdItens = entre(1, Math.min(4, f.produtos.length));
  const escolhidos = [...f.produtos].sort(() => rand() - 0.5).slice(0, qtdItens);
  const itens: ItemNfe[] = escolhidos.map((p) => {
    const unidades = p.fracionado ? entre(4, 40) * 2_500 : entre(3, 40) * 10_000; // m³ em quartos
    const quantidade = opcoes.grande ? unidades * entre(6, 12) : unidades;
    return { descricao: p.descricao, quantidade, valorUnitario: p.unitario, valorTotalCentavos: totalDoItemCentavos(quantidade, p.unitario) };
  });
  const produtos = itens.reduce((s, i) => s + i.valorTotalCentavos!, 0);
  const frete = rand() < 0.5 ? entre(8, 60) * 1_000 : 0;
  const ipi = rand() < 0.4 ? Math.round(produtos * 0.05) : 0;
  const desconto = rand() < 0.25 ? Math.round(produtos * 0.02) : 0;
  const total = produtos + frete + ipi - desconto;
  const n = proximoNumero(f);
  const qtdParcelas = total > 300_000 ? entre(2, 3) : entre(1, 2);
  return {
    tipo: "NFE",
    chaveAcesso: montarChave({ uf: f.uf, aamm: emissao.slice(2, 4) + emissao.slice(5, 7), cnpj: f.cnpj, serie: 1, numero: n, codigo: digitos(8) }),
    numero: n,
    serie: 1,
    dataEmissao: emissao,
    emitenteCnpj: f.cnpj,
    emitenteNome: f.nome,
    destinatarioCnpj: destino.cnpj,
    itens,
    totalProdutosCentavos: produtos,
    freteCentavos: frete,
    ipiCentavos: ipi,
    descontoCentavos: desconto,
    totalNotaCentavos: total,
    duplicatas: parcelas(total, qtdParcelas).map((valor, i) => ({
      numero: `${n}/${i + 1}`,
      vencimento: somarDias(emissao, 28 * (i + 1)),
      valorCentavos: valor,
    })),
  };
}

export function boletoDaParcela(n: Nfe, f: FornecedorSeed, i: number, ajustes: { valorCentavos?: number; beneficiarioCnpj?: string } = {}): Boleto {
  const d = n.duplicatas[i];
  const valor = ajustes.valorCentavos ?? d.valorCentavos!;
  return {
    tipo: "BOLETO",
    linhaDigitavel: montarLinhaDigitavel({ banco: f.banco[0], valorCentavos: valor, vencimento: d.vencimento!, campoLivre: digitos(25) }),
    beneficiarioCnpj: ajustes.beneficiarioCnpj ?? f.cnpj,
    beneficiarioNome: f.nome,
    pagadorCnpj: n.destinatarioCnpj,
    vencimento: d.vencimento,
    valorCentavos: valor,
    numeroDocumento: d.numero,
  };
}

export const destinatarioDe = (n: Nfe) => (n.destinatarioCnpj === GRUPO.filial.cnpj ? GRUPO.filial : GRUPO.matriz);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "");

export const nomeNota = (n: Nfe, f: FornecedorSeed) => `NFe_${n.numero}_${semAcento(f.nome).slice(0, 18)}.pdf`;
export const nomeBoleto = (b: Boleto) => `Boleto_${(b.numeroDocumento ?? "").replace("/", "-")}.pdf`;

/** Troca um dígito por outro parecido para um OCR (8↔3, 1↔7, 5↔6…). */
export function trocarDigito(texto: string, posicao: number): string {
  const pares: Record<string, string> = { "8": "3", "3": "8", "1": "7", "7": "1", "5": "6", "6": "5", "0": "8", "9": "4", "4": "9", "2": "7" };
  const c = texto[posicao];
  return texto.slice(0, posicao) + (pares[c] ?? "1") + texto.slice(posicao + 1);
}
