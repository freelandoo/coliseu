import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FREELANDOO_PROVIDER, sha256Hex } from "@/lib/freelandoo/token";

function iguaisConstante(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Valida o Bearer token da Gym Provider API (consumida pela Freelandoo).
 * Precedência: token gerado pelo painel (tabela ApiToken) → env
 * FREELANDOO_API_TOKEN. Sem nenhum dos dois: dev libera, produção 503.
 * Comparações constant-time.
 */
export async function exigirFreelandoo(req: Request): Promise<NextResponse | null> {
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  const registro = await prisma.apiToken.findUnique({ where: { provider: FREELANDOO_PROVIDER } });
  if (registro) {
    if (!iguaisConstante(sha256Hex(given), registro.tokenHash)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // best-effort: falha aqui não derruba a requisição autenticada
    await prisma.apiToken
      .update({ where: { id: registro.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return null;
  }

  const expected = process.env.FREELANDOO_API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "gym provider token not configured" }, { status: 503 });
    }
    return null; // dev sem token configurado: libera (mesma postura do agente)
  }
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
