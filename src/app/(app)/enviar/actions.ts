"use server";

import { hojeISO } from "@/lib/formato";
import { exigirPapel } from "@/server/auth";
import { prisma } from "@/server/db";
import { extratorPadrao } from "@/server/extracao";
import { processarDocumento } from "@/server/pipeline";
import { ErroDeArquivo, LIMITE_BYTES } from "@/server/storage";

export type ResultadoEnvio =
  | {
      ok: true;
      documentoId: string;
      status: "APROVADO_AUTO" | "EM_REVISAO" | "FALHA_EXTRACAO";
      urgente: boolean;
      exigeGestor: boolean;
      violacoes: { regra: string; mensagem: string; severidade: "BLOQUEIA" | "ALERTA" }[];
      erro?: string;
    }
  | { ok: false; erro: string };

/**
 * Recebe UM arquivo por chamada: a tela envia em sequência e mostra o progresso por arquivo.
 * Uma Server Action é um endpoint público, então sessão, papel e arquivo são conferidos aqui.
 */
export async function enviarArquivo(form: FormData): Promise<ResultadoEnvio> {
  const usuario = await exigirPapel("ANALISTA", "GESTOR");
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return { ok: false, erro: "Nenhum arquivo recebido." };
  if (arquivo.size > LIMITE_BYTES) return { ok: false, erro: "Arquivo maior que 5 MB." };

  try {
    const r = await processarDocumento(prisma, extratorPadrao(), {
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
      nomeArquivo: arquivo.name.slice(0, 200) || "documento.pdf",
      usuarioId: usuario.id,
      recebidoEm: hojeISO(),
    });
    return {
      ok: true,
      documentoId: r.documentoId,
      status: r.status as "APROVADO_AUTO" | "EM_REVISAO" | "FALHA_EXTRACAO",
      urgente: r.decisao?.urgente ?? false,
      exigeGestor: r.decisao?.exigeGestor ?? false,
      violacoes: (r.decisao?.violacoes ?? []).map(({ regra, mensagem, severidade }) => ({ regra, mensagem, severidade })),
      erro: r.erro,
    };
  } catch (e) {
    if (e instanceof ErroDeArquivo) return { ok: false, erro: e.message };
    console.error("Falha ao processar upload", e);
    return { ok: false, erro: "Erro inesperado ao processar o arquivo. Tente de novo." };
  }
}
