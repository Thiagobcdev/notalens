import { cnpjValido, formatarCnpj, normalizarCnpj } from "@/domain/documentos";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";

export class ErroDeFornecedor extends Error {}

type Quem = { id: string };

/**
 * Cadastra um fornecedor. O cadastro é o que a regra V6 consulta: documentos de um CNPJ fora
 * dele vão para a revisão. Vale para os próximos envios e para as revisões em andamento
 * (as regras rodam de novo ao corrigir ou aprovar).
 */
export async function criarFornecedor(db: Db, dados: { cnpj: string; nome: string }, quem: Quem) {
  const nome = dados.nome.trim().replace(/\s+/g, " ");
  const cnpj = normalizarCnpj(dados.cnpj);
  if (nome.length < 2 || nome.length > 120) throw new ErroDeFornecedor("Informe o nome (de 2 a 120 caracteres).");
  if (!cnpjValido(cnpj)) throw new ErroDeFornecedor("CNPJ inválido: confira os dígitos verificadores.");
  if (await db.cnpj.findUnique({ where: { cnpj } })) throw new ErroDeFornecedor("Este CNPJ é de uma empresa do grupo, não de um fornecedor.");

  try {
    return await db.$transaction(async (tx) => {
      const f = await tx.fornecedor.create({ data: { cnpj, nome } });
      await tx.auditoria.create({ data: { usuarioId: quem.id, acao: "FORNECEDOR_CRIADO", entidade: "Fornecedor", entidadeId: f.id, dados: { cnpj, nome } } });
      return f;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ErroDeFornecedor(`O CNPJ ${formatarCnpj(cnpj)} já está cadastrado.`);
    }
    throw e;
  }
}

/** Ativa ou desativa. Fornecedor inativo faz a V6 bloquear os documentos dele. */
export async function definirAtivo(db: Db, id: string, ativo: boolean, quem: Quem) {
  return db.$transaction(async (tx) => {
    const f = await tx.fornecedor.findUnique({ where: { id } });
    if (!f) throw new ErroDeFornecedor("Fornecedor não encontrado.");
    if (f.ativo === ativo) return f;
    const atualizado = await tx.fornecedor.update({ where: { id }, data: { ativo } });
    await tx.auditoria.create({
      data: { usuarioId: quem.id, acao: ativo ? "FORNECEDOR_ATIVADO" : "FORNECEDOR_DESATIVADO", entidade: "Fornecedor", entidadeId: id, dados: { cnpj: f.cnpj } },
    });
    return atualizado;
  });
}
