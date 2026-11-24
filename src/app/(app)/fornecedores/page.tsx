import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";
import { formatarCnpj } from "@/domain/documentos";
import { dataBR, isoDeData } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { prisma } from "@/server/db";
import { alternarFornecedor } from "./actions";
import { NovoFornecedor } from "./novo-fornecedor";

export const metadata: Metadata = { title: "Fornecedores" };

export default function FornecedoresPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fornecedores</h1>
        <p className="text-sm text-muted">
          O cadastro que a regra V6 consulta: documento de CNPJ fora da lista ou de fornecedor inativo vai para a revisão. Mudanças valem para os próximos
          envios e para as revisões em andamento.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await exigirPapel("GESTOR");
  const [fornecedores, ultimos] = await Promise.all([
    prisma.fornecedor.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, cnpj: true, ativo: true, _count: { select: { documentos: true } } },
    }),
    prisma.documento.groupBy({ by: ["fornecedorId"], where: { fornecedorId: { not: null } }, _max: { recebidoEm: true } }),
  ]);
  const ultimo = new Map(ultimos.map((u) => [u.fornecedorId, u._max.recebidoEm]));
  const ativos = fornecedores.filter((f) => f.ativo).length;

  return (
    <>
      <Card>
        <CardHeader title="Novo fornecedor" />
        <NovoFornecedor />
      </Card>

      <Card>
        <CardHeader title="Cadastrados" description={`${ativos} ativos de ${fornecedores.length}.`} />
        <ul className="divide-y divide-line">
          {fornecedores.map((f) => {
            const ult = ultimo.get(f.id);
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {f.nome}
                    {!f.ativo && <Badge tom="neg">Inativo</Badge>}
                  </p>
                  <p className="text-muted">
                    <span className="tabular font-mono text-xs">{formatarCnpj(f.cnpj)}</span>
                    {" · "}
                    {f._count.documentos > 0 ? (
                      <Link href={`/documentos?aba=todos&fornecedor=${f.id}`} className="underline-offset-4 hover:text-fg hover:underline">
                        {f._count.documentos} documento(s)
                      </Link>
                    ) : (
                      "nenhum documento"
                    )}
                    {ult && ` · último em ${dataBR(isoDeData(ult))}`}
                  </p>
                </div>
                <form action={alternarFornecedor}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="ativo" value={String(!f.ativo)} />
                  <button
                    type="submit"
                    className="h-9 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"
                    aria-label={`${f.ativo ? "Desativar" : "Ativar"} ${f.nome}`}
                  >
                    {f.ativo ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
