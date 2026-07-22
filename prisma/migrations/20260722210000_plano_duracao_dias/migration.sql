-- Duração do plano passa de meses para dias.
-- Conversão: ano fechado vira 365 dias (12 meses = 365, 24 = 730); o resto
-- vira mês comercial de 30 dias (1 = 30, 3 = 90, 6 = 180).
ALTER TABLE "Plan" RENAME COLUMN "duracaoMeses" TO "duracaoDias";

UPDATE "Plan"
SET "duracaoDias" = CASE
  WHEN "duracaoDias" % 12 = 0 THEN ("duracaoDias" / 12) * 365
  ELSE "duracaoDias" * 30
END;
