import { beforeEach, describe, expect, test, vi } from "vitest";

// Banco em memória: só o que a baixa toca.
type Cob = {
  id: string; personId: string; tipo: string; valor: number; vencimento: Date;
  status: string; asaasId: string | null; metodo: string | null; freelandooRef: string | null;
  updatedAt: Date; person: { cpf: string | null };
};
const db = vi.hoisted(() => ({ cobs: new Map<string, unknown>() }));

vi.mock("@/lib/db", () => {
  const get = (id: string) => db.cobs.get(id) as Cob | undefined;
  const cobranca = {
    findUnique: async ({ where }: { where: { id: string } }) => get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Cob> }) => {
      const c = get(where.id)!;
      Object.assign(c, data);
      return c;
    },
    updateMany: async ({ where, data }: { where: { id: string; freelandooRef: null }; data: Partial<Cob> }) => {
      const c = get(where.id);
      if (!c || c.freelandooRef !== null) return { count: 0 };
      Object.assign(c, data);
      return { count: 1 };
    },
  };
  return { prisma: { cobranca, $transaction: async (fn: (tx: unknown) => unknown) => fn({ cobranca }) } };
});
const asaas = vi.hoisted(() => ({ recebido: [] as string[], desfeito: [] as string[], falhar: false }));
vi.mock("@/lib/asaas", () => ({
  ehIdAsaasReal: (id: string | null) => Boolean(id && id.startsWith("pay_r")),
  receberEmDinheiroAsaas: async (id: string) => {
    if (asaas.falhar) throw new Error("asaas fora");
    asaas.recebido.push(id);
  },
  desfazerRecebimentoAsaas: async (id: string) => {
    asaas.desfeito.push(id);
  },
}));
const aplicados = vi.hoisted(() => [] as { id: string; status: string; billingType?: string }[]);
vi.mock("@/lib/billing/aplicar", () => ({
  aplicarPagamento: async (p: { id: string; billingType?: string }, status: string) => {
    aplicados.push({ id: p.id, status, billingType: p.billingType });
    for (const c of db.cobs.values() as IterableIterator<Cob>) {
      if (c.asaasId === p.id) c.status = status === "PAID" ? "pago" : status === "OVERDUE" ? "atrasado" : "pendente";
    }
  },
}));
vi.mock("@/lib/billing/apply", () => ({ sincronizarMembership: async () => {} }));
vi.mock("@/lib/access/outbox", () => ({ recalcularAcessoDePessoa: async () => {} }));

import { baixarPelaFreelandoo, metodoDe, paymentById, reabrirPelaFreelandoo } from "@/lib/freelandoo/baixa";

function cob(extra: Partial<Cob> = {}): Cob {
  const c: Cob = {
    id: "c1", personId: "p1", tipo: "mensalidade", valor: 120, vencimento: new Date("2026-10-10T12:00:00Z"),
    status: "atrasado", asaasId: "pay_real1", metodo: null, freelandooRef: null,
    updatedAt: new Date("2026-10-27T00:00:00Z"), person: { cpf: "529.982.247-25" }, ...extra,
  };
  db.cobs.set(c.id, c);
  return c;
}

beforeEach(() => {
  db.cobs.clear();
  asaas.recebido = [];
  asaas.desfeito = [];
  asaas.falhar = false;
  aplicados.length = 0;
});

describe("baixa pela Freelandoo", () => {
  test("dá baixa no Asaas (recebido) e passa pelo caminho único do Coliseu", async () => {
    cob();
    const r = await baixarPelaFreelandoo("c1", { ref: "freelandoo:7", amount_cents: 12000 });
    expect(r).toEqual({ ok: true, already: false });
    expect(asaas.recebido).toEqual(["pay_real1"]);
    expect(aplicados).toEqual([{ id: "pay_real1", status: "PAID", billingType: "FREELANDOO" }]);
    const c = db.cobs.get("c1") as Cob;
    expect([c.status, c.metodo, c.freelandooRef]).toEqual(["pago", "freelandoo", "freelandoo:7"]);
  });

  test("repetir a mesma ref não baixa duas vezes", async () => {
    cob();
    await baixarPelaFreelandoo("c1", { ref: "freelandoo:7" });
    const r = await baixarPelaFreelandoo("c1", { ref: "freelandoo:7" });
    expect(r).toEqual({ ok: true, already: true });
    expect(asaas.recebido).toHaveLength(1);
  });

  test("cobrança já paga na academia: 409, nada muda", async () => {
    cob({ status: "pago" });
    expect(await baixarPelaFreelandoo("c1", { ref: "freelandoo:7" })).toEqual({ error: "already_paid", status: 409 });
    expect(asaas.recebido).toHaveLength(0);
  });

  test("Asaas fora: solta a reserva para a Freelandoo tentar de novo", async () => {
    cob();
    asaas.falhar = true;
    expect(await baixarPelaFreelandoo("c1", { ref: "freelandoo:7" })).toEqual({ error: "asaas_error", status: 502 });
    expect((db.cobs.get("c1") as Cob).freelandooRef).toBeNull();
  });

  test("ref sem prefixo é recusada", async () => {
    cob();
    expect(await baixarPelaFreelandoo("c1", { ref: "x" })).toEqual({ error: "ref inválido", status: 400 });
  });

  test("reabrir desfaz o recebido no Asaas e volta a vencida", async () => {
    cob();
    await baixarPelaFreelandoo("c1", { ref: "freelandoo:7" });
    const r = await reabrirPelaFreelandoo("c1", { ref: "freelandoo:7" });
    expect(r).toEqual({ ok: true, already: false });
    expect(asaas.desfeito).toEqual(["pay_real1"]);
    const c = db.cobs.get("c1") as Cob;
    expect([c.status, c.freelandooRef, c.metodo]).toEqual(["atrasado", null, null]);
    expect(await reabrirPelaFreelandoo("c1", { ref: "freelandoo:7" })).toEqual({ ok: true, already: true });
  });

  test("a cobrança de leitura mostra o método freelandoo", async () => {
    cob({ freelandooRef: "freelandoo:7", status: "pago" });
    const item = await paymentById("c1");
    expect(item).toMatchObject({ id: "c1", cpf: "52998224725", amount_cents: 12000, status: "paid", method: "freelandoo" });
    expect(metodoDe({ metodo: "pix", freelandooRef: null })).toBe("pix");
  });
});
