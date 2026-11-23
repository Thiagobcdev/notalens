"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { entrar, type EstadoLogin } from "./actions";

const CONTAS_DEMO = [
  { papel: "Analista", email: "paula.mendes@vertice.test" },
  { papel: "Gestora (alçada)", email: "carla.nogueira@vertice.test" },
];

export function LoginForm() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <>
      <form action={acao} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={estado.email}
            aria-invalid={Boolean(estado.erro)}
            aria-describedby={estado.erro ? "erro-login" : undefined}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="senha" className="text-sm font-medium">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(estado.erro)}
            aria-describedby={estado.erro ? "erro-login" : undefined}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          />
        </div>
        {estado.erro && (
          <p id="erro-login" role="alert" className="rounded-lg bg-neg-bg px-3 py-2 text-sm text-neg">
            {estado.erro}
          </p>
        )}
        <Button type="submit" disabled={pendente} className="w-full">
          {pendente ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-dashed border-line p-4 text-sm">
        <p className="font-medium">Contas de demonstração</p>
        <p className="text-muted">
          Senha de todas: <code className="font-mono">vertice123</code>
        </p>
        <ul className="mt-2 space-y-1">
          {CONTAS_DEMO.map((c) => (
            <li key={c.email} className="flex justify-between gap-3">
              <span className="text-muted">{c.papel}</span>
              <code className="font-mono text-xs">{c.email}</code>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
