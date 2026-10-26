import { prisma } from "@/lib/db";
import { MODELO_CONTRATO } from "@/lib/contrato/modelo-padrao";
import { idade, limparHtmlContrato, preencherContrato, type DadosContrato } from "@/lib/contrato/preencher";
import { mesesDoPlano, valorTotalDoPlano } from "@/lib/billing/parcelamento";
import { nomeDaForma } from "@/lib/billing/aplicar";

/**
 * O contrato da matrícula mais recente do aluno: a versão que a recepção
 * editou, se houver; senão o modelo preenchido agora com os dados atuais.
 */
export interface ContratoDoAluno {
  personId: string;
  membershipId: string;
  nome: string;
  codigo: string;
  html: string;
  editado: { por: string | null; em: string } | null;
}

const LINHA = "____________________";

async function dadosDoContrato(personId: string): Promise<{ membershipId: string; dados: DadosContrato; nome: string; codigo: string } | null> {
  const p = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      memberships: { orderBy: { matriculadoEm: "desc" }, take: 1, include: { plan: true } },
      billingCustomer: { include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  const m = p?.memberships[0];
  if (!p || !m) return null;

  const meses = mesesDoPlano(m.plan.duracaoDias);
  const gratuito = !(m.plan.valorMensal > 0);
  const sub = p.billingCustomer?.subscriptions[0] ?? null;
  // Assinatura/parcelamento desta matrícula (criado com ela); de antes, não vale.
  const daMatricula = sub && sub.createdAt.getTime() >= m.matriculadoEm.getTime() - 5 * 60_000 ? sub : null;

  let parcelas = gratuito ? 0 : meses;
  let valorParcela = gratuito ? 0 : m.plan.valorMensal;
  let forma = gratuito ? "Plano gratuito (sem cobrança)" : LINHA;
  if (daMatricula?.cycle === "INSTALLMENT") {
    const pgs = await prisma.payment.findMany({ where: { subscriptionId: daMatricula.id }, select: { descricao: true } });
    const n = pgs.map((x) => Number(x.descricao?.match(/Parcela \d+ de (\d+)/)?.[1] ?? 0)).find((x) => x > 0);
    parcelas = n ?? meses;
    valorParcela = daMatricula.value;
    forma = "Boleto parcelado";
  } else if (daMatricula) {
    forma = "Assinatura mensal (PIX, boleto ou cartão)";
  }
  if (daMatricula && !gratuito) {
    const primeiro = await prisma.payment.findFirst({
      where: { subscriptionId: daMatricula.id, status: "PAID" },
      orderBy: { paidAt: "asc" },
      select: { billingType: true },
    });
    const como = nomeDaForma(primeiro?.billingType);
    if (como) forma += ` · 1º pagamento: ${como}`;
  }

  const endereco = [
    [p.rua, p.numero].filter(Boolean).join(", "),
    p.cidade,
    p.estado,
    p.cep && `CEP ${p.cep}`,
  ]
    .filter(Boolean)
    .join(" - ");
  const hoje = new Date();
  const anos = idade(p.dataNascimento, hoje);
  return {
    membershipId: m.id,
    nome: p.nome,
    codigo: p.codigo,
    dados: {
      nome: p.nome,
      rg: p.rg,
      cpf: p.cpf,
      endereco: endereco || null,
      inicio: m.matriculadoEm,
      fim: m.vencimentoPlano,
      plano: m.plan.nome.trim(),
      meses,
      valorTotal: gratuito ? 0 : valorTotalDoPlano(m.plan),
      parcelas,
      valorParcela,
      formaPagamento: forma,
      hoje,
      menor: anos !== null && anos < 18,
    },
  };
}

export async function contratoDoAluno(personId: string): Promise<ContratoDoAluno | null> {
  const d = await dadosDoContrato(personId);
  if (!d) return null;
  const salvo = await prisma.contratoAluno.findUnique({ where: { membershipId: d.membershipId } });
  return {
    personId,
    membershipId: d.membershipId,
    nome: d.nome,
    codigo: d.codigo,
    html: salvo?.html ?? preencherContrato(MODELO_CONTRATO, d.dados),
    editado: salvo ? { por: salvo.editadoPor, em: salvo.editadoEm.toISOString() } : null,
  };
}

/** O contrato preenchido do zero (para "voltar ao texto padrão"). */
export async function contratoPadraoDoAluno(personId: string): Promise<string | null> {
  const d = await dadosDoContrato(personId);
  return d ? preencherContrato(MODELO_CONTRATO, d.dados) : null;
}

/** Guarda a versão editada da matrícula atual. `null` se o aluno não tem matrícula. */
export async function salvarContratoEditado(personId: string, html: string, por: string | null): Promise<boolean> {
  const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" }, select: { id: true } });
  if (!m) return false;
  const limpo = limparHtmlContrato(html);
  await prisma.contratoAluno.upsert({
    where: { membershipId: m.id },
    create: { membershipId: m.id, html: limpo, editadoPor: por },
    update: { html: limpo, editadoPor: por },
  });
  return true;
}

/** Apaga a edição: o contrato volta a ser o modelo preenchido. */
export async function descartarContratoEditado(personId: string): Promise<void> {
  const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" }, select: { id: true } });
  if (m) await prisma.contratoAluno.deleteMany({ where: { membershipId: m.id } });
}
