import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  criarAulaExperimentalRepo,
  guardarCpfNaPessoaRepo,
  pessoaPorCpfRepo,
} from "@/lib/repositories/aulas-experimentais";
import { conferirAulaNova } from "@/lib/aula-experimental-regra";
import {
  mensagemPorWaIdRepo,
  obterConversaRepo,
  paginaMensagensRepo,
} from "@/lib/repositories/whatsapp";
import { ehFalhaEnvio, enviarTextoNaConversa } from "@/lib/whatsapp/responder";
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
 * Não é resposta automática: a recepção revisa pessoa, modalidade, dia e hora e
 * clica em "Confirmar e enviar no WhatsApp"; a mensagem que sai é a mesma que
 * ela mandaria à mão. Automático aqui é só não ter que digitar a data de novo.
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
    cpf?: unknown;
    forcar?: unknown;
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

  // Uma aula por pessoa: confere ANTES de mandar a confirmação.
  const conf = await conferirAulaNova({
    cpf: body.cpf,
    telefone: soDigitos(conversa.telefone),
    nome: conversa.nome,
    forcar: body.forcar,
    papel: g.user.role,
  });
  if (!conf.ok) return NextResponse.json({ erro: conf.erro }, { status: conf.status });
  const porCpf = await pessoaPorCpfRepo(conf.cpf);
  const personId = conversa.personId ?? porCpf?.id ?? null;

  const envio = await enviarTextoNaConversa({
    conversaId: id,
    texto: mensagemAulaExperimental({ modalidade, data, hora }),
    userId: g.user.id,
  });
  if (ehFalhaEnvio(envio)) {
    // Envio falhou: nada entra na agenda. A bolha de erro (quando gravada) vai
    // junto, para a conversa mostrar o que não saiu.
    const mensagem = envio.waMessageId ? await mensagemPorWaIdRepo(id, envio.waMessageId) : null;
    return NextResponse.json({ erro: envio.erro, mensagem }, { status: envio.status });
  }

  // A mensagem já saiu. Se a gravação falhar daqui em diante, a resposta diz
  // isso com todas as letras — reenviar mandaria a confirmação duas vezes.
  let aula;
  try {
    aula = await criarAulaExperimentalRepo({
      conversaId: id,
      personId,
      nome: conversa.nome,
      telefone: soDigitos(conversa.telefone),
      modalidade,
      data,
      hora,
      agendadoPorId: g.user.id,
      cpf: conf.cpf,
    });
    if (personId) await guardarCpfNaPessoaRepo(personId, conf.cpf).catch(() => undefined);
  } catch (e) {
    console.error("[aula-experimental] confirmação enviada, gravação falhou", e);
    const mensagem = await mensagemPorWaIdRepo(id, envio.waMessageId).catch(() => null);
    return NextResponse.json(
      {
        erro:
          "A confirmação foi enviada no WhatsApp, mas a aula não entrou na agenda. Não envie de novo — avise o administrador.",
        enviada: true,
        mensagem,
      },
      { status: 500 },
    );
  }

  const [mensagem, pagina] = await Promise.all([
    mensagemPorWaIdRepo(id, envio.waMessageId),
    paginaMensagensRepo(id),
  ]);
  return NextResponse.json({ aula, mensagem, mensagens: pagina.mensagens });
}
