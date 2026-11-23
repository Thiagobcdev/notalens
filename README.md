# NotaLens

Extração de notas fiscais (DANFE da NF-e) e boletos com IA, **conferida por regras de negócio**: o que não fecha vai para revisão humana, e cada correção vira métrica de acerto da IA por campo.

> Em construção. O design está em [docs/design.md](docs/design.md).

## Estado atual
- Motor de regras V1–V10 em `src/domain/documentos/` (código puro, sem banco nem framework), com testes:
  - CNPJ numérico e **alfanumérico** (vigente desde jul/2026);
  - chave de acesso da NF-e (DV módulo 11 e conferência com número, série, emitente e emissão);
  - linha digitável do boleto (DVs módulo 10/11, valor e fator de vencimento, inclusive a virada de fev/2025);
  - totais da nota com tolerância por item, duplicidade, casamento boleto ↔ nota, vencimento e alçada.

- Banco (PostgreSQL + Prisma) e **pipeline** em `src/server/`: PDF → extração → normalização → regras numa transação serializável → documento. Revisão: corrigir (com registro do que a IA leu × valor final), aprovar (alçada e justificativa do gestor) e rejeitar.
- **Seed** do Grupo Vértice (fictício): ~195 PDFs de DANFE e boleto gerados com `pdf-lib`, com defeitos de propósito (soma que não fecha, nota duplicada, boleto vencido, boleto falso, fornecedor descredenciado) e leituras erradas da "IA". Todos passam pelo mesmo pipeline da aplicação; as revisões antigas são resolvidas e as da última semana ficam na fila.

## Rodar localmente

Pré-requisitos: Node 22+ e Docker.

```bash
cp .env.example .env        # gere um SESSION_SECRET novo (instrução no arquivo)
npm install
npm run db:up               # PostgreSQL 16 na porta 5435
npm run db:migrate
npm run db:seed             # gera os PDFs em storage/ e amostras/ para testar o upload
npm test
```

Sem `ANTHROPIC_API_KEY`, a extração usa as respostas gravadas pelo seed: a demo inteira roda sem custo.

Os PDFs são **fictícios** e marcados como "sem valor fiscal"; os CNPJs são válidos no formato, mas inventados.
