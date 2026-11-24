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
- Telas:
  - `/documentos` (fila e abas por situação) e `/enviar` (upload em lote);
  - `/revisao/[id]`: PDF ao lado dos campos, com as regras rodando no navegador a cada edição;
  - `/painel`, só para a gestora:
    - aprovação automática por semana;
    - por que os documentos vão para a revisão (regras na chegada);
    - acerto da IA por campo;
    - tempo e custo estimado por leitura real;
    - fila da alçada;
  - `/fornecedores`, só para a gestora: o cadastro que a regra V6 consulta, com CNPJ alfanumérico.
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

Sem `ANTHROPIC_API_KEY`, a extração usa as respostas gravadas pelo seed: a demo inteira roda sem custo. Com a chave no `.env`, cada PDF enviado é lido pelo Claude (`claude-sonnet-5-5` por padrão, configurável em `ANTHROPIC_MODEL`).

### Como a IA é usada
- O PDF vai inteiro para a API como documento (base64) e a resposta volta num **JSON com schema fixo** (structured outputs), validado por Zod.
- O modelo só **copia o texto impresso**; um campo ilegível vem como `null`. Converter "1.234,56" em centavos, conferir dígitos verificadores e somar itens é código determinístico, testado.
- O texto do documento é tratado como dado. Um PDF com instruções escondidas, no máximo, produz campos errados, e as regras mandam para a revisão.
- Recusa do modelo, resposta cortada, erro de API ou arquivo que não é NF-e nem boleto viram "falha de leitura", com o motivo, e nunca uma aprovação.
- Cada extração registra modelo, tokens e tempo.

Os PDFs são **fictícios** e marcados como "sem valor fiscal"; os CNPJs são válidos no formato, mas inventados.
