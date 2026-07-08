import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { clampLimit, paymentsSince } from "@/lib/freelandoo/provider";

export async function GET(req: Request) {
  const erro = await exigirFreelandoo(req);
  if (erro) return erro;
  const params = new URL(req.url).searchParams;
  const result = await paymentsSince(params.get("since"), clampLimit(params.get("limit")));
  return NextResponse.json(result);
}
