-- Plano excluído na tela de Planos que ainda tem matrículas antigas: some das
-- listas (excluidoEm preenchido), mas a linha fica para o histórico não quebrar.
ALTER TABLE "Plan" ADD COLUMN "excluidoEm" TIMESTAMP(3);
