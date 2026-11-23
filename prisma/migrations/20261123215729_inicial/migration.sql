-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ANALISTA', 'GESTOR');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('NFE', 'BOLETO');

-- CreateEnum
CREATE TYPE "StatusDocumento" AS ENUM ('APROVADO_AUTO', 'EM_REVISAO', 'APROVADO', 'REJEITADO', 'FALHA_EXTRACAO');

-- CreateEnum
CREATE TYPE "OrigemExtracao" AS ENUM ('CLAUDE', 'GRAVADA');

-- CreateEnum
CREATE TYPE "Severidade" AS ENUM ('BLOQUEIA', 'ALERTA');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cnpj" (
    "cnpj" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "Cnpj_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumento",
    "status" "StatusDocumento" NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "recebidoEm" DATE NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "chaveAcesso" TEXT,
    "linhaDigitavel" TEXT,
    "numero" TEXT,
    "valorCentavos" INTEGER,
    "vencimento" DATE,
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "exigeGestor" BOOLEAN NOT NULL DEFAULT false,
    "dados" JSONB,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extracao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "origem" "OrigemExtracao" NOT NULL,
    "modelo" TEXT,
    "bruto" JSONB NOT NULL,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "duracaoMs" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoRegra" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "severidade" "Severidade" NOT NULL,
    "mensagem" TEXT NOT NULL,

    CONSTRAINT "ResultadoRegra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correcao" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorIa" TEXT,
    "valorFinal" TEXT,
    "usuarioId" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtracaoGravada" (
    "hashArquivo" TEXT NOT NULL,
    "bruto" JSONB NOT NULL,

    CONSTRAINT "ExtracaoGravada_pkey" PRIMARY KEY ("hashArquivo")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "dados" JSONB,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cnpj_key" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Documento_status_recebidoEm_idx" ON "Documento"("status", "recebidoEm");

-- CreateIndex
CREATE INDEX "Documento_hashArquivo_idx" ON "Documento"("hashArquivo");

-- CreateIndex
CREATE INDEX "Documento_chaveAcesso_idx" ON "Documento"("chaveAcesso");

-- CreateIndex
CREATE INDEX "Documento_linhaDigitavel_idx" ON "Documento"("linhaDigitavel");

-- CreateIndex
CREATE INDEX "Documento_fornecedorId_idx" ON "Documento"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "Extracao_documentoId_key" ON "Extracao"("documentoId");

-- CreateIndex
CREATE INDEX "ResultadoRegra_documentoId_idx" ON "ResultadoRegra"("documentoId");

-- CreateIndex
CREATE INDEX "Correcao_campo_idx" ON "Correcao"("campo");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "Cnpj" ADD CONSTRAINT "Cnpj_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extracao" ADD CONSTRAINT "Extracao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoRegra" ADD CONSTRAINT "ResultadoRegra_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correcao" ADD CONSTRAINT "Correcao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correcao" ADD CONSTRAINT "Correcao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
