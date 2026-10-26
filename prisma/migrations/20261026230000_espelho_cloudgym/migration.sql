-- CreateTable
CREATE TABLE "EspelhoCloudgym" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "cloudgymId" INTEGER,
    "estado" TEXT NOT NULL,
    "detalhe" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspelhoCloudgym_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EspelhoCloudgym_estado_idx" ON "EspelhoCloudgym"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "EspelhoCloudgym_tipo_localId_key" ON "EspelhoCloudgym"("tipo", "localId");
