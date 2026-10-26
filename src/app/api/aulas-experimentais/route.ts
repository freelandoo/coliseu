import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { acharPorTelefoneRepo, criarAulaExperimentalRepo } from "@/lib/repositories/aulas-experimentais";
import { criarPessoaRepo } from "@/lib/repositories/pessoas";
import { formatarTelefone, soDigitos } from "@/lib/whatsapp/telefone";
import {
  ehDataISO,
  ehHora,
  ehModalidade,
  hojeNaAcademia,
  mensagemAulaExperimental,
  normalizarObservacao,
} from "@/lib/aula-experimental";

export const dynamic = "force-dynamic";

/**
 * GET ?telefone= — quem já existe com esse número (para o balcão ver antes de
 * gravar que a aula vai ficar ligada a um cadastro e a uma conversa).
 */
export async function GET(req: Request) {
  const g = await exigirModuloApi("aula-experimental");
  if (g.erro) return g.erro;
  const telefone = soDigitos(new URL(req.url).searchParams.get("telefone"));
  if (telefone.length < 10) return NextResponse.json({ personId: null, nome: null, fase: null, conversaId: null });
  return NextResponse.json(await acharPorTelefoneRepo(telefone));
}

/**
 * POST — aula marcada no balcão, pela tela de Aula experimental (o outro
 * caminho é a conversa do Atendimento, que já envia a confirmação).
 *
 * Daqui nada é enviado: a aula entra na agenda e a resposta traz o texto da
 * confirmação para a recepção mandar pelo WhatsApp dela. Mesmo telefone de
 * cadastro ou conversa existente: a aula fica ligada a eles. Pessoa nova vira
 * lead (origem balcão), como no cadastro.
 */
export async function POST(req: Request) {
  const g = await exigirModuloApi("aula-experimental");
  if (g.erro || !g.user) return g.erro;

  const body = (await req.json().catch(() => ({}))) as {
    nome?: unknown;
    telefone?: unknown;
    modalidade?: unknown;
    data?: unknown;
    hora?: unknown;
    observacao?: unknown;
  };
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const telefone = soDigitos(typeof body.telefone === "string" ? body.telefone : "");
  const hora = typeof body.hora === "string" ? Number(body.hora) : body.hora;
  const { modalidade, data } = body;
  const obs = normalizarObservacao(body.observacao);

  if (!nome) return NextResponse.json({ erro: "Informe o nome da pessoa." }, { status: 400 });
  if (telefone.length < 10 || telefone.length > 13) {
    return NextResponse.json({ erro: "Telefone com DDD, só números (10 ou 11 dígitos)." }, { status: 400 });
  }
  if (!ehModalidade(modalidade)) return NextResponse.json({ erro: "Escolha uma modalidade da lista." }, { status: 400 });
  if (!ehDataISO(data)) return NextResponse.json({ erro: "Data inválida." }, { status: 400 });
  if (data < hojeNaAcademia()) return NextResponse.json({ erro: "A data já passou." }, { status: 400 });
  if (!ehHora(hora)) return NextResponse.json({ erro: "Horário inválido." }, { status: 400 });
  if (!obs.ok) return NextResponse.json({ erro: "Observação longa demais." }, { status: 400 });

  const achado = await acharPorTelefoneRepo(telefone);
  let personId = achado.personId;
  let leadCriado = false;
  if (!personId) {
    const p = await criarPessoaRepo({ nome, telefone: formatarTelefone(telefone), origem: "balcao", vendedor: g.user.nome });
    // Marcou aula: já passou do "novo" no funil.
    await prisma.person.update({ where: { id: p.id }, data: { estagio: "interesse" } });
    personId = p.id;
    leadCriado = true;
  }

  const aula = await criarAulaExperimentalRepo({
    conversaId: achado.conversaId,
    personId,
    nome: achado.nome ?? nome,
    telefone,
    modalidade,
    data,
    hora,
    agendadoPorId: g.user.id,
    observacao: obs.valor,
  });

  const mensagem = mensagemAulaExperimental({ modalidade, data, hora });
  const fone = telefone.length <= 11 ? `55${telefone}` : telefone;
  return NextResponse.json(
    {
      aula,
      leadCriado,
      mensagem,
      waLink: `https://wa.me/${fone}?text=${encodeURIComponent(mensagem)}`,
    },
    { status: 201 },
  );
}
