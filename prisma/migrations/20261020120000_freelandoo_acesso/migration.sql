-- CreateEnum
CREATE TYPE "FreelandooEstado" AS ENUM ('sem_conta', 'falta_dado', 'menor', 'aguardando_aceite', 'ativa', 'conflito_email', 'falhou');

-- CreateEnum
CREATE TYPE "TarefaFreelandooTipo" AS ENUM ('CRIAR_ACESSO', 'ENVIAR_FOTO', 'ENVIAR_BOAS_VINDAS', 'REENVIAR_LINK');

-- CreateEnum
CREATE TYPE "TarefaFreelandooStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'OK', 'FALHOU');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "freelandooAcessoEnviadoEm" TIMESTAMP(3),
ADD COLUMN     "freelandooEstado" "FreelandooEstado" NOT NULL DEFAULT 'sem_conta',
ADD COLUMN     "freelandooFotoUrl" TEXT,
ADD COLUMN     "freelandooMotivo" TEXT,
ADD COLUMN     "freelandooSincronizadoEm" TIMESTAMP(3),
ADD COLUMN     "freelandooTreinoNome" TEXT,
ADD COLUMN     "freelandooTreinoValidadeDias" INTEGER,
ADD COLUMN     "freelandooTreinoVenceEm" TIMESTAMP(3),
ADD COLUMN     "freelandooUserId" TEXT;

-- CreateTable
CREATE TABLE "TarefaFreelandoo" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tipo" "TarefaFreelandooTipo" NOT NULL,
    "status" "TarefaFreelandooStatus" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoErro" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "TarefaFreelandoo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TarefaFreelandoo_dedupeKey_key" ON "TarefaFreelandoo"("dedupeKey");

-- CreateIndex
CREATE INDEX "TarefaFreelandoo_status_proximaEm_idx" ON "TarefaFreelandoo"("status", "proximaEm");

-- CreateIndex
CREATE INDEX "TarefaFreelandoo_personId_idx" ON "TarefaFreelandoo"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_freelandooUserId_key" ON "Person"("freelandooUserId");

-- AddForeignKey
ALTER TABLE "TarefaFreelandoo" ADD CONSTRAINT "TarefaFreelandoo_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

