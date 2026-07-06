-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPCAO', 'TECNICO');

-- CreateEnum
CREATE TYPE "Origem" AS ENUM ('whatsapp', 'redes', 'balcao', 'indicacao');

-- CreateEnum
CREATE TYPE "PessoaFase" AS ENUM ('lead', 'aluno');

-- CreateEnum
CREATE TYPE "LeadEstagio" AS ENUM ('novo', 'qualificado', 'interesse', 'perdido', 'convertido');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CobrancaStatus" AS ENUM ('pendente', 'pago', 'atrasado');

-- CreateEnum
CREATE TYPE "CobrancaTipo" AS ENUM ('matricula', 'mensalidade', 'renovacao');

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECEPCAO',
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "cpf" TEXT,
    "origem" "Origem" NOT NULL,
    "fase" "PessoaFase" NOT NULL DEFAULT 'lead',
    "estagio" "LeadEstagio",
    "motivoPerdido" TEXT,
    "dataNascimento" TEXT,
    "cep" TEXT,
    "estado" TEXT,
    "cidade" TEXT,
    "rua" TEXT,
    "numero" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valorMensal" DOUBLE PRECISION NOT NULL,
    "duracaoMeses" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "descricao" TEXT,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'DRAFT',
    "matriculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vencimentoPlano" TIMESTAMP(3) NOT NULL,
    "ultimaPresenca" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courtesyEntriesLeft" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tipo" "CobrancaTipo" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "CobrancaStatus" NOT NULL DEFAULT 'pendente',
    "asaasId" TEXT,
    "assinaturaId" TEXT,
    "linkPagamento" TEXT,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_slug_key" ON "Unit"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_codigo_key" ON "Person"("codigo");

-- CreateIndex
CREATE INDEX "Person_unitId_fase_idx" ON "Person"("unitId", "fase");

-- CreateIndex
CREATE INDEX "Person_nome_idx" ON "Person"("nome");

-- CreateIndex
CREATE INDEX "Plan_unitId_ativo_idx" ON "Plan"("unitId", "ativo");

-- CreateIndex
CREATE INDEX "Membership_personId_status_idx" ON "Membership"("personId", "status");

-- CreateIndex
CREATE INDEX "Cobranca_personId_status_idx" ON "Cobranca"("personId", "status");

-- CreateIndex
CREATE INDEX "Cobranca_asaasId_idx" ON "Cobranca"("asaasId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
