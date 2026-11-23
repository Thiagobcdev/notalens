import { describe, expect, it } from "vitest";
import { dataParaFator, fatorParaData, lerLinhaDigitavel, mod10, montarLinhaDigitavel } from "../boleto";
import { decomporChave, dvDaChaveConfere, montarChave } from "../chave-nfe";
import { cnpjValido, completarCnpj, formatarCnpj } from "../cnpj";
import { diasUteisAte, isoValida } from "../datas";
import { lerDecimal, totalDoItemCentavos } from "../numeros";

describe("CNPJ (V1)", () => {
  it.each([
    ["11.222.333/0001-81", true],
    ["11222333000181", true],
    ["11.222.333/0001-82", false], // 2º DV errado
    ["11.222.333/0001-91", false], // 1º DV errado
    ["11111111111111", false], // repetido passa no cálculo, mas não é CNPJ
    ["1122233300018", false], // 13 dígitos
    ["12.ABC.345/01DE-35", true], // exemplo oficial da Receita de CNPJ alfanumérico
    ["12.ABC.345/01DE-36", false],
    ["12abc34501de35", true], // minúsculas viram maiúsculas
  ])("%s → %s", (cnpj, ok) => {
    expect(cnpjValido(cnpj)).toBe(ok);
  });

  it("completa os DVs e formata", () => {
    expect(completarCnpj("112223330001")).toBe("11222333000181");
    expect(formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("chave de acesso da NF-e (V2)", () => {
  const chave = montarChave({ uf: "53", aamm: "2611", cnpj: "11222333000181", serie: 1, numero: 4521, codigo: "12345678" });

  it("monta uma chave de 44 posições com DV que confere e decompõe de volta", () => {
    expect(chave).toHaveLength(44);
    expect(dvDaChaveConfere(chave)).toBe(true);
    expect(decomporChave(chave)).toMatchObject({ uf: "53", aamm: "2611", cnpj: "11222333000181", modelo: "55", serie: 1, numero: 4521 });
  });

  it("qualquer dígito trocado invalida o DV", () => {
    for (let i = 0; i < 43; i++) {
      const trocado = chave.slice(0, i) + ((Number(chave[i]) + 1) % 10) + chave.slice(i + 1);
      expect(dvDaChaveConfere(trocado), `posição ${i}`).toBe(false);
    }
  });

  it("aceita espaços como no DANFE e recusa tamanho errado", () => {
    expect(dvDaChaveConfere(chave.replace(/(.{4})/g, "$1 "))).toBe(true);
    expect(decomporChave(chave.slice(1))).toBeNull();
  });

  it("funciona com CNPJ alfanumérico na chave", () => {
    const alfa = montarChave({ uf: "35", aamm: "2611", cnpj: "12ABC34501DE35", serie: 2, numero: 9, codigo: "1" });
    expect(dvDaChaveConfere(alfa)).toBe(true);
    expect(decomporChave(alfa)?.cnpj).toBe("12ABC34501DE35");
  });
});

describe("linha digitável do boleto (V5)", () => {
  it("DVs de um boleto real do Banco do Brasil (exemplo público)", () => {
    // 00190.50095 40144.816069 06809.350314 3 37370000000100
    expect(mod10("001905009")).toBe(5);
    expect(mod10("4014481606")).toBe(9);
    expect(mod10("0680935031")).toBe(4);
    const lida = lerLinhaDigitavel("00190.50095 40144.816069 06809.350314 3 37370000000100");
    expect(lida.problemas).toEqual([]);
    expect(lida.valorCentavos).toBe(100);
    expect(fatorParaData(lida.fator!, "2007-12-01")).toBe("2007-12-31");
  });

  it("monta e lê de volta: valor, vencimento e DVs", () => {
    const l = montarLinhaDigitavel({ banco: "237", valorCentavos: 52_500, vencimento: "2026-12-05", campoLivre: "1234567890123456789012345" });
    const lida = lerLinhaDigitavel(l);
    expect(l).toHaveLength(47);
    expect(lida.problemas).toEqual([]);
    expect(lida.valorCentavos).toBe(52_500);
    expect(fatorParaData(lida.fator!, "2026-11-10")).toBe("2026-12-05");
  });

  it.each([
    [3, "DV_CAMPO_1"],
    [15, "DV_CAMPO_2"],
    [25, "DV_CAMPO_3"],
    [40, "DV_GERAL"], // mexer no valor quebra o DV geral
  ])("trocar o dígito %d acusa %s", (pos, problema) => {
    const l = montarLinhaDigitavel({ banco: "237", valorCentavos: 52_500, vencimento: "2026-12-05", campoLivre: "1234567890123456789012345" });
    const trocada = l.slice(0, pos) + ((Number(l[pos]) + 1) % 10) + l.slice(pos + 1);
    expect(lerLinhaDigitavel(trocada).problemas).toContain(problema);
  });

  it("fator de vencimento: virada de 21/02/2025 (9999) para 22/02/2025 (1000)", () => {
    expect(dataParaFator("2000-07-03")).toBe(1000);
    expect(dataParaFator("2025-02-21")).toBe(9999);
    expect(dataParaFator("2025-02-22")).toBe(1000);
    // o mesmo fator 1000 é decodificado pela data de referência
    expect(fatorParaData(1000, "2000-06-01")).toBe("2000-07-03");
    expect(fatorParaData(1000, "2025-02-01")).toBe("2025-02-22");
  });
});

describe("números sem float (V10)", () => {
  it.each([
    ["1.234,56", 2, 123_456],
    ["R$ 10,00", 2, 1_000],
    ["1234.56", 2, 123_456],
    ["25.000", 2, 2_500_000], // milhar
    ["0,1", 2, 10],
    ["12,5", 4, 125_000],
    ["1,234", 2, null], // casas demais
    ["abc", 2, null],
    ["", 2, null],
  ])("%s com %d casas → %s", (texto, casas, esperado) => {
    expect(lerDecimal(texto, casas, { milhar: true })).toBe(esperado);
  });

  it("quantidade × unitário arredonda half-up uma vez", () => {
    expect(totalDoItemCentavos(30_000, 33_333)).toBe(1_000); // 3 × 3,3333 = 9,9999 → R$ 10,00
    expect(totalDoItemCentavos(10_000, 12_345)).toBe(123); // 1,2345 → 1,23
    expect(totalDoItemCentavos(10_000, 12_350)).toBe(124); // 1,2350 → 1,24 (half-up)
    expect(totalDoItemCentavos(100_000_000, 99_999_999_999)).toBe(99_999_999_999_00); // sem estourar
  });
});

describe("datas", () => {
  it("valida ISO e conta dias úteis (fim de semana e feriado fixo)", () => {
    expect(isoValida("2026-02-30")).toBe(false);
    expect(diasUteisAte("2026-11-13", "2026-11-16")).toBe(1); // sex → seg
    expect(diasUteisAte("2026-11-19", "2026-11-23")).toBe(1); // 20/11 é feriado; 21–22 fim de semana
    expect(diasUteisAte("2026-11-10", "2026-11-10")).toBe(0);
  });
});
