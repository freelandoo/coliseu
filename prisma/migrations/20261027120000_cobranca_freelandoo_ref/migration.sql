-- AlterTable
ALTER TABLE "Cobranca" ADD COLUMN "freelandooRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_freelandooRef_key" ON "Cobranca"("freelandooRef");
