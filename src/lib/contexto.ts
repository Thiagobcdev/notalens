import type { Contexto } from "@/domain/documentos";

/** Contexto das regras em formato serializável (Set não atravessa a fronteira servidor → cliente). */
export type ContextoSerializado = Omit<Contexto, "jaRecebidos"> & {
  jaRecebidos: { chaves: string[]; linhas: string[]; hashes: string[] };
};

export const desserializarContexto = (c: ContextoSerializado): Contexto => ({
  ...c,
  jaRecebidos: { chaves: new Set(c.jaRecebidos.chaves), linhas: new Set(c.jaRecebidos.linhas), hashes: new Set(c.jaRecebidos.hashes) },
});
