-- AlterTable
ALTER TABLE "AulaExperimental" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "lembreteEnviadoEm" TIMESTAMP(3),
ADD COLUMN     "lembreteErro" TEXT,
ADD COLUMN     "presenca" TEXT;

-- CreateTable
CREATE TABLE "AulaExperimentalLegado" (
    "id" TEXT NOT NULL,
    "aba" TEXT NOT NULL,
    "linha" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "modalidade" TEXT,
    "dataVisita" TEXT,
    "dataAula" TEXT,
    "hora" INTEGER,
    "presenca" TEXT,
    "statusOriginal" TEXT,
    "canal" TEXT,
    "atendente" TEXT,
    "comoConheceu" TEXT,
    "andamento" TEXT,

    CONSTRAINT "AulaExperimentalLegado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AulaExperimentalLegado_telefone_idx" ON "AulaExperimentalLegado"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "AulaExperimentalLegado_aba_linha_key" ON "AulaExperimentalLegado"("aba", "linha");

-- CreateIndex
CREATE INDEX "AulaExperimental_cpf_idx" ON "AulaExperimental"("cpf");

