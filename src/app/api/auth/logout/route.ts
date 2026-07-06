import { NextResponse } from "next/server";
import { destruirSessao } from "@/lib/auth/session";

export async function POST() {
  await destruirSessao();
  return NextResponse.json({ ok: true });
}
