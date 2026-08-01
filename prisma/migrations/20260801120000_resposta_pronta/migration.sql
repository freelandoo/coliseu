-- Respostas prontas do atendimento: acervo comum a todos os usuários — quem
-- atende escolhe da lista e o texto cai na caixa de resposta. Escrita à mão
-- (banco local desligado); espelha o modelo RespostaPronta do schema.
CREATE TABLE "RespostaPronta" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespostaPronta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RespostaPronta_criadoEm_idx" ON "RespostaPronta"("criadoEm");

ALTER TABLE "RespostaPronta" ADD CONSTRAINT "RespostaPronta_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
