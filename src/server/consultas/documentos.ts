import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { StatusDocumento, TipoDocumento } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";

export const ABAS = {
  fila: { rotulo: "Fila de revisão", status: ["EM_REVISAO"] },
  aprovados: { rotulo: "Aprovados", status: ["APROVADO_AUTO", "APROVADO"] },
  rejeitados: { rotulo: "Rejeitados", status: ["REJEITADO"] },
  falhas: { rotulo: "Falhas de leitura", status: ["FALHA_EXTRACAO"] },
  todos: { rotulo: "Todos", status: null },
} as const satisfies Record<string, { rotulo: string; status: readonly StatusDocumento[] | null }>;

export type Aba = keyof typeof ABAS;
export const POR_PAGINA = 30;

export type Filtros = { aba: Aba; tipo: TipoDocumento | null; fornecedorId: string | null; pagina: number };

/** Lê e saneia os filtros da URL (qualquer valor estranho vira o padrão). */
export function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const um = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const aba = um("aba");
  const tipo = um("tipo");
  const pagina = Number(um("pagina"));
  return {
    aba: aba && aba in ABAS ? (aba as Aba) : "fila",
    tipo: tipo === "NFE" || tipo === "BOLETO" ? tipo : null,
    fornecedorId: um("fornecedor") || null,
    pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
  };
}

export async function listarDocumentos(f: Filtros) {
  const base: Prisma.DocumentoWhereInput = {
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
  };
  const statusDaAba = ABAS[f.aba].status;
  const where: Prisma.DocumentoWhereInput = { ...base, ...(statusDaAba ? { status: { in: [...statusDaAba] } } : {}) };
  // Na fila: urgentes primeiro, depois o mais antigo (FIFO). Nas outras abas: os mais recentes.
  const orderBy: Prisma.DocumentoOrderByWithRelationInput[] =
    f.aba === "fila" ? [{ urgente: "desc" }, { recebidoEm: "asc" }, { criadoEm: "asc" }] : [{ recebidoEm: "desc" }, { criadoEm: "desc" }];

  const [itens, total, porStatus, fornecedores] = await Promise.all([
    prisma.documento.findMany({
      where,
      orderBy,
      skip: (f.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        tipo: true,
        status: true,
        nomeArquivo: true,
        recebidoEm: true,
        numero: true,
        valorCentavos: true,
        vencimento: true,
        urgente: true,
        exigeGestor: true,
        motivo: true,
        fornecedor: { select: { nome: true } },
        violacoes: { select: { regra: true, mensagem: true, severidade: true }, orderBy: { severidade: "asc" } },
      },
    }),
    prisma.documento.count({ where }),
    prisma.documento.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const contar = (s: readonly StatusDocumento[] | null) =>
    porStatus.filter((p) => s === null || s.includes(p.status)).reduce((acc, p) => acc + p._count, 0);
  const contagens = Object.fromEntries(Object.entries(ABAS).map(([k, a]) => [k, contar(a.status)])) as Record<Aba, number>;

  return { itens, total, contagens, fornecedores, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

export type LinhaDocumento = Awaited<ReturnType<typeof listarDocumentos>>["itens"][number];
