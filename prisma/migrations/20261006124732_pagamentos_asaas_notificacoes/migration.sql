-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CobrancaStatus" ADD VALUE 'cancelado';
ALTER TYPE "CobrancaStatus" ADD VALUE 'estornado';

-- AlterEnum
ALTER TYPE "CobrancaTipo" ADD VALUE 'avulsa';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "personId" TEXT;

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "url" TEXT,
    "chave" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacao_userId_createdAt_idx" ON "Notificacao"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notificacao_userId_chave_key" ON "Notificacao"("userId", "chave");

-- CreateIndex
CREATE INDEX "Payment_personId_dueDate_idx" ON "Payment"("personId", "dueDate");

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: pagamentos que já existem herdam o dono pela assinatura → cliente.
UPDATE "Payment" p
SET "personId" = bc."personId"
FROM "BillingSubscription" bs
JOIN "BillingCustomer" bc ON bc."id" = bs."customerId"
WHERE p."subscriptionId" = bs."id" AND p."personId" IS NULL;
