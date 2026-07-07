-- Cursor incremental da Gym Provider API (Freelandoo): payments são re-enviados
-- quando mudam de status, então a Cobranca precisa de updatedAt.
ALTER TABLE "Cobranca" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Cobranca_updatedAt_idx" ON "Cobranca"("updatedAt");
