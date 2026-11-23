import type { Metadata } from "next";
import { Envio } from "./envio";

export const metadata: Metadata = { title: "Enviar PDFs" };

export default function EnviarPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Enviar PDFs</h1>
        <p className="text-sm text-muted">
          A IA lê os campos de cada documento; as regras conferem o que ela leu. O que passar em tudo é aprovado sozinho, o resto vai para a fila de
          revisão.
        </p>
      </div>
      <Envio />
      <p className="text-xs text-muted">
        Com <code className="font-mono">ANTHROPIC_API_KEY</code> no <code className="font-mono">.env</code>, cada PDF é lido pelo Claude. Sem a chave, a
        leitura usa as respostas gravadas pelo seed: use os PDFs da pasta <code className="font-mono">amostras/</code> (gerada por{" "}
        <code className="font-mono">npm run db:seed</code>) na ordem dos números.
      </p>
    </div>
  );
}
