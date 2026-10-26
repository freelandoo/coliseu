import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { pessoaComCpfRepo } from "@/lib/repositories/pessoas";

export const dynamic = "force-dynamic";

const SITUACAO_MATRICULA: Record<string, string> = {
  ACTIVE: "aluno ativo",
  PENDING_PAYMENT: "aluno aguardando pagamento",
  SUSPENDED: "aluno bloqueado (pagamento atrasado)",
  CANCELED: "matrícula cancelada",
  EXPIRED: "plano vencido",
  DRAFT: "matrícula em rascunho",
};

/**
 * GET ?cpf=&ignorar= — o cadastro que já tem este CPF, com a situação, para o
 * campo CPF do cadastro mostrar na hora (e não deixar criar outro). `ignorar`:
 * a própria pessoa da ficha que está sendo editada.
 */
export async function GET(req: Request) {
  const g = await exigirModuloApi("matriculados", "captacao", "acesso");
  if (g.erro) return g.erro;
  const u = new URL(req.url).searchParams;
  const p = await pessoaComCpfRepo(u.get("cpf") ?? "", u.get("ignorar") ?? undefined);
  if (!p) return NextResponse.json({ existente: null });

  const extra = await prisma.person.findUnique({
    where: { id: p.id },
    select: {
      inativadoEm: true,
      memberships: { orderBy: { matriculadoEm: "desc" }, take: 1, select: { status: true, plan: { select: { nome: true } } } },
    },
  });
  const m = extra?.memberships[0];
  const situacao =
    p.fase === "exaluno"
      ? "ex-aluno (inativo)"
      : p.fase === "lead"
        ? extra?.inativadoEm
          ? "cadastro antigo, inativo"
          : "lead"
        : m
          ? (SITUACAO_MATRICULA[m.status] ?? "aluno")
          : "aluno";
  return NextResponse.json({
    existente: {
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      situacao,
      plano: m?.plan.nome.trim() ?? null,
      inativoDesde: extra?.inativadoEm?.toISOString().slice(0, 10) ?? null,
    },
  });
}
