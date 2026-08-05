-- Preferência de teclado do atendimento: Enter envia a resposta (true) ou
-- quebra linha (false, como sempre foi). Mora no usuário, não no navegador: o
-- balcão é compartilhado e cada turno entra na própria conta.
-- Escrita à mão (banco local desligado); espelha o schema.
ALTER TABLE "User" ADD COLUMN "enterEnvia" BOOLEAN NOT NULL DEFAULT false;
