-- Título da resposta pronta: identificação editável na lista, sem mexer na
-- mensagem original. Nulo = a lista mostra a primeira frase do texto.
-- Escrita à mão (banco local desligado); espelha o schema.
ALTER TABLE "RespostaPronta" ADD COLUMN "titulo" TEXT;
