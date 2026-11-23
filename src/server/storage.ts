import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** PDFs ficam no disco, nomeados pelo SHA-256. Fora do git (`/storage/`) e servidos só por rota autenticada. */
const DIR = path.join(process.cwd(), "storage", "documentos");

export const LIMITE_BYTES = 5 * 1024 * 1024;

export class ErroDeArquivo extends Error {}

export const hashDe = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Só PDF de verdade (assinatura "%PDF-"), não vazio e até 5 MB. A extensão e o MIME do navegador não contam. */
export function validarPdf(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new ErroDeArquivo("Arquivo vazio.");
  if (bytes.byteLength > LIMITE_BYTES) throw new ErroDeArquivo("Arquivo maior que 5 MB.");
  const assinatura = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (assinatura !== "%PDF-") throw new ErroDeArquivo("O arquivo não é um PDF.");
}

const caminho = (hash: string) => {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ErroDeArquivo("Hash inválido.");
  return path.join(DIR, `${hash}.pdf`);
};

export async function salvarPdf(bytes: Uint8Array): Promise<string> {
  validarPdf(bytes);
  const hash = hashDe(bytes);
  const destino = caminho(hash);
  await mkdir(DIR, { recursive: true });
  try {
    await access(destino); // mesmo conteúdo já salvo
  } catch {
    await writeFile(destino, bytes);
  }
  return hash;
}

export const lerPdf = (hash: string) => readFile(caminho(hash));
