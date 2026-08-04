import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { criarAulaExperimentalRepo } from "@/lib/repositories/aulas-experimentais";
import { listarMensagensRepo, obterConversaRepo } from "@/lib/repositories/whatsapp";
import { enviarTextoNaConversa } from "@/lib/whatsapp/responder";
import { soDigitos } from "@/lib/whatsapp/telefone";
import {
  ehDataISO,
  ehHora,
  ehModalidade,
  mensagemAulaExperimental,
} from "@/lib/aula-experimental";

export const dynamic = "force-dynamic";

async function guarda() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { user: null, erro: g.erro };
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return { user: null, erro: NextResponse.json({ erro: "sem permissão" }, { status: 403 }) };
  }
  return { user: g.user, erro: null };
}

/**
 * POST — marca a aula experimental e manda a confirmação na conversa.
 *
 * Não é resposta automática: quem clica no horário é a recepção, e a mensagem
 * que sai é a mesma que ela mandaria à mão. Automático aqui é só não ter que
 * digitar a data de novo.
 *
 * A ordem importa: envia primeiro, grava depois. Aula na lista que a pessoa
 * nunca foi avisada é pior do que envio que deu certo e não entrou na lista —
 * o primeiro faz a recepção esperar alguém que não sabe que tem aula.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro || !g.user) return g.erro;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    modalidade?: unknown;
    data?: unknown;
    hora?: unknown;
  };

  const { modalidade, data } = body;
  const hora = typeof body.hora === "string" ? Number(body.hora) : body.hora;

  if (!ehModalidade(modalidade)) {
    return NextResponse.json({ erro: "Escolha uma modalidade da lista." }, { status: 400 });
  }
  if (!ehDataISO(data)) {
    return NextResponse.json({ erro: "Data inválida." }, { status: 400 });
  }
  if (!ehHora(hora)) {
    return NextResponse.json({ erro: "Horário inválido." }, { status: 400 });
  }

  const conversa = await obterConversaRepo(id);
  if (!conversa) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  if (conversa.ehGrupo) {
    return NextResponse.json(
      { erro: "Aula experimental é de uma pessoa — marque na conversa dela, não no grupo." },
      { status: 409 },
    );
  }

  const falha = await enviarTextoNaConversa({
    conversaId: id,
    texto: mensagemAulaExperimental({ modalidade, data, hora }),
    userId: g.user.id,
  });
  if (falha) return NextResponse.json({ erro: falha.erro }, { status: falha.status });

  const aula = await criarAulaExperimentalRepo({
    conversaId: id,
    personId: conversa.personId,
    nome: conversa.nome,
    telefone: soDigitos(conversa.telefone),
    modalidade,
    data,
    hora,
    agendadoPorId: g.user.id,
  });

  return NextResponse.json({ aula, mensagens: await listarMensagensRepo(id) });
}
