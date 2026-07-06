import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { criarOverride } from "@/lib/repositories/access";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { registrarAudit } from "@/lib/access/audit";

export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!g.user || !podePapel(g.user.role as Papel, ["RECEPCAO", "ADMIN"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }
  const body = (await req.json()) as { personId?: string; action?: "ALLOW" | "BLOCK"; reason?: string; minutos?: number };
  if (!body.personId || (body.action !== "ALLOW" && body.action !== "BLOCK") || !body.reason?.trim()) {
    return NextResponse.json({ erro: "personId, action (ALLOW|BLOCK) e reason são obrigatórios" }, { status: 400 });
  }
  const expiresAt = body.minutos ? new Date(Date.now() + body.minutos * 60_000) : null;
  const ov = await criarOverride({ personId: body.personId, action: body.action, reason: body.reason, expiresAt, createdByUserId: g.user.id });
  await recalcularAcessoDePessoa(body.personId);
  await registrarAudit({ actorType: "USER", actorId: g.user.id, action: `OVERRIDE_${body.action}`, entity: "Person", entityId: body.personId, after: { reason: body.reason, expiresAt } });
  return NextResponse.json(ov, { status: 201 });
}
