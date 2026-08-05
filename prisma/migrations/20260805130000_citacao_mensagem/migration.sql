-- Citar mensagem: o "responder" do WhatsApp dentro do atendimento.
--
-- `citadaWaId` é o key.id da mensagem respondida — é por ele que o WhatsApp
-- amarra uma na outra, e é o que a Evolution manda no campo `quoted`.
-- `citadaTexto` e `citadaAutor` são cópia do trecho no momento do envio: a
-- citação precisa continuar legível mesmo depois de a original ser apagada
-- (Limpar/Remover), por isso não há chave estrangeira aqui.
-- Escrita à mão (banco local desligado); espelha o schema.
ALTER TABLE "Mensagem" ADD COLUMN "citadaWaId" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "citadaTexto" TEXT;
ALTER TABLE "Mensagem" ADD COLUMN "citadaAutor" TEXT;

-- Resolver "quem é a original desta citação?" na abertura da conversa.
CREATE INDEX "Mensagem_citadaWaId_idx" ON "Mensagem"("citadaWaId");

ALTER TABLE "MensagemBackup" ADD COLUMN "citadaWaId" TEXT;
ALTER TABLE "MensagemBackup" ADD COLUMN "citadaTexto" TEXT;
ALTER TABLE "MensagemBackup" ADD COLUMN "citadaAutor" TEXT;
