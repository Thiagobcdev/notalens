import { prisma } from "@/server/db";
import { ExtratorGravado, type Extrator } from "./extrator";

/** Extrator usado pela aplicação. Sem chave de API, usa as respostas gravadas pelo seed. */
export function extratorPadrao(): Extrator {
  return new ExtratorGravado(prisma);
}
