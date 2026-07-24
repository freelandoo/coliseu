-- Grupos do WhatsApp passam a entrar no Atendimento.
-- Aditivo e com default: conversa existente continua valendo como conversa 1:1.
ALTER TABLE "Conversa" ADD COLUMN "ehGrupo" BOOLEAN NOT NULL DEFAULT false;

-- Em grupo, cada mensagem tem um autor diferente; sem isso a thread fica ilegível.
ALTER TABLE "Mensagem" ADD COLUMN "remetente" TEXT;
