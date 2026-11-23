import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

export function criarPrisma(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL não definida (veja .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Uma instância por processo; em dev o HMR do Next recriaria o client a cada edição.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalParaPrisma.prisma ?? criarPrisma();
if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = prisma;
