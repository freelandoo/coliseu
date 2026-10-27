import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { capabilities } from "@/lib/freelandoo/baixa";

/** GET /api/freelandoo/capabilities — o que este provedor sabe fazer. */
export async function GET(req: Request) {
  const erro = await exigirFreelandoo(req);
  if (erro) return erro;
  return NextResponse.json(capabilities());
}
