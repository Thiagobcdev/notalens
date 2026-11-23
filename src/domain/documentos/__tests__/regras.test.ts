import { describe, expect, it } from "vitest";
import { normalizarChave } from "../chave-nfe";
import { normalizar, type ExtracaoBruta } from "../extracao";
import { paraBruto } from "../impressao";
import { decidir, validarDocumento } from "../regras";
import type { Documento } from "../tipos";
import { boleto, contexto, DESCONHECIDO, FILIAL, FORNECEDOR, INATIVO, linha, nfe } from "./fixtures";

/** Só os códigos, para os testes lerem como a regra. */
const codigos = (doc: Documento, ctx = contexto()) => validarDocumento(doc, ctx).map((v) => `${v.regra}:${v.codigo}@${v.campo}`);

describe("documentos limpos", () => {
  it("NF-e coerente é aprovada sozinha", () => {
    expect(decidir(nfe(), contexto())).toMatchObject({ status: "APROVADO_AUTO", exigeGestor: false, violacoes: [] });
  });

  it("boleto da parcela é aprovado sozinho", () => {
    expect(decidir(boleto(), contexto())).toMatchObject({ status: "APROVADO_AUTO", violacoes: [] });
  });

  it("destinatário pode ser qualquer CNPJ do grupo (filial)", () => {
    expect(codigos(nfe({ destinatarioCnpj: FILIAL }))).toEqual([]);
  });
});

describe("V1 — CNPJs", () => {
  it.each([
    [{ emitenteCnpj: "11222333000182" }, "V1:CNPJ_INVALIDO@emitenteCnpj"],
    [{ destinatarioCnpj: "11222333000182" }, "V1:CNPJ_INVALIDO@destinatarioCnpj"],
    [{ destinatarioCnpj: DESCONHECIDO }, "V1:NAO_E_DO_GRUPO@destinatarioCnpj"],
  ])("%o → %s", (ajuste, esperado) => {
    expect(codigos(nfe(ajuste))).toContain(esperado);
  });

  it("no boleto, o pagador tem de ser do grupo", () => {
    expect(codigos(boleto({ pagadorCnpj: DESCONHECIDO }))).toEqual(["V1:NAO_E_DO_GRUPO@pagadorCnpj"]);
  });
});

describe("V2 — chave de acesso confere com a nota", () => {
  it.each([
    [{ numero: 4522 }, "V2:CHAVE_X_NUMERO@numero"],
    [{ serie: 2 }, "V2:CHAVE_X_SERIE@serie"],
    [{ dataEmissao: "2026-10-31" }, "V2:CHAVE_X_EMISSAO@dataEmissao"],
    [{ chaveAcesso: "123" }, "V2:CHAVE_MALFORMADA@chaveAcesso"],
  ])("%o → %s", (ajuste, esperado) => {
    expect(codigos(nfe(ajuste))).toEqual([esperado]);
  });

  it("dígito trocado na chave acusa só o DV (não compara campos com uma chave errada)", () => {
    const c = nfe().chaveAcesso!;
    expect(codigos(nfe({ chaveAcesso: c.slice(0, 30) + ((Number(c[30]) + 1) % 10) + c.slice(31) }))).toEqual(["V2:CHAVE_DV@chaveAcesso"]);
  });

  it("emitente diferente do CNPJ da chave", () => {
    expect(codigos(nfe({ emitenteCnpj: INATIVO }))).toEqual(["V2:CHAVE_X_EMITENTE@emitenteCnpj", "V6:FORNECEDOR_INATIVO@emitenteCnpj"]);
  });
});

describe("V3 — as contas fecham", () => {
  it("tolera 1 centavo por item, não 2", () => {
    const itens = nfe().itens;
    const com = (total: number) => nfe({ itens: [{ ...itens[0], valorTotalCentavos: total }, itens[1]], totalProdutosCentavos: total + 45_000, totalNotaCentavos: total + 45_000 + 10_000 });
    expect(codigos(com(50_001))).not.toContain("V3:ITEM_NAO_FECHA@itens.0.valorTotalCentavos");
    expect(codigos(com(50_002))).toContain("V3:ITEM_NAO_FECHA@itens.0.valorTotalCentavos");
  });

  it("soma dos itens diferente do total dos produtos", () => {
    expect(codigos(nfe({ totalProdutosCentavos: 96_000, totalNotaCentavos: 106_000 }))).toContain(
      "V3:PRODUTOS_NAO_FECHAM@totalProdutosCentavos",
    );
  });

  it("total da nota = produtos + frete + IPI − desconto", () => {
    expect(codigos(nfe({ descontoCentavos: 0 }))).toEqual(["V3:TOTAL_NAO_FECHA@totalNotaCentavos"]);
  });

  it("frete, IPI e desconto ausentes contam como zero", () => {
    expect(
      codigos(nfe({ freteCentavos: null, ipiCentavos: null, descontoCentavos: null, totalNotaCentavos: 95_000, duplicatas: [] })),
    ).toEqual([]);
  });

  it("parcelas somam o total da nota", () => {
    const [d1, d2] = nfe().duplicatas;
    expect(codigos(nfe({ duplicatas: [d1, { ...d2, valorCentavos: 52_000 }] }))).toEqual(["V3:DUPLICATAS_NAO_FECHAM@duplicatas"]);
  });
});

describe("V4 — duplicidade", () => {
  const ja = (x: Partial<{ chaves: string[]; linhas: string[]; hashes: string[] }>) =>
    contexto({
      jaRecebidos: { chaves: new Set(x.chaves), linhas: new Set(x.linhas), hashes: new Set(x.hashes) },
    });

  it("mesma chave", () => {
    expect(codigos(nfe(), ja({ chaves: [normalizarChave(nfe().chaveAcesso!)] }))).toEqual(["V4:NOTA_DUPLICADA@chaveAcesso"]);
  });

  it("mesma linha digitável", () => {
    expect(codigos(boleto(), ja({ linhas: [linha()] }))).toEqual(["V4:BOLETO_DUPLICADO@linhaDigitavel"]);
  });

  it("mesmo arquivo (hash) aparece primeiro", () => {
    expect(codigos(nfe(), ja({ hashes: ["abc"] }))[0]).toBe("V4:ARQUIVO_DUPLICADO@arquivo");
  });
});

describe("V5 — linha digitável confere com o boleto", () => {
  it("valor impresso diferente do valor codificado", () => {
    expect(codigos(boleto({ valorCentavos: 52_000 }))).toContain("V5:LINHA_X_VALOR@valorCentavos");
  });

  it("vencimento impresso diferente do fator", () => {
    expect(codigos(boleto({ vencimento: "2026-12-06" }))).toEqual([
      "V5:LINHA_X_VENCIMENTO@vencimento",
      "V6:VENCIMENTO_DIFERENTE_DA_PARCELA@vencimento",
    ]);
  });

  it("DV errado", () => {
    const l = linha();
    expect(codigos(boleto({ linhaDigitavel: l.slice(0, 5) + ((Number(l[5]) + 1) % 10) + l.slice(6) }))).toEqual([
      "V5:LINHA_DV@linhaDigitavel",
    ]);
  });

  it("boleto sem valor no código é só alerta", () => {
    const r = decidir(boleto({ linhaDigitavel: linha(0) }), contexto());
    expect(r.violacoes.map((v) => v.codigo)).toEqual(["LINHA_SEM_VALOR"]);
    expect(r.status).toBe("APROVADO_AUTO");
  });
});

describe("V6 — fornecedor e casamento boleto ↔ nota", () => {
  it("fornecedor desconhecido", () => {
    expect(codigos(boleto({ beneficiarioCnpj: DESCONHECIDO }))).toContain("V6:FORNECEDOR_DESCONHECIDO@beneficiarioCnpj");
  });

  it("casa pelo total da nota (pagamento à vista)", () => {
    const b = boleto({ valorCentavos: 105_000, linhaDigitavel: linha(105_000) });
    expect(codigos(b)).toEqual([]);
  });

  it("parcelas de mesmo valor: casa pela que tem o mesmo vencimento (sem alerta falso)", () => {
    const b = boleto({ vencimento: "2027-01-05", linhaDigitavel: linha(52_500, "2027-01-05"), numeroDocumento: "4521/2" });
    expect(codigos(b)).toEqual([]);
  });

  it("valor que não é de nenhuma nota nem parcela", () => {
    const b = boleto({ valorCentavos: 70_000, linhaDigitavel: linha(70_000) });
    expect(codigos(b)).toEqual(["V6:SEM_NOTA@valorCentavos"]);
  });

  it("fornecedor sem nenhuma nota recebida", () => {
    const r = validarDocumento(boleto(), contexto({ notas: [] }));
    expect(r.map((v) => v.mensagem)).toEqual(["Nenhuma nota deste fornecedor foi recebida."]);
  });
});

describe("V7 — vencimento", () => {
  it("boleto vencido no recebimento vai para revisão", () => {
    const b = boleto({ vencimento: "2026-11-09", linhaDigitavel: linha(52_500, "2026-11-09") });
    expect(codigos(b)).toContain("V7:VENCIDO@vencimento");
  });

  it("menos de 3 dias úteis: urgente, mas aprovado", () => {
    const b = boleto({ vencimento: "2026-11-12", linhaDigitavel: linha(52_500, "2026-11-12") });
    const r = decidir(b, contexto({ notas: [{ ...contexto().notas[0], duplicatas: [{ valorCentavos: 52_500, vencimento: "2026-11-12" }] }] }));
    expect(r).toMatchObject({ status: "APROVADO_AUTO", urgente: true });
  });

  it("3 dias úteis ou mais não é urgente", () => {
    expect(decidir(boleto(), contexto()).urgente).toBe(false);
  });

  it("parcela vencida na nota é só alerta", () => {
    const [d1, d2] = nfe().duplicatas;
    const r = decidir(nfe({ duplicatas: [{ ...d1, vencimento: "2026-11-01" }, d2] }), contexto());
    expect(r.status).toBe("APROVADO_AUTO");
    expect(r.violacoes.map((v) => `${v.regra}:${v.severidade}`)).toEqual(["V7:ALERTA"]);
  });
});

describe("V8 — campos obrigatórios", () => {
  it("campo que a IA não leu vai para revisão e não gera erros em cascata", () => {
    expect(codigos(nfe({ totalNotaCentavos: null, duplicatas: [] }))).toEqual(["V8:CAMPO_AUSENTE@totalNotaCentavos"]);
  });

  it("nota sem itens", () => {
    expect(codigos(nfe({ itens: [], totalProdutosCentavos: 95_000 }))).toEqual(["V8:SEM_ITENS@itens"]);
  });

  it("boleto sem linha digitável", () => {
    expect(codigos(boleto({ linhaDigitavel: null }))).toEqual(["V8:CAMPO_AUSENTE@linhaDigitavel"]);
  });
});

describe("V9 — alçada", () => {
  it("acima da alçada vai para o gestor, mesmo com tudo certo", () => {
    const r = decidir(nfe(), contexto({ alcadaCentavos: 100_000 }));
    expect(r).toMatchObject({ status: "EM_REVISAO", exigeGestor: true });
    expect(r.violacoes.map((v) => v.regra)).toEqual(["V9"]);
  });

  it("exatamente na alçada não exige gestor", () => {
    expect(decidir(nfe(), contexto({ alcadaCentavos: 105_000 })).exigeGestor).toBe(false);
  });
});

describe("normalização da extração (V10)", () => {
  const bruta: ExtracaoBruta = {
    tipo: "NFE",
    chaveAcesso: nfe().chaveAcesso!.replace(/(.{4})/g, "$1 "),
    numero: "000.004.521",
    serie: "001",
    dataEmissao: "05/11/2026",
    emitenteCnpj: "44.555.666/0001-" + FORNECEDOR.slice(12),
    emitenteNome: "Cimentos Planalto Ltda",
    destinatarioCnpj: "11.222.333/0001-81",
    itens: [
      { descricao: "Cimento CP-II 50kg", quantidade: "10,0000", valorUnitario: "50,0000", valorTotal: "500,00" },
      { descricao: "Areia média m³", quantidade: "2,5000", valorUnitario: "180,0000", valorTotal: "450,00" },
    ],
    totalProdutos: "950,00",
    frete: "120,00",
    ipi: "30,00",
    desconto: "50,00",
    totalNota: "1.050,00",
    duplicatas: [
      { numero: "4521/1", vencimento: "05/12/2026", valor: "525,00" },
      { numero: "4521/2", vencimento: "05/01/2027", valor: "525,00" },
    ],
  };

  it("o texto impresso no DANFE vira exatamente a nota da fixture", () => {
    expect(normalizar(bruta)).toEqual(nfe());
  });

  it("texto ilegível vira null e cai em V8", () => {
    const doc = normalizar({ ...bruta, totalNota: "1.05O,00", dataEmissao: "31/02/2026", duplicatas: [] });
    expect(codigos(doc)).toEqual(["V8:CAMPO_AUSENTE@dataEmissao", "V8:CAMPO_AUSENTE@totalNotaCentavos"]);
  });

  it("boleto: linha com pontuação e valor com R$", () => {
    const l = linha();
    const doc = normalizar({
      tipo: "BOLETO",
      linhaDigitavel: `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10)}`,
      beneficiarioCnpj: FORNECEDOR,
      beneficiarioNome: "Cimentos Planalto Ltda",
      pagadorCnpj: "11.222.333/0001-81",
      vencimento: "05/12/2026",
      valor: "R$ 525,00",
      numeroDocumento: "4521/1",
    });
    expect(doc).toEqual(boleto());
  });
});

describe("impressão ↔ normalização", () => {
  it("imprimir e ler de volta dá o mesmo documento (NF-e e boleto)", () => {
    for (const doc of [nfe(), boleto(), nfe({ totalNotaCentavos: 123_456_789 })]) {
      expect(normalizar(paraBruto(doc))).toEqual(doc);
    }
  });
});
