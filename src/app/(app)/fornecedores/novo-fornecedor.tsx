"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { cnpjValido, normalizarCnpj } from "@/domain/documentos";
import { cadastrarFornecedor, type EstadoCadastro } from "./actions";

const INICIAL: EstadoCadastro = { ok: false, mensagem: null };

/** Cadastro de fornecedor. O CNPJ é conferido enquanto se digita (numérico ou alfanumérico); o servidor confere de novo. */
export function NovoFornecedor() {
  const [estado, enviar, enviando] = useActionState(cadastrarFornecedor, INICIAL);
  const [cnpj, setCnpj] = useState("");
  const completo = normalizarCnpj(cnpj).length === 14;
  const invalido = completo && !cnpjValido(cnpj);

  return (
    <form
      action={enviar}
      className="flex flex-wrap items-end gap-3 px-5 py-4"
    >
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        <label htmlFor="nome" className="text-xs font-medium text-muted">
          Razão social
        </label>
        <input
          id="nome"
          name="nome"
          required
          minLength={2}
          maxLength={120}
          defaultValue={estado.campos?.nome}
          autoComplete="off"
          className="block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
        />
      </div>
      <div className="min-w-0 flex-1 basis-48 space-y-1">
        <label htmlFor="cnpj" className="text-xs font-medium text-muted">
          CNPJ
        </label>
        <input
          id="cnpj"
          name="cnpj"
          required
          maxLength={18}
          defaultValue={estado.campos?.cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          placeholder="00.000.000/0000-00"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalido || undefined}
          aria-describedby="cnpj-ajuda"
          className="tabular block h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm uppercase aria-invalid:border-neg"
        />
      </div>
      <Button type="submit" disabled={enviando || invalido}>
        {enviando ? "Salvando…" : "Cadastrar"}
      </Button>
      <p id="cnpj-ajuda" role="status" className={`basis-full text-sm ${invalido || (estado.mensagem && !estado.ok) ? "text-neg" : estado.ok ? "text-pos" : "text-muted"}`}>
        {invalido
          ? "CNPJ com dígito verificador errado."
          : (estado.mensagem ?? "Aceita CNPJ numérico e o novo formato alfanumérico (letras nas 12 primeiras posições).")}
      </p>
    </form>
  );
}
