-- Aba Treinos (2026-10-26): o professor já mandou a ficha pela Freelandoo e
-- ela espera o aluno confirmar no app. Cópia de proposta_treino_pendente do
-- GET /partner/v1/members; a aba mostra "aguardando o aluno" em vez de cobrar
-- o professor de novo.
ALTER TABLE "Person" ADD COLUMN "freelandooTreinoPropostaPendente" BOOLEAN NOT NULL DEFAULT false;
