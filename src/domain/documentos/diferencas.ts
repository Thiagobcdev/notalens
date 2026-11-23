import type { Documento } from "./tipos";

/** Achata o documento em caminhos ("itens.1.quantidade") → valor, para comparar campo a campo. */
export function achatar(doc: Documento): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visitar = (valor: unknown, prefixo: string) => {
    if (Array.isArray(valor)) {
      out[`${prefixo}.length`] = valor.length;
      valor.forEach((v, i) => visitar(v, `${prefixo}.${i}`));
    } else if (valor !== null && typeof valor === "object") {
      for (const [k, v] of Object.entries(valor)) visitar(v, prefixo ? `${prefixo}.${k}` : k);
    } else {
      out[prefixo] = valor;
    }
  };
  visitar(doc, "");
  return out;
}

export type Diferenca = { campo: string; antes: unknown; depois: unknown };

/** Campos que mudaram de `a` para `b` (o que a IA leu × o que a pessoa deixou). */
export function diferencas(a: Documento, b: Documento): Diferenca[] {
  const x = achatar(a);
  const y = achatar(b);
  const campos = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((c) => c !== "tipo" && !c.endsWith(".length"));
  return campos
    .filter((c) => JSON.stringify(x[c] ?? null) !== JSON.stringify(y[c] ?? null))
    .map((c) => ({ campo: c, antes: x[c] ?? null, depois: y[c] ?? null }));
}

/** Nome do campo sem o índice, para agrupar o acerto da IA ("itens.3.quantidade" → "itens.quantidade"). */
export const campoGenerico = (campo: string) => campo.replace(/\.\d+(?=\.|$)/g, "");
