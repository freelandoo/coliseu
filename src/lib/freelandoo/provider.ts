import { prisma } from "@/lib/db";
import {
  decodeCursor,
  encodeCursor,
  mapCobrancaStatus,
  mapMembershipStatus,
  normalizarCpf,
} from "@/lib/freelandoo/mapping";

const MAX_LIMIT = 500;

export function clampLimit(raw: string | null): number {
  const n = Number(raw ?? 200);
  if (!Number.isFinite(n) || n < 1) return 200;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** GET /api/freelandoo/member?cpf= — matrícula mais recente do CPF. */
export async function memberByCpf(cpfRaw: string) {
  const cpf = normalizarCpf(cpfRaw);
  if (cpf.length !== 11) return { found: false as const };

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Person"
    WHERE regexp_replace(coalesce(cpf, ''), '\\D', '', 'g') = ${cpf}
    LIMIT 1`;
  if (!rows.length) return { found: false as const };

  const person = await prisma.person.findUnique({
    where: { id: rows[0].id },
    include: {
      memberships: {
        orderBy: { matriculadoEm: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
  });
  if (!person) return { found: false as const };

  const m = person.memberships[0];
  return {
    found: true as const,
    name: person.nome,
    membership: m
      ? {
          status: mapMembershipStatus(m.status),
          plan_name: m.plan?.nome ?? null,
          enrolled_at: m.matriculadoEm.toISOString(),
          expires_at: m.vencimentoPlano.toISOString(),
        }
      : null,
  };
}

/** GET /api/freelandoo/access-events?since=&limit= — giros com passagem física. */
export async function accessEventsSince(cursorRaw: string | null, limit: number) {
  const cursor = decodeCursor(cursorRaw);
  const events = await prisma.accessEvent.findMany({
    where: {
      physicallyPassed: true,
      personId: { not: null },
      ...(cursor
        ? {
            OR: [
              { serverTime: { gt: cursor.at } },
              { serverTime: cursor.at, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ serverTime: "asc" }, { id: "asc" }],
    take: limit,
    include: { person: { select: { cpf: true } } },
  });

  const out = [];
  for (const e of events) {
    const cpf = normalizarCpf(e.person?.cpf);
    if (cpf.length !== 11) continue; // sem CPF não tem como a Freelandoo associar
    out.push({ id: e.id, cpf, at: e.deviceTime.toISOString(), passed: true });
  }
  const last = events[events.length - 1];
  return {
    events: out,
    next_cursor: last ? encodeCursor(last.serverTime, last.id) : (cursorRaw ?? null),
  };
}

/** GET /api/freelandoo/payments?since=&limit= — cobranças criadas/alteradas desde o cursor. */
export async function paymentsSince(cursorRaw: string | null, limit: number) {
  const cursor = decodeCursor(cursorRaw);
  const cobrancas = await prisma.cobranca.findMany({
    where: cursor
      ? {
          OR: [
            { updatedAt: { gt: cursor.at } },
            { updatedAt: cursor.at, id: { gt: cursor.id } },
          ],
        }
      : {},
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
    include: { person: { select: { cpf: true } } },
  });

  const out = [];
  for (const c of cobrancas) {
    const cpf = normalizarCpf(c.person?.cpf);
    if (cpf.length !== 11) continue;
    out.push({
      id: c.id,
      cpf,
      amount_cents: Math.round(c.valor * 100),
      due_date: c.vencimento.toISOString(),
      status: mapCobrancaStatus(c.status),
      paid_at: c.status === "pago" ? c.updatedAt.toISOString() : null,
    });
  }
  const last = cobrancas[cobrancas.length - 1];
  return {
    payments: out,
    next_cursor: last ? encodeCursor(last.updatedAt, last.id) : (cursorRaw ?? null),
  };
}
