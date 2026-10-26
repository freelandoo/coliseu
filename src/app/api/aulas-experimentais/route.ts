import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import {
  acharPorTelefoneRepo,
  aulasAnterioresRepo,
  criarAulaExperimentalRepo,
  guardarCpfNaPessoaRepo,
  jaFez,
  pessoaPorCpfRepo,
} from "@/lib/repositories/aulas-experimentais";
import { criarPessoaRepo } from "@/lib/repositories/pessoas";
import { formatarTelefone, soDigitos } from "@/lib/whatsapp/telefone";
import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { conferirAulaNova, descreverAnterior } from "@/lib/aula-experimental-regra";
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
 * GET ?cpf=&telefone=&nome= — antes de gravar, a tela mostra quem é a pessoa
 * (cadastro e conversa) e se ela já fez aula experimental.
 */
export async function GET(req: Request) {
  const g = await exigirModuloApi("aula-experimental", "atendimento");
  if (g.erro) return g.erro;
  const u = new URL(req.url).searchParams;
  const cpf = normalizarCpf(u.get("cpf"));
  const telefone = soDigitos(u.get("telefone"));
  const nome = u.get("nome") ?? "";

  const [porCpf, porTelefone, anteriores] = await Promise.all([
    cpfValido(cpf) ? pessoaPorCpfRepo(cpf) : Promise.resolve(null),
    telefone.length >= 10 ? acharPorTelefoneRepo(telefone) : Promise.resolve(null),
    aulasAnterioresRepo({ cpf: cpfValido(cpf) ? cpf : null, telefone, nome }, hojeNaAcademia()),
  ]);
  const fez = jaFez(anteriores);
  return NextResponse.json({
    pessoa: porCpf
      ? { personId: porCpf.id, nome: porCpf.nome, fase: porCpf.fase, porque: "cpf" }
      : porTelefone?.personId
        ? { personId: porTelefone.personId, nome: porTelefone.nome, fase: porTelefone.fase, porque: "telefone" }
        : null,
    conversaId: porTelefone?.conversaId ?? null,
    jaFez: fez ? descreverAnterior(fez) : null,
    anteriores: anteriores.map((a) => ({ ...a, texto: descreverAnterior(a) })),
  });
}

/**
 * POST — aula marcada no balcão, pela tela de Aula experimental (o outro
 * caminho é a conversa do Atendimento, que já envia a confirmação).
 *
 * CPF obrigatório e uma aula por pessoa (ver `conferirAulaNova`). Daqui nada é
 * enviado: a aula entra na agenda e a resposta traz o texto da confirmação para
 * a recepção mandar pelo WhatsApp dela; o lembrete da véspera sai sozinho.
 * Liga a aula ao cadastro com o mesmo CPF — ou, sem ele, ao do mesmo telefone
 * — e à conversa desse número. Pessoa nova vira lead (origem balcão).
 */
export async function POST(req: Request) {
  const g = await exigirModuloApi("aula-experimental");
  if (g.erro || !g.user) return g.erro;

  const body = (await req.json().catch(() => ({}))) as {
    nome?: unknown;
    cpf?: unknown;
    telefone?: unknown;
    modalidade?: unknown;
    data?: unknown;
    hora?: unknown;
    observacao?: unknown;
    forcar?: unknown;
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

  const conf = await conferirAulaNova({ cpf: body.cpf, telefone, nome, forcar: body.forcar, papel: g.user.role });
  if (!conf.ok) return NextResponse.json({ erro: conf.erro }, { status: conf.status });
  const cpf = conf.cpf;

  const [porCpf, porTelefone] = await Promise.all([pessoaPorCpfRepo(cpf), acharPorTelefoneRepo(telefone)]);
  let personId = porCpf?.id ?? porTelefone.personId;
  let leadCriado = false;
  if (!personId) {
    const p = await criarPessoaRepo({
      nome,
      telefone: formatarTelefone(telefone),
      cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`,
      origem: "balcao",
      vendedor: g.user.nome,
    });
    // Marcou aula: já passou do "novo" no funil.
    await prisma.person.update({ where: { id: p.id }, data: { estagio: "interesse" } });
    personId = p.id;
    leadCriado = true;
  } else {
    await guardarCpfNaPessoaRepo(personId, cpf);
  }

  const aula = await criarAulaExperimentalRepo({
    conversaId: porTelefone.conversaId,
    personId,
    nome,
    telefone,
    modalidade,
    data,
    hora,
    agendadoPorId: g.user.id,
    observacao: obs.valor,
    cpf,
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
