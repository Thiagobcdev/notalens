import { describe, expect, it } from "vitest";
import { acertoPorCampo, custoEstimado, diasEntre, formatarUSD, inicioDaSemana, mediana, motivosNaChegada, porSemana, semCorrecao } from "../metricas";

describe("custoEstimado", () => {
  it("Sonnet 5.5: 1.300 tokens de entrada e 300 de saída = US$ 0,0056", () => {
    const c = custoEstimado("claude-sonnet-5-5", 1300, 300);
    expect(c).toBe(1300 * 200 + 300 * 1000);
    expect(formatarUSD(c!)).toBe("US$ 0,0056");
  });
  it("reconhece o modelo pelo prefixo (versões com data)", () => {
    expect(custoEstimado("claude-opus-5-5-20261001", 1_000_000, 0)).toBe(400 * 1_000_000);
  });
  it("modelo fora da tabela ou sem tokens → null", () => {
    expect(custoEstimado("outro-modelo", 10, 10)).toBeNull();
    expect(custoEstimado(null, 10, 10)).toBeNull();
    expect(custoEstimado("claude-sonnet-5-5", null, 10)).toBeNull();
  });
  it("valores acima de um dólar com 2 casas", () => {
    expect(formatarUSD(123_456_789)).toBe("US$ 1,23");
  });
});

describe("acertoPorCampo", () => {
  const docs = [
    { id: "n1", tipo: "NFE" as const },
    { id: "n2", tipo: "NFE" as const },
    { id: "n3", tipo: "NFE" as const },
    { id: "n4", tipo: "NFE" as const },
    { id: "b1", tipo: "BOLETO" as const },
    { id: "b2", tipo: "BOLETO" as const },
  ];

  it("conta documentos, não ocorrências: dois itens corrigidos na mesma nota = 1 erro", () => {
    const r = acertoPorCampo(docs, [
      { documentoId: "n1", campo: "itens.0.quantidade" },
      { documentoId: "n1", campo: "itens.3.quantidade" },
      { documentoId: "n2", campo: "itens.1.quantidade" },
    ]);
    expect(r).toEqual([{ tipo: "NFE", campo: "itens.quantidade", lidos: 4, corrigidos: 2, acerto: 0.5 }]);
  });

  it("separa por tipo e ordena do pior acerto para o melhor", () => {
    const r = acertoPorCampo(docs, [
      { documentoId: "n1", campo: "emitenteCnpj" },
      { documentoId: "b1", campo: "valorCentavos" },
    ]);
    expect(r.map((x) => [x.tipo, x.campo, x.acerto])).toEqual([
      ["BOLETO", "valorCentavos", 0.5],
      ["NFE", "emitenteCnpj", 0.75],
    ]);
  });

  it("ignora correções de documentos fora da base (rejeitados, fora do período)", () => {
    expect(acertoPorCampo(docs, [{ documentoId: "x", campo: "numero" }])).toEqual([]);
  });

  it("semCorrecao conta os documentos sem nenhuma correção", () => {
    expect(semCorrecao(docs, [{ documentoId: "n1" }, { documentoId: "n1" }, { documentoId: "b2" }])).toBe(4);
  });
});

describe("motivosNaChegada", () => {
  it("conta cada regra uma vez por documento, da mais comum para a menos", () => {
    expect(
      motivosNaChegada([{ codigos: ["VENCIDO"] }, { codigos: ["CAMPO_AUSENTE", "CAMPO_AUSENTE", "VENCIDO"] }, { codigos: [] }]),
    ).toEqual([
      { codigo: "VENCIDO", documentos: 2 },
      { codigo: "CAMPO_AUSENTE", documentos: 1 },
    ]);
  });
});

describe("semanas", () => {
  it.each([
    ["2026-11-16", "2026-11-16"], // segunda
    ["2026-11-19", "2026-11-16"], // quinta
    ["2026-11-22", "2026-11-16"], // domingo fecha a semana
    ["2026-11-23", "2026-11-23"],
    ["2026-03-01", "2026-02-23"], // atravessa o mês
  ])("%s começa em %s", (d, s) => expect(inicioDaSemana(d)).toBe(s));

  it("agrupa e calcula a taxa de aprovação automática", () => {
    const r = porSemana([
      { recebidoEm: "2026-11-23", status: "EM_REVISAO" },
      { recebidoEm: "2026-11-17", status: "APROVADO_AUTO" },
      { recebidoEm: "2026-11-18", status: "APROVADO_AUTO" },
      { recebidoEm: "2026-11-19", status: "REJEITADO" },
      { recebidoEm: "2026-11-20", status: "APROVADO_AUTO" },
    ]);
    expect(r).toEqual([
      { inicio: "2026-11-16", recebidos: 4, automaticos: 3, taxa: 0.75 },
      { inicio: "2026-11-23", recebidos: 1, automaticos: 0, taxa: 0 },
    ]);
  });
});

describe("utilidades", () => {
  it("mediana", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });
  it("diasEntre", () => {
    expect(diasEntre("2026-10-30", "2026-11-02")).toBe(3);
  });
});
