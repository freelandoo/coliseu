import { prisma } from "@/lib/db";

export type MotivoLoginFalha = "usuario_inexistente" | "senha_errada" | "desativado";

/** Corta o texto num tamanho seguro — o campo de login vem do cliente e não pode inchar a tabela. */
function cortar(valor: string | null | undefined, max: number): string | null {
  if (!valor) return null;
  return valor.length > max ? valor.slice(0, max) : valor;
}

/** IP de quem tentou: o Railway põe o cliente original no primeiro item do x-forwarded-for. */
export function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for");
  const ip = encaminhado?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  return cortar(ip, 64);
}

export function dadosLoginFalha(
  req: Request,
  identificador: string,
  motivo: MotivoLoginFalha,
  userId: string | null,
) {
  return {
    identificador: cortar(identificador, 120) ?? "",
    motivo,
    userId,
    ip: ipDaRequisicao(req),
    userAgent: cortar(req.headers.get("user-agent"), 300),
  };
}

/**
 * Grava a tentativa recusada. Nunca derruba o login: se o registro falhar, a
 * pessoa ainda recebe a resposta normal de credencial inválida.
 */
export async function registrarLoginFalha(
  req: Request,
  identificador: string,
  motivo: MotivoLoginFalha,
  userId: string | null,
): Promise<void> {
  try {
    await prisma.loginFalha.create({ data: dadosLoginFalha(req, identificador, motivo, userId) });
  } catch (e) {
    console.error("[login] falha ao registrar tentativa recusada", e);
  }
}
