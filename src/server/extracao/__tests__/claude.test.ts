import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { decidir, normalizar, paraBruto } from "@/domain/documentos";
import { boleto, contexto, nfe } from "@/domain/documentos/__tests__/fixtures";
import { ExtratorClaude, INSTRUCOES, MODELO_PADRAO, type RespostaModelo } from "../claude";
import { ErroDeExtracao } from "../extrator";

type Params = Record<string, unknown> & { messages: { content: { type: string; source?: { data: string; media_type: string } }[] }[] };

/** Cliente falso: guarda os parâmetros enviados e devolve a resposta (ou o erro) combinada. */
function clienteFalso(resposta: Partial<Record<string, unknown>> | Error) {
  const chamadas: Params[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Params) => {
          chamadas.push(params);
          if (resposta instanceof Error) throw resposta;
          return {
            model: MODELO_PADRAO,
            stop_reason: "end_turn",
            usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
            ...resposta,
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, chamadas };
}

const PDF = new TextEncoder().encode("%PDF-1.7 documento de teste");
const respostaNfe: RespostaModelo = { tipoDocumento: "NFE", nfe: paraBruto(nfe()) as RespostaModelo["nfe"], boleto: null };

describe("ExtratorClaude", () => {
  it("envia o PDF em base64 como documento, com schema fixo, esforço baixo e fallback de recusa", async () => {
    const { client, chamadas } = clienteFalso({ parsed_output: respostaNfe });
    await new ExtratorClaude({ client }).extrair(PDF);

    const p = chamadas[0];
    expect(p.model).toBe(MODELO_PADRAO);
    expect(p.system).toBe(INSTRUCOES);
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect((p.output_config as { effort: string }).effort).toBe("low");
    const [doc, texto] = p.messages[0].content;
    expect(doc.type).toBe("document");
    expect(doc.source?.media_type).toBe("application/pdf");
    expect(Buffer.from(doc.source!.data, "base64").toString()).toBe("%PDF-1.7 documento de teste");
    expect(texto.type).toBe("text");
  });

  it("o modelo pode ser trocado por configuração", async () => {
    const { client, chamadas } = clienteFalso({ parsed_output: respostaNfe });
    await new ExtratorClaude({ client, modelo: "claude-opus-5-5" }).extrair(PDF);
    expect(chamadas[0].model).toBe("claude-opus-5-5");
  });

  it("devolve a NF-e lida, com tokens (incluindo cache) e o modelo que respondeu", async () => {
    const { client } = clienteFalso({ parsed_output: respostaNfe, model: "claude-sonnet-5" });
    const r = await new ExtratorClaude({ client }).extrair(PDF);
    expect(r).toMatchObject({ origem: "CLAUDE", modelo: "claude-sonnet-5", tokensEntrada: 1300, tokensSaida: 300 });
    // O texto lido segue o mesmo caminho da demo: normaliza e passa nas regras.
    expect(normalizar(r.bruto)).toEqual(nfe());
    expect(decidir(normalizar(r.bruto), contexto()).status).toBe("APROVADO_AUTO");
  });

  it("devolve o boleto quando o documento é boleto", async () => {
    const { client } = clienteFalso({ parsed_output: { tipoDocumento: "BOLETO", nfe: null, boleto: paraBruto(boleto()) } });
    const r = await new ExtratorClaude({ client }).extrair(PDF);
    expect(normalizar(r.bruto)).toEqual(boleto());
  });

  it.each([
    ["documento que não é NF-e nem boleto", { parsed_output: { tipoDocumento: "OUTRO", nfe: null, boleto: null } }, /nem um boleto/],
    ["tipo NFE sem os campos", { parsed_output: { tipoDocumento: "NFE", nfe: null, boleto: null } }, /nem um boleto/],
    ["recusa", { stop_reason: "refusal", parsed_output: null }, /recusou/],
    ["resposta cortada", { stop_reason: "max_tokens", parsed_output: null }, /cortada/],
    ["fora do formato", { parsed_output: null }, /fora do formato/],
  ])("%s vira ErroDeExtracao (documento fica como falha de leitura)", async (_, resposta, mensagem) => {
    const { client } = clienteFalso(resposta);
    await expect(new ExtratorClaude({ client }).extrair(PDF)).rejects.toThrow(mensagem);
    await expect(new ExtratorClaude({ client }).extrair(PDF)).rejects.toBeInstanceOf(ErroDeExtracao);
  });

  it.each([
    [new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", new Headers()), /Chave da API/],
    [new Anthropic.RateLimitError(429, {}, "rate limited", new Headers()), /Limite de uso/],
    [new Anthropic.InternalServerError(500, {}, "boom", new Headers()), /Erro da API do Claude \(500\)/],
    [new Anthropic.APIConnectionError({ message: "offline" }), /Sem conexão/],
  ])("erro da API %#: mensagem clara para o usuário", async (erro, mensagem) => {
    const { client } = clienteFalso(erro);
    await expect(new ExtratorClaude({ client }).extrair(PDF)).rejects.toThrow(mensagem);
  });

  it("erro que não é da API (bug) não é escondido", async () => {
    const { client } = clienteFalso(new TypeError("bug"));
    await expect(new ExtratorClaude({ client }).extrair(PDF)).rejects.toBeInstanceOf(TypeError);
  });
});
