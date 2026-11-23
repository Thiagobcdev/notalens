import { extracaoBrutaSchema, type ExtracaoBruta } from "@/domain/documentos";
import type { Db } from "@/server/db";

export type ResultadoExtracao = {
  bruto: ExtracaoBruta;
  origem: "CLAUDE" | "GRAVADA";
  modelo: string | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  duracaoMs: number;
};

/** Lê um PDF e devolve os campos como texto. Não valida regra nenhuma: isso é papel do domínio. */
export interface Extrator {
  extrair(pdf: Uint8Array, hash: string): Promise<ResultadoExtracao>;
}

export class ErroDeExtracao extends Error {}

/**
 * Demo sem chave de API: devolve a resposta que o seed gravou para aquele PDF (pelo hash).
 * Um PDF que o seed não gerou não tem gravação, e o documento fica como FALHA_EXTRACAO.
 */
export class ExtratorGravado implements Extrator {
  constructor(private readonly db: Pick<Db, "extracaoGravada">) {}

  async extrair(_pdf: Uint8Array, hash: string): Promise<ResultadoExtracao> {
    const inicio = performance.now();
    const gravada = await this.db.extracaoGravada.findUnique({ where: { hashArquivo: hash } });
    if (!gravada) {
      throw new ErroDeExtracao(
        "Sem extração gravada para este arquivo. Use os PDFs da pasta amostras ou configure ANTHROPIC_API_KEY para a extração real.",
      );
    }
    const bruto = extracaoBrutaSchema.safeParse(gravada.bruto);
    if (!bruto.success) throw new ErroDeExtracao("Extração gravada fora do formato esperado.");
    return {
      bruto: bruto.data,
      origem: "GRAVADA",
      modelo: null,
      tokensEntrada: null,
      tokensSaida: null,
      duracaoMs: Math.round(performance.now() - inicio),
    };
  }
}
