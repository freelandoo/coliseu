import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { unitIdAtual } from "@/lib/repositories/unit";
import type { Role } from "@prisma/client";

export interface Colaborador {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  role: Role;
  ativo: boolean;
  senhaProvisoria: boolean;
  personId: string | null;
  criadoEm: string;
}

/** Erro de regra de negócio — o caller traduz em 4xx com mensagem. */
export class ColaboradorErro extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ColaboradorErro";
  }
}

/**
 * Normaliza o nome de acesso: minúsculo, sem espaço nem acento. "Maria Silva"
 * vira "maria.silva" — a recepção digita um nome, não um e-mail.
 */
export function normalizarLogin(bruto: string): string {
  const limpo = String(bruto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-_]+|[.\-_]+$/g, "");
  return limpo;
}

/** Sugestão de login a partir do nome, garantindo unicidade. */
export async function sugerirLoginRepo(nome: string): Promise<string> {
  const base = normalizarLogin(nome) || "colaborador";
  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? base : `${base}${i + 1}`;
    const existe = await prisma.user.count({ where: { login: tentativa } });
    if (existe === 0) return tentativa;
  }
  return `${base}${Date.now().toString().slice(-5)}`;
}

function toColaborador(u: {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  role: Role;
  ativo: boolean;
  senhaProvisoria: boolean;
  personId: string | null;
  createdAt: Date;
}): Colaborador {
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    senhaProvisoria: u.senhaProvisoria,
    personId: u.personId,
    criadoEm: u.createdAt.toISOString(),
  };
}

const CAMPOS = {
  id: true, nome: true, login: true, email: true, role: true,
  ativo: true, senhaProvisoria: true, personId: true, createdAt: true,
} as const;

export async function listarColaboradoresRepo(): Promise<Colaborador[]> {
  const rows = await prisma.user.findMany({ select: CAMPOS, orderBy: { createdAt: "asc" } });
  return rows.map(toColaborador);
}

export async function criarColaboradorRepo(input: {
  nome: string;
  login?: string;
  email?: string;
  senha: string;
  role: Role;
  personId?: string;
}): Promise<Colaborador> {
  const nome = input.nome.trim();
  if (!nome) throw new ColaboradorErro("Informe o nome.");
  if (input.senha.length < 8) throw new ColaboradorErro("A senha deve ter ao menos 8 caracteres.");

  const login = normalizarLogin(input.login || nome);
  if (!login) throw new ColaboradorErro("Login inválido.");
  if (await prisma.user.count({ where: { login } })) {
    throw new ColaboradorErro(`O login "${login}" já está em uso.`, 409);
  }

  const email = input.email?.trim().toLowerCase() || null;
  if (email && (await prisma.user.count({ where: { email } }))) {
    throw new ColaboradorErro("Já existe uma conta com este e-mail.", 409);
  }
  if (input.personId && (await prisma.user.count({ where: { personId: input.personId } }))) {
    throw new ColaboradorErro("Esta pessoa já tem acesso ao sistema.", 409);
  }

  const criado = await prisma.user.create({
    data: {
      nome,
      login,
      email,
      passwordHash: await hashPassword(input.senha),
      role: input.role,
      // Senha veio do admin: o colaborador troca no primeiro acesso.
      senhaProvisoria: true,
      unitId: await unitIdAtual(),
      personId: input.personId ?? null,
    },
    select: CAMPOS,
  });
  return toColaborador(criado);
}

/** Impede que a última conta ADMIN ativa seja rebaixada ou desativada. */
async function garantirOutroAdminAtivo(id: string) {
  const outros = await prisma.user.count({
    where: { role: "ADMIN", ativo: true, id: { not: id } },
  });
  if (outros === 0) {
    throw new ColaboradorErro(
      "Este é o último administrador ativo. Promova outra pessoa antes.",
      409,
    );
  }
}

export async function atualizarColaboradorRepo(
  id: string,
  patch: { role?: Role; ativo?: boolean; senha?: string },
  atorId: string,
): Promise<Colaborador> {
  const alvo = await prisma.user.findUnique({ where: { id }, select: CAMPOS });
  if (!alvo) throw new ColaboradorErro("Colaborador não encontrado.", 404);

  const perdeAdmin = alvo.role === "ADMIN" && patch.role !== undefined && patch.role !== "ADMIN";
  const perdeAcesso = alvo.ativo && patch.ativo === false;

  if (alvo.role === "ADMIN" && (perdeAdmin || perdeAcesso)) {
    await garantirOutroAdminAtivo(id);
  }
  // Rebaixar ou desativar a si mesmo tranca o admin para fora da própria gestão.
  if (id === atorId && (perdeAdmin || perdeAcesso)) {
    throw new ColaboradorErro("Você não pode remover o próprio acesso de administrador.");
  }
  if (patch.senha !== undefined && patch.senha.length < 8) {
    throw new ColaboradorErro("A senha deve ter ao menos 8 caracteres.");
  }

  const atualizado = await prisma.user.update({
    where: { id },
    data: {
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.ativo !== undefined ? { ativo: patch.ativo } : {}),
      ...(patch.senha !== undefined
        ? { passwordHash: await hashPassword(patch.senha), senhaProvisoria: true }
        : {}),
    },
    select: CAMPOS,
  });

  // Senha redefinida ou acesso desativado: derruba as sessões abertas.
  if (patch.senha !== undefined || patch.ativo === false) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  return toColaborador(atualizado);
}
