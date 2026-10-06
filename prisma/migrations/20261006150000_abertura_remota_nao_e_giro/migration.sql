-- Aberturas sem identificação (botão "Liberar catraca", interface web,
-- botoeira) eram gravadas como passagem física — inflavam os giros sem
-- ninguém ter passado. Só dados; a ingestão já não grava mais assim.
UPDATE "AccessEvent"
SET "physicallyPassed" = false
WHERE "physicallyPassed" = true
  AND "reason" IN ('Interface WEB', 'Abertura via API', 'Botoeira');
