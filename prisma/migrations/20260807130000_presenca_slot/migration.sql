-- Presença medida do colaborador: uma linha por bloco de cinco minutos com o
-- sistema aberto e alguém na frente dele. Espelha o modelo PresencaSlot.
-- O par único (usuário, bloco) é o que dedupe a batida do navegador: a rota
-- grava com ON CONFLICT DO NOTHING e nunca lê antes de escrever.
CREATE TABLE "PresencaSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresencaSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PresencaSlot_userId_slot_key" ON "PresencaSlot"("userId", "slot");

CREATE INDEX "PresencaSlot_slot_idx" ON "PresencaSlot"("slot");

ALTER TABLE "PresencaSlot" ADD CONSTRAINT "PresencaSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
