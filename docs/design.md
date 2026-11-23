# NotaLens — design do MVP

## 1. O que é e por quê
Em muita empresa, alguém abre o PDF de cada nota fiscal e boleto e digita os dados no ERP. O NotaLens usa IA para extrair os campos, mas **não confia cegamente nela**: regras determinísticas conferem o que foi extraído, e o que falha vai para uma pessoa revisar. As correções viram uma métrica de acerto da IA por campo.


## 2. Cenário: Grupo Vértice (fictício)
Rede de lojas de materiais de construção. O contas a pagar recebe por mês ~300 PDFs de fornecedores: DANFE (o PDF da NF-e) e boletos. Hoje alguém digita esses PDFs no ERP.
- **Seed:** 1 empresa (2 CNPJs, matriz e filial), 15 fornecedores, ~120 documentos de exemplo.
- Os PDFs de exemplo são **gerados pelo seed**, com dados fictícios e CNPJs válidos mas inventados.
- Uma parte dos documentos tem defeitos de propósito, para exercitar cada regra:
  - soma que não fecha;
  - CNPJ com dígito errado;
  - nota duplicada;
  - boleto vencido;
  - boleto cujo valor não bate com a nota.

## 3. Fluxo do documento
`RECEBIDO → EXTRAIDO → APROVADO_AUTO | EM_REVISAO → APROVADO | REJEITADO`
- **Upload:**
  - só PDF, conferido pela assinatura `%PDF`;
  - até 5 MB;
  - guarda o hash SHA-256 para detectar o mesmo arquivo enviado duas vezes.
- **Extração:**
  - a IA devolve JSON num schema fixo, validado por Zod;
  - um campo ilegível vem como `null`; o modelo nunca deve inventar.
- **Validação:**
  - o motor puro roda as regras abaixo;
  - se nenhuma falhar e o valor estiver abaixo da alçada, o documento é aprovado sozinho;
  - nos outros casos, vai para a fila.
- **Revisão:**
  - o PDF aparece ao lado dos campos, com as regras que falharam destacadas;
  - ao corrigir, as regras rodam de novo no navegador (mesmo motor);
  - cada correção grava o valor da IA e o valor final.

## 4. Regras de validação (o coração do projeto)
| # | Regra |
|---|---|
| V1 | Os CNPJs do emitente e do destinatário têm dígitos verificadores válidos, e o destinatário é um CNPJ do grupo. |
| V2 | A chave de acesso da NF-e tem 44 dígitos e DV módulo 11 válido. Ela também confere com o CNPJ do emitente, o número, a série e o mês/ano de emissão extraídos. |
| V3 | Cada item vale quantidade × unitário (tolerância de 1 centavo por item). A soma dos itens é o total dos produtos, e o total da nota é produtos + frete + IPI − desconto. |
| V4 | Duplicidade: uma chave de NF-e, uma linha digitável ou um hash de arquivo já recebido bloqueia o documento. |
| V5 | A linha digitável do boleto tem 47 dígitos com DVs válidos (módulos 10 e 11). O valor e o vencimento codificados nela (fator de vencimento) batem com os campos extraídos. |
| V6 | Fornecedor: o emitente ou beneficiário está cadastrado e ativo. Um boleto é casado com uma nota do mesmo fornecedor pelo valor total ou por uma parcela da nota. |
| V7 | O vencimento não está no passado na data de recebimento. Faltando menos de 3 dias úteis, o documento ganha o alerta "urgente", mas não é bloqueado. |
| V8 | Campos obrigatórios por tipo de documento: se a IA devolver `null` em algum, o documento vai para a revisão. |
| V9 | Alçada: acima de R$ 10.000,00 o documento sempre passa por aprovação humana, mesmo que tudo valide. |
| V10 | Dinheiro em centavos inteiros e datas como string ISO, sem float (igual ao Comissão Certa). |

Cada regra devolve `{codigo, campo, mensagem, severidade: BLOQUEIA | ALERTA}`. A interface usa o `campo` para destacar onde está o problema.

## 5. IA: decisões
- **Modelo e chamada:**
  - API do Claude (`@anthropic-ai/sdk`) com o PDF enviado como bloco `document`, em base64;
  - saída estruturada via tool/JSON schema.
  - Modelo padrão: `claude-sonnet-5-5`, configurável por env.
- **Interface `Extrator`, com duas implementações:**
  - `ExtratorClaude`: real, ligado quando existe `ANTHROPIC_API_KEY`;
  - `ExtratorGravado`: lê as extrações que o seed salvou por hash do arquivo.
  - Quem clonar o repo roda a demo inteira **sem chave e sem custo**.
- **Prompt injection:**
  - o texto do PDF é tratado como dado;
  - a saída passa por schema rígido e pelas regras, então um PDF malicioso, no máximo, cai na revisão.
  - Isso vai documentado no README.
- **Custo e tempo:** tokens e latência ficam registrados por extração e aparecem no painel.

## 6. Stack
Igual à do Comissão Certa, para reaproveitar padrões:
- Next.js 16 (App Router, Server Actions, Cache Components) · TypeScript;
- PostgreSQL 16 no Docker, **porta 5435** (não usar 5432–5434) · Prisma 7 · Zod · Vitest · Tailwind 4 · Recharts;
- login com jose + bcryptjs;
- `@anthropic-ai/sdk`, e `pdf-lib` para gerar os PDFs do seed.

Os PDFs ficam em `storage/` (no .gitignore) e são servidos por uma rota autenticada.

## 7. Modelo de dados (resumo)
- **Empresa, Cnpj, Fornecedor, Usuario:** os papéis são ANALISTA e GESTOR.
- **Documento:**
  - tipo NFE | BOLETO, status, hash, caminho, recebidoEm;
  - fornecedorId, chave ou linhaDigitavel (únicas), valorCentavos, vencimento.
- **Extracao:** documentoId, modelo, json bruto, tokens, ms e origem (CLAUDE | GRAVADA).
- **ResultadoRegra:** documentoId, codigo, campo, severidade e mensagem.
- **Correcao:** documentoId, campo, valorIa, valorFinal, usuarioId e em.
- **Auditoria:** igual ao Comissão Certa.

## 8. Telas
- **/documentos:**
  - lista com filtro por status, tipo e fornecedor;
  - mostra badge de "urgente" e os contadores da fila.
- **/enviar:** upload de vários PDFs, com o progresso por arquivo e o resultado (aprovado sozinho ou foi para a revisão).
- **/revisao/[id]:**
  - o PDF fica à esquerda, os campos editáveis à direita;
  - as regras que falharam aparecem no topo e no próprio campo;
  - ações: Aprovar, Rejeitar com motivo, Próximo da fila.
- **/painel (GESTOR):**
  - taxa de aprovação automática e acerto da IA por campo (com base nas correções);
  - motivos de falha mais comuns, tempo e custo médio por documento.
- **/fornecedores (GESTOR):** cadastro simples e ativação.
- **Aprovação acima da alçada (V9):** quem aprova é o GESTOR.

## 9. Estrutura
```
src/domain/documentos/   regras V1–V10, cnpj, chave NF-e, linha digitável, casamento boleto↔nota (puro + testes)
src/server/extracao/     Extrator (interface), ExtratorClaude, ExtratorGravado, schema Zod
src/server/              upload, pipeline, consultas, auth
src/app/                 rotas acima
prisma/                  schema, migrações, seed (gera PDFs + extrações gravadas)
docs/design.md
```

## 10. Ordem de construção (fatias)
1. **Projeto e domínio:**
   - scaffold do Next 16 + Prisma + Docker (5435), copiando a configuração do Comissão Certa (eslint, vitest, prisma.config, proxy de auth);
   - o motor de regras V1–V10 com testes em tabela.
2. **Seed:** gera os PDFs, as extrações gravadas (incluindo os defeitos de propósito) e os fornecedores.
3. **Upload e pipeline:** ExtratorGravado → regras → status, mais a tela /documentos.
4. **Revisão:** /revisao/[id] com o motor no navegador, as correções e a auditoria.
5. **ExtratorClaude:** chamada real com PDF, conferida com 2 ou 3 documentos do seed.
6. **Painel do gestor e alçada.**
7. **README como case** (como o do Comissão Certa), screenshots e a entrada no portfólio (`projects.items` passa a ter 2, e a galeria volta).


## Verificação
- `npm test` (regras com casos-limite: DVs, tolerância de centavos, fator de vencimento, dias úteis), `npm run typecheck`, `npm run lint` e `npm run build`.
- Playwright em servidor local (`node node_modules/next/dist/bin/next start -p <porta>`):
  1. subir um lote do seed;
  2. conferir que os documentos limpos são aprovados sozinhos e os com defeito vão para a fila com a regra certa destacada;
  3. corrigir um campo e ver a regra ficar verde;
  4. um ANALISTA que tenta abrir /painel é redirecionado;
  5. screenshots em 1440 px e 390 px, console limpo.
- Sem `ANTHROPIC_API_KEY`, a demo funciona inteira com as extrações gravadas.
