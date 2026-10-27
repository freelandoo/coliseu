-- AlterTable
ALTER TABLE "BillingCustomer" ADD COLUMN "avisosPausados" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CobrancaEnvio" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "paymentId" TEXT,
    "origem" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "detalhe" TEXT,
    "porUsuario" TEXT,
    "chave" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CobrancaEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CobrancaEnvio_chave_key" ON "CobrancaEnvio"("chave");

-- CreateIndex
CREATE INDEX "CobrancaEnvio_personId_criadoEm_idx" ON "CobrancaEnvio"("personId", "criadoEm");

-- CreateIndex
CREATE INDEX "CobrancaEnvio_criadoEm_idx" ON "CobrancaEnvio"("criadoEm");

-- AddForeignKey
ALTER TABLE "CobrancaEnvio" ADD CONSTRAINT "CobrancaEnvio_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
