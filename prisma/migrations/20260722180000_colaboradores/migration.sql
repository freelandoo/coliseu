-- Nome de acesso: adicionado nulo, preenchido a partir do e-mail existente e só
-- então promovido a NOT NULL + UNIQUE. Fazer direto quebraria com usuários já
-- cadastrados em produção.
ALTER TABLE "User" ADD COLUMN "login" TEXT;

UPDATE "User" SET "login" = lower(split_part("email", '@', 1)) WHERE "login" IS NULL;

-- Dois e-mails diferentes podem gerar o mesmo login (joao@a.com, joao@b.com).
-- Mantém o mais antigo e sufixa os demais.
UPDATE "User" u
SET "login" = u."login" || '-' || sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY "login" ORDER BY "createdAt", id) AS rn
  FROM "User"
) sub
WHERE u.id = sub.id AND sub.rn > 1;

-- Rede de segurança: e-mail vazio/nulo não geraria login.
UPDATE "User" SET "login" = 'usuario-' || substr(id, 1, 8) WHERE "login" IS NULL OR "login" = '';

ALTER TABLE "User" ALTER COLUMN "login" SET NOT NULL;
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- E-mail passa a ser opcional: colaborador criado pelo admin pode não ter.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "senhaProvisoria" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "personId" TEXT;

CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quem fez a matrícula.
ALTER TABLE "Membership" ADD COLUMN "matriculadoPorId" TEXT;

CREATE INDEX "Membership_matriculadoPorId_idx" ON "Membership"("matriculadoPorId");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_matriculadoPorId_fkey"
  FOREIGN KEY ("matriculadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
