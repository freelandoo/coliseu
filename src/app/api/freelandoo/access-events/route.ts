import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { accessEventsSince, clampLimit } from "@/lib/freelandoo/provider";

export async function GET(req: Request) {
  const erro = exigirFreelandoo(req);
  if (erro) return erro;
  const params = new URL(req.url).searchParams;
  const result = await accessEventsSince(params.get("since"), clampLimit(params.get("limit")));
  return NextResponse.json(result);
}
