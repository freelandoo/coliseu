import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { editarAulaRepo } from "@/lib/repositories/aulas-experimentais";
import { soDigitos } from "@/lib/whatsapp/telefone";
import { ehDataISO, ehHora, ehModalidade, mensagemAulaExperimental } from "@/lib/aula-experimental";

export const dynamic = "force-dynamic";

/**
 * PATCH — corrige uma aula experimental já marcada: nome, celular, modalidade,
 * dia e horário. Nada é enviado daqui; se o dia ou a hora mudou, a resposta traz
 * o texto da confirmação corrigida para a recepção mandar pelo WhatsApp, e o
 * lembrete da véspera volta a valer para o horário novo.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    nome?: unknown;
    telefone?: unknown;
    modalidade?: unknown;
    data?: unknown;
    hora?: unknown;
  };
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const telefone = soDigitos(typeof body.telefone === "string" ? body.telefone : "");
  const hora = typeof body.hora === "string" ? Number(body.hora) : body.hora;
  const { modalidade, data } = body;

  if (!nome) return NextResponse.json({ erro: "Informe o nome da pessoa." }, { status: 400 });
  if (telefone.length < 10 || telefone.length > 13) {
    return NextResponse.json({ erro: "Telefone com DDD, só números (10 ou 11 dígitos)." }, { status: 400 });
  }
  if (typeof modalidade !== "string" || !modalidade) {
    return NextResponse.json({ erro: "Escolha uma modalidade da lista." }, { status: 400 });
  }
  if (!ehDataISO(data)) return NextResponse.json({ erro: "Data inválida." }, { status: 400 });
  if (!ehHora(hora)) return NextResponse.json({ erro: "Horário inválido." }, { status: 400 });

  // Modalidade fora da lista só se já era a da aula (dado antigo): não se escolhe uma nova inventada.
  if (!ehModalidade(modalidade)) {
    const atual = await prisma.aulaExperimental.findUnique({ where: { id }, select: { modalidade: true } });
    if (!atual) return NextResponse.json({ erro: "aula não encontrada" }, { status: 404 });
    if (atual.modalidade !== modalidade) {
      return NextResponse.json({ erro: "Escolha uma modalidade da lista." }, { status: 400 });
    }
  }

  const r = await editarAulaRepo(id, { nome, telefone, modalidade, data, hora });
  if (!r) return NextResponse.json({ erro: "aula não encontrada" }, { status: 404 });

  const mensagem = mensagemAulaExperimental({ modalidade, data, hora });
  const fone = telefone.length <= 11 ? `55${telefone}` : telefone;
  return NextResponse.json({
    aula: r.aula,
    mudouHorario: r.mudouHorario,
    mensagem,
    waLink: `https://wa.me/${fone}?text=${encodeURIComponent(mensagem)}`,
  });
}
