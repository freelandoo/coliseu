-- CreateEnum
CREATE TYPE "WhatsappStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED');

-- CreateEnum
CREATE TYPE "ConversaInteresse" AS ENUM ('nao_classificado', 'com_interesse', 'sem_interesse', 'perdido', 'convertido');

-- CreateEnum
CREATE TYPE "MensagemDirecao" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MensagemAutor" AS ENUM ('LEAD', 'ATENDENTE');

-- CreateTable
CREATE TABLE "WhatsappInstance" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "evolutionInstance" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "WhatsappStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "numeroConectado" TEXT,
    "ultimoEstadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "pushName" TEXT,
    "personId" TEXT,
    "atendenteId" TEXT,
    "interesse" "ConversaInteresse" NOT NULL DEFAULT 'nao_classificado',
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "ultimaMensagemEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaMensagemPreview" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direcao" "MensagemDirecao" NOT NULL,
    "autor" "MensagemAutor" NOT NULL,
    "autorUserId" TEXT,
    "texto" TEXT NOT NULL,
    "tipoMidia" TEXT NOT NULL DEFAULT 'texto',
    "enviadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erro" TEXT,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtendimentoRegistro" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interesse" "ConversaInteresse" NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtendimentoRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInstance_evolutionInstance_key" ON "WhatsappInstance"("evolutionInstance");

-- CreateIndex
CREATE INDEX "WhatsappInstance_unitId_status_idx" ON "WhatsappInstance"("unitId", "status");

-- CreateIndex
CREATE INDEX "Conversa_unitId_ultimaMensagemEm_idx" ON "Conversa"("unitId", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "Conversa_personId_idx" ON "Conversa"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_instanceId_remoteJid_key" ON "Conversa"("instanceId", "remoteJid");

-- CreateIndex
CREATE UNIQUE INDEX "Mensagem_waMessageId_key" ON "Mensagem"("waMessageId");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_enviadaEm_idx" ON "Mensagem"("conversaId", "enviadaEm");

-- CreateIndex
CREATE INDEX "AtendimentoRegistro_conversaId_criadoEm_idx" ON "AtendimentoRegistro"("conversaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "WhatsappInstance" ADD CONSTRAINT "WhatsappInstance_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_atendenteId_fkey" FOREIGN KEY ("atendenteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_autorUserId_fkey" FOREIGN KEY ("autorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtendimentoRegistro" ADD CONSTRAINT "AtendimentoRegistro_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtendimentoRegistro" ADD CONSTRAINT "AtendimentoRegistro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
