import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

/**
 * Conta de manutenção do sistema. É a única que abre a lixeira de conversas
 * (/backup) — nem o ADMIN entra lá. Também é ADMIN, senão numa base nova ela
 * trancaria o cadastro do primeiro administrador (o registro público só existe
 * enquanto não há nenhum usuário).
 *
 * Login e senha saem do ambiente quando houver: em produção, apontar
 * DEV_USER_LOGIN/DEV_USER_SENHA é o jeito de não deixar credencial conhecida
 * de pé numa URL pública.
 */
export const DEV_LOGIN_PADRAO = "admin";
export const DEV_SENHA_PADRAO = "admin123";

export function loginDesenvolvedor(): string {
  return (process.env.DEV_USER_LOGIN || DEV_LOGIN_PADRAO).trim().toLowerCase();
}

function senhaDesenvolvedor(): string {
  return process.env.DEV_USER_SENHA || DEV_SENHA_PADRAO;
}

export type ResultadoDev =
  | { acao: "criado"; login: string }
  | { acao: "promovido"; login: string } // conta já existia; só ganhou a flag
  | { acao: "senha-redefinida"; login: string }
  | { acao: "nada"; login: string };

/**
 * Idempotente: pode rodar em todo deploy. Não mexe na senha de uma conta que
 * já existe — quem trocou a senha não quer ela de volta ao padrão a cada
 * deploy; para isso existe `redefinirSenha`.
 */
export async function garantirDesenvolvedor(opcoes?: {
  redefinirSenha?: boolean;
}): Promise<ResultadoDev> {
  const login = loginDesenvolvedor();
  const existente = await prisma.user.findUnique({ where: { login } });

  if (!existente) {
    // Vincula à unidade existente (cria a matriz se a base ainda está vazia).
    const unit =
      (await prisma.unit.findFirst({ orderBy: { createdAt: "asc" } })) ??
      (await prisma.unit.create({ data: { slug: "matriz", nome: "Matriz" } }));

    await prisma.user.create({
      data: {
        nome: "Desenvolvedor",
        login,
        passwordHash: await hashPassword(senhaDesenvolvedor()),
        role: "ADMIN",
        desenvolvedor: true,
        // Conta de manutenção não passa pelo modal de troca obrigatória.
        senhaProvisoria: false,
        unitId: unit.id,
      },
    });
    return { acao: "criado", login };
  }

  if (opcoes?.redefinirSenha) {
    await prisma.user.update({
      where: { id: existente.id },
      data: {
        passwordHash: await hashPassword(senhaDesenvolvedor()),
        senhaProvisoria: false,
        desenvolvedor: true,
        ativo: true,
      },
    });
    // Senha trocada derruba as sessões abertas, igual ao reset do admin.
    await prisma.session.deleteMany({ where: { userId: existente.id } });
    return { acao: "senha-redefinida", login };
  }

  if (!existente.desenvolvedor || !existente.ativo) {
    await prisma.user.update({
      where: { id: existente.id },
      data: { desenvolvedor: true, ativo: true },
    });
    return { acao: "promovido", login };
  }

  return { acao: "nada", login };
}
