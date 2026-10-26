-- CreateTable
CREATE TABLE "ContratoAluno" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "editadoPor" TEXT,
    "editadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoAluno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContratoAluno_membershipId_key" ON "ContratoAluno"("membershipId");

-- AddForeignKey
ALTER TABLE "ContratoAluno" ADD CONSTRAINT "ContratoAluno_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

