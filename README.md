# NotaLens

Extração de notas fiscais (DANFE da NF-e) e boletos com IA, **conferida por regras de negócio**: o que não fecha vai para revisão humana, e cada correção vira métrica de acerto da IA por campo.

> Em construção. O design está em [docs/design.md](docs/design.md).

## Estado atual
- Motor de regras V1–V10 em `src/domain/documentos/` (código puro, sem banco nem framework), com testes:
  - CNPJ numérico e **alfanumérico** (vigente desde jul/2026);
  - chave de acesso da NF-e (DV módulo 11 e conferência com número, série, emitente e emissão);
  - linha digitável do boleto (DVs módulo 10/11, valor e fator de vencimento, inclusive a virada de fev/2025);
  - totais da nota com tolerância por item, duplicidade, casamento boleto ↔ nota, vencimento e alçada.

```bash
npm install
npm test
```
