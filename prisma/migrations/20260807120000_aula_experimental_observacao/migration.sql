-- Observação da aula experimental: o recado que a recepção deixa no calendário
-- para o turno seguinte ("vem com a mãe", "só depois das 19h"). Nasce nulo —
-- aula sem recado é o caso comum, e string vazia só criaria dois jeitos de
-- dizer a mesma coisa.
-- Escrita à mão (banco local desligado); espelha o schema.
ALTER TABLE "AulaExperimental" ADD COLUMN "observacao" TEXT;
