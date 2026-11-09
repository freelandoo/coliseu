-- CreateTable
CREATE TABLE "LoginFalha" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginFalha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginFalha_criadaEm_idx" ON "LoginFalha"("criadaEm");

-- CreateIndex
CREATE INDEX "LoginFalha_identificador_criadaEm_idx" ON "LoginFalha"("identificador", "criadaEm");
