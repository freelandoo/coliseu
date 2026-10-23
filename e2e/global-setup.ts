import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Contas de teste por papel (o seed só cria admins). Idempotente: roda antes
 * de cada execução e não mexe em mais nada do banco.
 */
export const CONTAS = {
  admin: { login: "admin", senha: "coliseu123" },
  recepcao: { login: "e2e-recepcao", senha: "coliseu123" },
  tecnico: { login: "e2e-tecnico", senha: "coliseu123" },
} as const;

export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const prisma = new PrismaClient();
  try {
    const unit = await prisma.unit.findFirstOrThrow();
    for (const [login, role] of [
      [CONTAS.recepcao.login, "RECEPCAO"],
      [CONTAS.tecnico.login, "TECNICO"],
    ] as const) {
      await prisma.user.upsert({
        where: { login },
        update: { role, senhaProvisoria: false },
        create: {
          login,
          nome: `E2E ${role.toLowerCase()}`,
          passwordHash: await hashPassword(CONTAS.recepcao.senha),
          role,
          unitId: unit.id,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
