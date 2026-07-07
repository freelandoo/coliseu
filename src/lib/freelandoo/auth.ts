import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Valida o Bearer token da Gym Provider API (consumida pela Freelandoo).
 * Em produção exige FREELANDOO_API_TOKEN configurado; comparação constant-time.
 */
export function exigirFreelandoo(req: Request): NextResponse | null {
  const expected = process.env.FREELANDOO_API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "gym provider token not configured" }, { status: 503 });
    }
    return null; // dev sem token configurado: libera (mesma postura do agente)
  }
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
