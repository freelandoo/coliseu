-- AlterEnum
ALTER TYPE "PessoaFase" ADD VALUE 'exaluno';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "cadastroLegado" DATE,
ADD COLUMN     "genero" TEXT,
ADD COLUMN     "inativadoEm" DATE,
ADD COLUMN     "legacyCloudgymId" INTEGER,
ADD COLUMN     "legacyLeadId" INTEGER,
ADD COLUMN     "legacyName" TEXT,
ADD COLUMN     "origemLegado" TEXT,
ADD COLUMN     "telefoneFixo" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "contaContabilId" TEXT,
ADD COLUMN     "legacyCloudgymId" INTEGER,
ADD COLUMN     "meses" INTEGER,
ADD COLUMN     "parcelasAdesao" INTEGER,
ADD COLUMN     "taxaAdesao" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "legacyCloudgymId" INTEGER,
ADD COLUMN     "razaoSocial" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "uf" TEXT;

-- CreateTable
CREATE TABLE "ContaContabil" (
    "id" TEXT NOT NULL,
    "legacyCloudgymId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "debito" BOOLEAN NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "tipo" TEXT,
    "paiId" TEXT,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "ContaContabil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "legacyCloudgymId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "legacyCloudgymId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "sobrenome" TEXT,
    "email" TEXT,
    "cargo" TEXT,
    "cadastradoEm" DATE,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPlano" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nomePlano" TEXT NOT NULL,
    "planId" TEXT,

    CONSTRAINT "HistoricoPlano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcela" (
    "id" TEXT NOT NULL,
    "legacyPaymentId" INTEGER NOT NULL,
    "legacyMemberId" INTEGER NOT NULL,
    "personId" TEXT,
    "unitId" TEXT NOT NULL,
    "vencimento" DATE NOT NULL,
    "pagamento" DATE,
    "compensacao" DATE,
    "valorBruto" DECIMAL(12,2) NOT NULL,
    "valorLiquido" DECIMAL(12,2),
    "forma" TEXT NOT NULL,
    "cartaoFinal" TEXT,
    "bandeira" TEXT,
    "nsu" TEXT,
    "gateway" TEXT,
    "status" TEXT,
    "tipo" TEXT NOT NULL,
    "contaContabilId" TEXT,
    "realizadoCaixa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxaPagamento" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "legacyMemberId" INTEGER NOT NULL,
    "personId" TEXT,
    "unitId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "contaContabilId" TEXT,

    CONSTRAINT "TaxaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaPlanoDia" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "nomePlano" TEXT NOT NULL,
    "planId" TEXT,
    "qtdContratos" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "vendedorId" INTEGER,
    "vendedorNome" TEXT,

    CONSTRAINT "VendaPlanoDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoCaixa" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "forma" TEXT,
    "legacyMemberId" INTEGER,
    "personId" TEXT,
    "descricao" TEXT NOT NULL,
    "vendedorNome" TEXT,
    "vendido" BOOLEAN NOT NULL DEFAULT false,
    "recebido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LancamentoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "personId" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'cloudgym',
    "vinculo" TEXT,
    "nomeBruto" TEXT,
    "emailBruto" TEXT,
    "celularBruto" TEXT,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsResposta" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "personId" TEXT,
    "respondidaEm" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,

    CONSTRAINT "NpsResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AulaGrade" (
    "id" TEXT NOT NULL,
    "legacyCloudgymId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "professorId" TEXT,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "AulaGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaLegado" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL,
    "operacaoCod" TEXT NOT NULL,
    "descricao" TEXT,
    "usuario" TEXT,
    "legacyMemberId" INTEGER,
    "personId" TEXT,

    CONSTRAINT "AuditoriaLegado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEm" TIMESTAMP(3),
    "modo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "contagens" JSONB,
    "ok" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "linha" INTEGER,
    "chave" TEXT,
    "motivo" TEXT NOT NULL,
    "detalhe" TEXT,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadLegado" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "cadastradoEm" TIMESTAMP(3),
    "celular" TEXT,
    "email" TEXT,
    "status" TEXT,
    "origem" TEXT,
    "vendedor" TEXT,
    "personId" TEXT,

    CONSTRAINT "LeadLegado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaContabil_legacyCloudgymId_key" ON "ContaContabil"("legacyCloudgymId");

-- CreateIndex
CREATE INDEX "ContaContabil_paiId_idx" ON "ContaContabil"("paiId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_legacyCloudgymId_key" ON "ContaBancaria"("legacyCloudgymId");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_legacyCloudgymId_key" ON "Colaborador"("legacyCloudgymId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricoPlano_personId_ordem_key" ON "HistoricoPlano"("personId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Parcela_legacyPaymentId_key" ON "Parcela"("legacyPaymentId");

-- CreateIndex
CREATE INDEX "Parcela_personId_vencimento_idx" ON "Parcela"("personId", "vencimento");

-- CreateIndex
CREATE INDEX "Parcela_unitId_pagamento_idx" ON "Parcela"("unitId", "pagamento");

-- CreateIndex
CREATE INDEX "Parcela_unitId_vencimento_idx" ON "Parcela"("unitId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "TaxaPagamento_chave_key" ON "TaxaPagamento"("chave");

-- CreateIndex
CREATE INDEX "TaxaPagamento_unitId_data_idx" ON "TaxaPagamento"("unitId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "VendaPlanoDia_chave_key" ON "VendaPlanoDia"("chave");

-- CreateIndex
CREATE INDEX "VendaPlanoDia_unitId_data_idx" ON "VendaPlanoDia"("unitId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "LancamentoCaixa_chave_key" ON "LancamentoCaixa"("chave");

-- CreateIndex
CREATE INDEX "LancamentoCaixa_unitId_data_idx" ON "LancamentoCaixa"("unitId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_chave_key" ON "CheckIn"("chave");

-- CreateIndex
CREATE INDEX "CheckIn_personId_ocorridoEm_idx" ON "CheckIn"("personId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "CheckIn_unitId_ocorridoEm_idx" ON "CheckIn"("unitId", "ocorridoEm");

-- CreateIndex
CREATE UNIQUE INDEX "NpsResposta_chave_key" ON "NpsResposta"("chave");

-- CreateIndex
CREATE INDEX "NpsResposta_unitId_respondidaEm_idx" ON "NpsResposta"("unitId", "respondidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "AulaGrade_legacyCloudgymId_key" ON "AulaGrade"("legacyCloudgymId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditoriaLegado_chave_key" ON "AuditoriaLegado"("chave");

-- CreateIndex
CREATE INDEX "AuditoriaLegado_unitId_ocorridoEm_idx" ON "AuditoriaLegado"("unitId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "ImportIssue_runId_motivo_idx" ON "ImportIssue"("runId", "motivo");

-- CreateIndex
CREATE UNIQUE INDEX "LeadLegado_chave_key" ON "LeadLegado"("chave");

-- CreateIndex
CREATE INDEX "LeadLegado_unitId_cadastradoEm_idx" ON "LeadLegado"("unitId", "cadastradoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Person_legacyCloudgymId_key" ON "Person"("legacyCloudgymId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_legacyLeadId_key" ON "Person"("legacyLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_legacyCloudgymId_key" ON "Plan"("legacyCloudgymId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_legacyCloudgymId_key" ON "Unit"("legacyCloudgymId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaContabil" ADD CONSTRAINT "ContaContabil_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "ContaContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaContabil" ADD CONSTRAINT "ContaContabil_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPlano" ADD CONSTRAINT "HistoricoPlano_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPlano" ADD CONSTRAINT "HistoricoPlano_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxaPagamento" ADD CONSTRAINT "TaxaPagamento_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaContabil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsResposta" ADD CONSTRAINT "NpsResposta_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaGrade" ADD CONSTRAINT "AulaGrade_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AulaGrade" ADD CONSTRAINT "AulaGrade_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

