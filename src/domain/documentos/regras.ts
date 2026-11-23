import { lerLinhaDigitavel, fatorParaData } from "./boleto";
import { decomporChave, dvDaChaveConfere, normalizarChave } from "./chave-nfe";
import { cnpjValido, formatarCnpj, normalizarCnpj } from "./cnpj";
import { diasUteisAte, isoValida } from "./datas";
import { formatarBRL, somar, soDigitos, totalDoItemCentavos } from "./numeros";
import type { Boleto, CodigoRegra, Contexto, Decisao, Documento, Nfe, Severidade, Violacao } from "./tipos";

/** V3: diferença tolerada entre quantidade × unitário e o total impresso do item. */
export const TOLERANCIA_ITEM_CENTAVOS = 1;
/** V7: faltando menos que isso de dias úteis, o documento é marcado como urgente. */
export const DIAS_UTEIS_URGENTE = 3;

const v = (regra: CodigoRegra, codigo: string, campo: string, severidade: Severidade, mensagem: string): Violacao => ({
  regra,
  codigo,
  campo,
  severidade,
  mensagem,
});

const BLOQUEIA = "BLOQUEIA" as const;
const ALERTA = "ALERTA" as const;

// ───────────────────────────── V8: campos obrigatórios ─────────────────────────────

const OBRIGATORIOS_NFE = [
  "chaveAcesso",
  "numero",
  "serie",
  "dataEmissao",
  "emitenteCnpj",
  "destinatarioCnpj",
  "totalProdutosCentavos",
  "totalNotaCentavos",
] as const satisfies readonly (keyof Nfe)[];

const OBRIGATORIOS_BOLETO = [
  "linhaDigitavel",
  "beneficiarioCnpj",
  "pagadorCnpj",
  "vencimento",
  "valorCentavos",
] as const satisfies readonly (keyof Boleto)[];

function camposObrigatorios(doc: Documento): Violacao[] {
  const faltando: string[] =
    doc.tipo === "NFE"
      ? OBRIGATORIOS_NFE.filter((c) => doc[c] === null)
      : OBRIGATORIOS_BOLETO.filter((c) => doc[c] === null);
  const out = faltando.map((campo) => v("V8", "CAMPO_AUSENTE", campo, BLOQUEIA, "A IA não conseguiu ler este campo."));
  if (doc.tipo === "NFE") {
    if (doc.itens.length === 0) out.push(v("V8", "SEM_ITENS", "itens", BLOQUEIA, "Nenhum item foi lido na nota."));
    doc.itens.forEach((it, i) => {
      for (const c of ["quantidade", "valorUnitario", "valorTotalCentavos"] as const) {
        if (it[c] === null) out.push(v("V8", "CAMPO_AUSENTE", `itens.${i}.${c}`, BLOQUEIA, `Item ${i + 1}: campo não lido.`));
      }
    });
  }
  for (const campo of doc.tipo === "NFE" ? ["dataEmissao"] : ["vencimento"]) {
    const valor = (doc as Record<string, unknown>)[campo];
    if (typeof valor === "string" && !isoValida(valor)) out.push(v("V8", "DATA_INVALIDA", campo, BLOQUEIA, "Data inválida."));
  }
  return out;
}

// ───────────────────────────── V1: CNPJs ─────────────────────────────

function cnpjs(campoEmissor: string, emissor: string | null, campoDestino: string, destino: string | null, ctx: Contexto): Violacao[] {
  const out: Violacao[] = [];
  if (emissor !== null && !cnpjValido(emissor)) {
    out.push(v("V1", "CNPJ_INVALIDO", campoEmissor, BLOQUEIA, `CNPJ ${formatarCnpj(emissor)} com dígito verificador errado.`));
  }
  if (destino !== null) {
    if (!cnpjValido(destino)) {
      out.push(v("V1", "CNPJ_INVALIDO", campoDestino, BLOQUEIA, `CNPJ ${formatarCnpj(destino)} com dígito verificador errado.`));
    } else if (!ctx.cnpjsDoGrupo.includes(normalizarCnpj(destino))) {
      out.push(v("V1", "NAO_E_DO_GRUPO", campoDestino, BLOQUEIA, `${formatarCnpj(destino)} não é um CNPJ do grupo.`));
    }
  }
  return out;
}

// ───────────────────────────── V6: fornecedor ─────────────────────────────

function fornecedor(campo: string, cnpj: string | null, ctx: Contexto): Violacao[] {
  if (cnpj === null || !cnpjValido(cnpj)) return []; // já apontado em V8/V1
  const f = ctx.fornecedores.find((x) => x.cnpj === normalizarCnpj(cnpj));
  if (!f) return [v("V6", "FORNECEDOR_DESCONHECIDO", campo, BLOQUEIA, `${formatarCnpj(cnpj)} não é um fornecedor cadastrado.`)];
  if (!f.ativo) return [v("V6", "FORNECEDOR_INATIVO", campo, BLOQUEIA, `O fornecedor ${f.nome} está inativo.`)];
  return [];
}

// ───────────────────────────── NF-e ─────────────────────────────

function chaveConfere(n: Nfe): Violacao[] {
  if (n.chaveAcesso === null) return [];
  const partes = decomporChave(n.chaveAcesso);
  if (!partes) return [v("V2", "CHAVE_MALFORMADA", "chaveAcesso", BLOQUEIA, "A chave de acesso não tem 44 posições.")];
  if (!dvDaChaveConfere(n.chaveAcesso)) {
    return [v("V2", "CHAVE_DV", "chaveAcesso", BLOQUEIA, "O dígito verificador da chave de acesso não confere.")];
  }
  const out: Violacao[] = [];
  if (partes.modelo !== "55") out.push(v("V2", "CHAVE_MODELO", "chaveAcesso", BLOQUEIA, `Modelo ${partes.modelo} na chave: esperado 55 (NF-e).`));
  if (n.emitenteCnpj !== null && partes.cnpj !== normalizarCnpj(n.emitenteCnpj)) {
    out.push(v("V2", "CHAVE_X_EMITENTE", "emitenteCnpj", BLOQUEIA, "O CNPJ do emitente não é o que está na chave de acesso."));
  }
  if (n.numero !== null && partes.numero !== n.numero) {
    out.push(v("V2", "CHAVE_X_NUMERO", "numero", BLOQUEIA, `A chave indica a nota nº ${partes.numero}.`));
  }
  if (n.serie !== null && partes.serie !== n.serie) {
    out.push(v("V2", "CHAVE_X_SERIE", "serie", BLOQUEIA, `A chave indica a série ${partes.serie}.`));
  }
  if (n.dataEmissao !== null && isoValida(n.dataEmissao) && partes.aamm !== n.dataEmissao.slice(2, 4) + n.dataEmissao.slice(5, 7)) {
    out.push(v("V2", "CHAVE_X_EMISSAO", "dataEmissao", BLOQUEIA, `A chave indica emissão em ${partes.aamm.slice(2)}/20${partes.aamm.slice(0, 2)}.`));
  }
  return out;
}

function totaisConferem(n: Nfe): Violacao[] {
  const out: Violacao[] = [];
  n.itens.forEach((it, i) => {
    if (it.quantidade === null || it.valorUnitario === null || it.valorTotalCentavos === null) return;
    const esperado = totalDoItemCentavos(it.quantidade, it.valorUnitario);
    if (Math.abs(esperado - it.valorTotalCentavos) > TOLERANCIA_ITEM_CENTAVOS) {
      out.push(
        v("V3", "ITEM_NAO_FECHA", `itens.${i}.valorTotalCentavos`, BLOQUEIA, `Item ${i + 1}: quantidade × unitário dá ${formatarBRL(esperado)}.`),
      );
    }
  });

  const totais = n.itens.map((i) => i.valorTotalCentavos);
  if (n.totalProdutosCentavos !== null && n.itens.length > 0 && totais.every((t) => t !== null)) {
    const soma = somar(totais as number[]);
    if (soma !== n.totalProdutosCentavos) {
      out.push(v("V3", "PRODUTOS_NAO_FECHAM", "totalProdutosCentavos", BLOQUEIA, `A soma dos itens dá ${formatarBRL(soma)}.`));
    }
  }

  if (n.totalProdutosCentavos !== null && n.totalNotaCentavos !== null) {
    const esperado = n.totalProdutosCentavos + (n.freteCentavos ?? 0) + (n.ipiCentavos ?? 0) - (n.descontoCentavos ?? 0);
    if (esperado !== n.totalNotaCentavos) {
      out.push(
        v("V3", "TOTAL_NAO_FECHA", "totalNotaCentavos", BLOQUEIA, `Produtos + frete + IPI − desconto dá ${formatarBRL(esperado)}.`),
      );
    }
  }

  const valores = n.duplicatas.map((d) => d.valorCentavos);
  if (n.totalNotaCentavos !== null && n.duplicatas.length > 0 && valores.every((x) => x !== null)) {
    const soma = somar(valores as number[]);
    if (soma !== n.totalNotaCentavos) {
      out.push(v("V3", "DUPLICATAS_NAO_FECHAM", "duplicatas", BLOQUEIA, `As parcelas somam ${formatarBRL(soma)}, diferente do total da nota.`));
    }
  }
  return out;
}

function validarNfe(n: Nfe, ctx: Contexto): Violacao[] {
  const out = [
    ...cnpjs("emitenteCnpj", n.emitenteCnpj, "destinatarioCnpj", n.destinatarioCnpj, ctx),
    ...chaveConfere(n),
    ...totaisConferem(n),
    ...fornecedor("emitenteCnpj", n.emitenteCnpj, ctx),
  ];
  if (n.chaveAcesso !== null && ctx.jaRecebidos.chaves.has(normalizarChave(n.chaveAcesso))) {
    out.push(v("V4", "NOTA_DUPLICADA", "chaveAcesso", BLOQUEIA, "Esta nota já foi recebida."));
  }
  // V7 na nota: parcela vencida é só alerta; quem paga é o boleto.
  n.duplicatas.forEach((d, i) => {
    if (d.vencimento !== null && isoValida(d.vencimento) && d.vencimento < ctx.recebidoEm) {
      out.push(v("V7", "PARCELA_VENCIDA", `duplicatas.${i}.vencimento`, ALERTA, `A parcela ${i + 1} já estava vencida no recebimento.`));
    }
  });
  return out;
}

// ───────────────────────────── Boleto ─────────────────────────────

function linhaConfere(b: Boleto, ctx: Contexto): Violacao[] {
  if (b.linhaDigitavel === null) return [];
  const lida = lerLinhaDigitavel(b.linhaDigitavel);
  if (lida.problemas.includes("TAMANHO")) {
    return [v("V5", "LINHA_MALFORMADA", "linhaDigitavel", BLOQUEIA, "A linha digitável não tem 47 dígitos.")];
  }
  if (lida.problemas.length > 0) {
    return [v("V5", "LINHA_DV", "linhaDigitavel", BLOQUEIA, `Dígito verificador errado (${lida.problemas.join(", ")}).`)];
  }
  const out: Violacao[] = [];
  if (b.valorCentavos !== null && lida.valorCentavos !== null) {
    if (lida.valorCentavos === 0) {
      out.push(v("V5", "LINHA_SEM_VALOR", "valorCentavos", ALERTA, "O boleto não traz valor no código; confira o valor impresso."));
    } else if (lida.valorCentavos !== b.valorCentavos) {
      out.push(v("V5", "LINHA_X_VALOR", "valorCentavos", BLOQUEIA, `A linha digitável indica ${formatarBRL(lida.valorCentavos)}.`));
    }
  }
  if (b.vencimento !== null && isoValida(b.vencimento) && lida.fator !== null) {
    const daLinha = fatorParaData(lida.fator, ctx.recebidoEm);
    if (daLinha !== null && daLinha !== b.vencimento) {
      const [a, m, d] = daLinha.split("-");
      out.push(v("V5", "LINHA_X_VENCIMENTO", "vencimento", BLOQUEIA, `A linha digitável indica vencimento em ${d}/${m}/${a}.`));
    }
  }
  return out;
}

/** V6: o boleto tem de corresponder a uma nota do mesmo fornecedor (total ou uma das parcelas). */
function casarComNota(b: Boleto, ctx: Contexto): Violacao[] {
  if (b.beneficiarioCnpj === null || b.valorCentavos === null) return [];
  const cnpj = normalizarCnpj(b.beneficiarioCnpj);
  const notas = ctx.notas.filter((n) => n.emitenteCnpj === cnpj);
  // Parcelas iguais são comuns (3 × R$ 500): casa primeiro por valor E vencimento.
  const mesmoValor = notas.flatMap((n) => n.duplicatas).filter((d) => d.valorCentavos === b.valorCentavos);
  if (mesmoValor.length > 0) {
    return b.vencimento !== null && !mesmoValor.some((d) => d.vencimento === b.vencimento)
      ? [v("V6", "VENCIMENTO_DIFERENTE_DA_PARCELA", "vencimento", ALERTA, "O vencimento difere do da parcela na nota.")]
      : [];
  }
  if (notas.some((n) => n.totalNotaCentavos === b.valorCentavos)) return [];
  return [
    v(
      "V6",
      "SEM_NOTA",
      "valorCentavos",
      BLOQUEIA,
      notas.length === 0
        ? "Nenhuma nota deste fornecedor foi recebida."
        : `Nenhuma nota ou parcela deste fornecedor tem o valor de ${formatarBRL(b.valorCentavos)}.`,
    ),
  ];
}

function validarBoleto(b: Boleto, ctx: Contexto): Violacao[] {
  const out = [
    ...cnpjs("beneficiarioCnpj", b.beneficiarioCnpj, "pagadorCnpj", b.pagadorCnpj, ctx),
    ...linhaConfere(b, ctx),
    ...fornecedor("beneficiarioCnpj", b.beneficiarioCnpj, ctx),
    ...casarComNota(b, ctx),
  ];
  if (b.linhaDigitavel !== null && ctx.jaRecebidos.linhas.has(soDigitos(b.linhaDigitavel))) {
    out.push(v("V4", "BOLETO_DUPLICADO", "linhaDigitavel", BLOQUEIA, "Este boleto já foi recebido."));
  }
  if (b.vencimento !== null && isoValida(b.vencimento) && b.vencimento < ctx.recebidoEm) {
    out.push(v("V7", "VENCIDO", "vencimento", BLOQUEIA, "O boleto já estava vencido no recebimento."));
  }
  return out;
}

// ───────────────────────────── entrada pública ─────────────────────────────

/** Valor que conta para a alçada (V9). */
export const valorDoDocumento = (doc: Documento) => (doc.tipo === "NFE" ? doc.totalNotaCentavos : doc.valorCentavos);

/** Vencimento mais próximo do documento (para V7 "urgente"). */
export function vencimentoDoDocumento(doc: Documento): string | null {
  if (doc.tipo === "BOLETO") return doc.vencimento;
  const datas = doc.duplicatas.map((d) => d.vencimento).filter((d): d is string => d !== null && isoValida(d));
  return datas.sort()[0] ?? null;
}

/** Roda V1–V9 e devolve todas as violações (nunca para na primeira: a revisão mostra tudo de uma vez). */
export function validarDocumento(doc: Documento, ctx: Contexto): Violacao[] {
  const out = [...camposObrigatorios(doc), ...(doc.tipo === "NFE" ? validarNfe(doc, ctx) : validarBoleto(doc, ctx))];
  if (ctx.jaRecebidos.hashes.has(ctx.hashArquivo)) {
    out.unshift(v("V4", "ARQUIVO_DUPLICADO", "arquivo", BLOQUEIA, "Este mesmo arquivo já foi enviado."));
  }
  const valor = valorDoDocumento(doc);
  if (valor !== null && valor > ctx.alcadaCentavos) {
    out.push(v("V9", "ACIMA_DA_ALCADA", "valor", BLOQUEIA, `Acima de ${formatarBRL(ctx.alcadaCentavos)}: a aprovação é do gestor.`));
  }
  return out;
}

/** Aprovação automática só sem nenhuma violação que bloqueia. Alertas não seguram o documento. */
export function decidir(doc: Documento, ctx: Contexto): Decisao {
  const violacoes = validarDocumento(doc, ctx);
  const vencimento = vencimentoDoDocumento(doc);
  return {
    status: violacoes.some((x) => x.severidade === BLOQUEIA) ? "EM_REVISAO" : "APROVADO_AUTO",
    exigeGestor: violacoes.some((x) => x.regra === "V9"),
    urgente: vencimento !== null && vencimento >= ctx.recebidoEm && diasUteisAte(ctx.recebidoEm, vencimento) < DIAS_UTEIS_URGENTE,
    violacoes,
  };
}
