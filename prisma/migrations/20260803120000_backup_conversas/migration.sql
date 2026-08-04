-- Lixeira do atendimento: "limpar" e "remover" passam a copiar a conversa e o
-- histórico para cá antes de apagar, e o usuário desenvolvedor restaura de lá.
-- Escrita à mão (banco local desligado); espelha ConversaBackup/MensagemBackup
-- e o campo User.desenvolvedor do schema.

-- Conta de manutenção: recorte à parte do papel, único acesso a /backup.
ALTER TABLE "User" ADD COLUMN "desenvolvedor" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "BackupMotivo" AS ENUM ('limpar', 'remover');

-- Sem FK para Conversa/User/Person de propósito: a cópia tem de sobreviver à
-- exclusão do original.
CREATE TABLE "ConversaBackup" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "pushName" TEXT,
    "ehGrupo" BOOLEAN NOT NULL DEFAULT false,
    "personId" TEXT,
    "atendenteId" TEXT,
    "interesse" "ConversaInteresse" NOT NULL DEFAULT 'nao_classificado',
    "ultimaMensagemEm" TIMESTAMP(3) NOT NULL,
    "ultimaMensagemPreview" TEXT NOT NULL DEFAULT '',
    "conversaCriadaEm" TIMESTAMP(3) NOT NULL,
    "motivo" "BackupMotivo" NOT NULL,
    "excluidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excluidoPorId" TEXT,
    "excluidoPorNome" TEXT NOT NULL,
    "restauradoEm" TIMESTAMP(3),

    CONSTRAINT "ConversaBackup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversaBackup_excluidoEm_idx" ON "ConversaBackup"("excluidoEm");

CREATE INDEX "ConversaBackup_conversaId_idx" ON "ConversaBackup"("conversaId");

-- waMessageId não é único aqui: a mesma mensagem pode ser apagada, restaurada
-- e apagada de novo, gerando mais de uma cópia.
CREATE TABLE "MensagemBackup" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direcao" "MensagemDirecao" NOT NULL,
    "autor" "MensagemAutor" NOT NULL,
    "autorUserId" TEXT,
    "remetente" TEXT,
    "texto" TEXT NOT NULL,
    "tipoMidia" TEXT NOT NULL DEFAULT 'texto',
    "enviadaEm" TIMESTAMP(3) NOT NULL,
    "erro" TEXT,

    CONSTRAINT "MensagemBackup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MensagemBackup_backupId_enviadaEm_idx" ON "MensagemBackup"("backupId", "enviadaEm");

ALTER TABLE "MensagemBackup" ADD CONSTRAINT "MensagemBackup_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ConversaBackup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
