import { prisma } from "@/server/db";
import { ExtratorClaude } from "./claude";
import { ExtratorGravado, type Extrator } from "./extrator";

/**
 * Leitura real com o Claude quando há ANTHROPIC_API_KEY no ambiente; sem chave, as respostas
 * gravadas pelo seed (demo sem custo). NOTALENS_EXTRATOR=gravado força a demo mesmo com chave.
 */
export const extracaoReal = () => process.env.NOTALENS_EXTRATOR !== "gravado" && Boolean(process.env.ANTHROPIC_API_KEY);

export function extratorPadrao(): Extrator {
  return extracaoReal() ? new ExtratorClaude() : new ExtratorGravado(prisma);
}
