/**
 * Documento já normalizado: o que a IA extraiu, convertido para inteiros e ISO.
 * `null` = a IA não conseguiu ler o campo (ou ele não estava no documento).
 */

export type ItemNfe = {
  descricao: string | null;
  /** 4 casas decimais (1,5 un → 15_000). */
  quantidade: number | null;
  /** Reais com 4 casas decimais (R$ 12,3456 → 123_456). */
  valorUnitario: number | null;
  valorTotalCentavos: number | null;
};

export type Duplicata = {
  numero: string | null;
  vencimento: string | null;
  valorCentavos: number | null;
};

export type Nfe = {
  tipo: "NFE";
  chaveAcesso: string | null;
  numero: number | null;
  serie: number | null;
  dataEmissao: string | null;
  emitenteCnpj: string | null;
  emitenteNome: string | null;
  destinatarioCnpj: string | null;
  itens: ItemNfe[];
  totalProdutosCentavos: number | null;
  freteCentavos: number | null;
  ipiCentavos: number | null;
  descontoCentavos: number | null;
  totalNotaCentavos: number | null;
  duplicatas: Duplicata[];
};

export type Boleto = {
  tipo: "BOLETO";
  linhaDigitavel: string | null;
  beneficiarioCnpj: string | null;
  beneficiarioNome: string | null;
  pagadorCnpj: string | null;
  vencimento: string | null;
  valorCentavos: number | null;
  /** Número do documento impresso no boleto (costuma ser o número da nota). */
  numeroDocumento: string | null;
};

export type Documento = Nfe | Boleto;
export type TipoDocumento = Documento["tipo"];

export type CodigoRegra = "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9";
export type Severidade = "BLOQUEIA" | "ALERTA";

/** Uma regra que não passou. `campo` aponta onde a tela deve destacar o problema ("itens.2.valorTotalCentavos"). */
export type Violacao = {
  regra: CodigoRegra;
  codigo: string;
  campo: string;
  severidade: Severidade;
  mensagem: string;
};

export type NotaConhecida = {
  emitenteCnpj: string;
  numero: number;
  /** null se a nota ainda está com o total ilegível (as parcelas continuam valendo). */
  totalNotaCentavos: number | null;
  duplicatas: { valorCentavos: number; vencimento: string }[];
};

/** O que o motor precisa saber do mundo para validar um documento. Tudo vem do banco, montado pelo servidor. */
export type Contexto = {
  /** CNPJs (normalizados) das empresas do grupo: o destinatário/pagador tem de ser um deles. */
  cnpjsDoGrupo: readonly string[];
  fornecedores: readonly { cnpj: string; nome: string; ativo: boolean }[];
  /** Documentos já recebidos (sem contar este). */
  jaRecebidos: { chaves: ReadonlySet<string>; linhas: ReadonlySet<string>; hashes: ReadonlySet<string> };
  /** Notas já recebidas, para casar boletos (V6). */
  notas: readonly NotaConhecida[];
  hashArquivo: string;
  /** Data de recebimento (ISO). */
  recebidoEm: string;
  /** V9: acima disso, só o gestor aprova. */
  alcadaCentavos: number;
};

export type Decisao = {
  status: "APROVADO_AUTO" | "EM_REVISAO";
  /** V9: a aprovação final precisa ser do GESTOR. */
  exigeGestor: boolean;
  urgente: boolean;
  violacoes: Violacao[];
};
