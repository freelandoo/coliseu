/**
 * Garante a conta de manutenção (a única que abre /backup).
 *
 * Uso:
 *   npm run db:dev-user                      → cria se faltar; não toca em senha
 *   npm run db:dev-user -- --redefinir-senha → volta a senha ao padrão
 *
 * Padrão admin/admin123; DEV_USER_LOGIN e DEV_USER_SENHA sobrescrevem. Roda no
 * preDeploy do Railway, logo depois do `prisma migrate deploy`, e é idempotente.
 */
import { prisma } from "@/lib/db";
import { garantirDesenvolvedor } from "@/lib/auth/desenvolvedor";

const MENSAGEM = {
  criado: "conta de desenvolvedor criada",
  promovido: "conta já existia — acesso ao backup liberado (senha mantida)",
  "senha-redefinida": "senha redefinida para o padrão",
  nada: "conta de desenvolvedor já estava em dia",
} as const;

async function main() {
  const redefinirSenha = process.argv.includes("--redefinir-senha");
  const r = await garantirDesenvolvedor({ redefinirSenha });
  console.log(`[dev-user] ${r.login}: ${MENSAGEM[r.acao]}`);
}

main()
  .catch((e) => {
    console.error("[dev-user] falhou:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
