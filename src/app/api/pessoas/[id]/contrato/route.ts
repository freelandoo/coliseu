import { NextResponse } from "next/server";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import {
  contratoDoAluno,
  contratoPadraoDoAluno,
  descartarContratoEditado,
  salvarContratoEditado,
} from "@/lib/contrato/contrato-aluno";

type Ctx = { params: Promise<{ id: string }> };

/** Contrato da matrícula atual: editado (se houver) ou o modelo preenchido. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados");
  if (g.erro) return g.erro;
  const { id } = await params;
  const c = await contratoDoAluno(id);
  if (!c) return NextResponse.json({ erro: "Aluno sem matrícula" }, { status: 404 });
  return NextResponse.json(c);
}

/** Guarda o texto editado pela recepção (fica para reimprimir). */
export async function PUT(req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados");
  if (g.erro) return g.erro;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { html?: unknown };
  if (typeof body.html !== "string" || !body.html.trim()) {
    return NextResponse.json({ erro: "Contrato vazio" }, { status: 400 });
  }
  const ok = await salvarContratoEditado(id, body.html, g.user?.nome ?? null);
  if (!ok) return NextResponse.json({ erro: "Aluno sem matrícula" }, { status: 404 });
  return NextResponse.json(await contratoDoAluno(id));
}

/** Descarta a edição: volta ao modelo preenchido com os dados atuais. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados");
  if (g.erro) return g.erro;
  const { id } = await params;
  await descartarContratoEditado(id);
  const html = await contratoPadraoDoAluno(id);
  if (!html) return NextResponse.json({ erro: "Aluno sem matrícula" }, { status: 404 });
  return NextResponse.json(await contratoDoAluno(id));
}
