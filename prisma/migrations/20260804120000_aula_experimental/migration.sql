-- Aula experimental marcada pela recepção durante a conversa do WhatsApp.
-- Escrita à mão (banco local desligado); espelha o modelo AulaExperimental.
--
-- `data` é texto "AAAA-MM-DD" e `hora` é inteiro, na hora do relógio da
-- academia: "quem tem aula hoje?" vira comparação de string, sem depender de o
-- servidor (UTC) e o celular da recepção (São Paulo) concordarem sobre fuso.
CREATE TABLE "AulaExperimental" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "conversaId" TEXT,
    "personId" TEXT,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "modalidade" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "hora" INTEGER NOT NULL,
    "agendadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AulaExperimental_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AulaExperimental_unitId_data_idx" ON "AulaExperimental"("unitId", "data");

CREATE INDEX "AulaExperimental_conversaId_idx" ON "AulaExperimental"("conversaId");

ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vínculos frouxos: apagar a conversa, o cadastro ou a conta de quem agendou
-- não apaga o compromisso já combinado com a pessoa.
ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AulaExperimental" ADD CONSTRAINT "AulaExperimental_agendadoPorId_fkey" FOREIGN KEY ("agendadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
