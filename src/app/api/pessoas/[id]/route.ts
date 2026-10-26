import { NextResponse } from "next/server";
import {
  atualizarPessoa,
  matricularPessoa,
  obterPessoa,
  planoPorId,
  removerPessoa,
} from "@/lib/store";
import { AsaasError, linkPagamentoWhatsApp, linkParcelamentoWhatsApp, matricularNoAsaas } from "@/lib/asaas";
import { ehPlanoGratuito, lerFormaCobranca, valorTotalDoPlano } from "@/lib/billing/parcelamento";
import { cancelarAssinaturasAnteriores } from "@/lib/billing/cobrancas";
import { prisma } from "@/lib/db";
import { pessoaComCpfRepo } from "@/lib/repositories/pessoas";
import type { Pessoa } from "@/lib/types";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { avaliarContaFreelandooSemFalhar } from "@/lib/freelandoo/gatilhos";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados", "captacao");
  if (g.erro) return g.erro;
  const { id } = await params;
  const pessoa = await obterPessoa(id);
  if (!pessoa) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  return NextResponse.json(pessoa);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados", "captacao");
  if (g.erro) return g.erro;
  const { id } = await params;
  const body = (await req.json()) as {
    acao?: "matricular";
    planoId?: string;
    /** Assinatura mensal (padrão) ou boleto parcelado. */
    formaCobranca?: unknown;
  } & Partial<Pessoa>;

  // CPF de outro cadastro: não grava (seria o mesmo aluno em duas fichas).
  if (body.cpf?.trim()) {
    const ja = await pessoaComCpfRepo(body.cpf, id);
    if (ja) {
      return NextResponse.json(
        { erro: `Este CPF já é do cadastro ${ja.codigo} · ${ja.nome}.`, existente: { id: ja.id, codigo: ja.codigo } },
        { status: 409 },
      );
    }
  }

  // Ação especial: matricular (lead → aluno) + assinatura no Asaas
  if (body.acao === "matricular") {
    const { acao, planoId, formaCobranca, ...campos } = body;
    void acao;
    if (!planoId) {
      return NextResponse.json({ erro: "planoId é obrigatório" }, { status: 400 });
    }
    // Forma inválida não grava nada — nem os campos do cadastro.
    const planoPedido = await planoPorId(planoId);
    if (!planoPedido) {
      return NextResponse.json({ erro: "Pessoa ou plano não encontrado" }, { status: 404 });
    }
    const forma = lerFormaCobranca(formaCobranca, planoPedido);
    if (!forma.ok) return NextResponse.json({ erro: forma.erro }, { status: 400 });
    // aplica campos de cadastro preenchidos no fluxo antes de matricular
    if (Object.keys(campos).length > 0) await atualizarPessoa(id, campos);
    // Lead que chegou sozinho (WhatsApp) não tem quem cadastrou: o vendedor
    // passa a ser quem fecha a matrícula. Vendedor já registrado é mantido.
    if (g.user?.nome) {
      await prisma.person.updateMany({
        where: { id, OR: [{ vendedor: null }, { vendedor: "" }] },
        data: { vendedor: g.user.nome },
      });
    }

    const pessoaAtual = await obterPessoa(id);
    const plano = await planoPorId(planoId);
    if (!pessoaAtual || !plano) {
      return NextResponse.json(
        { erro: "Pessoa ou plano não encontrado" },
        { status: 404 },
      );
    }

    // Renovação reaproveita o cliente do Asaas (não duplica cadastro lá).
    const clienteAtual = await prisma.billingCustomer.findUnique({
      where: { personId: pessoaAtual.id },
      select: { asaasCustomerId: true },
    });

    // Plano gratuito: nada a cobrar — matrícula ativa, sem Asaas.
    if (ehPlanoGratuito(plano)) {
      const pessoa = await matricularPessoa(id, planoId, undefined, g.user?.id);
      if (!pessoa) return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
      await avaliarContaFreelandooSemFalhar(id);
      try {
        await cancelarAssinaturasAnteriores(id);
      } catch (e) {
        console.error("[asaas] falha ao cancelar assinatura anterior:", e);
      }
      return NextResponse.json({ ...pessoa, gratuito: true });
    }

    let asaas;
    try {
      asaas = await matricularNoAsaas({
        id: pessoaAtual.id,
        codigo: pessoaAtual.codigo,
        nome: pessoaAtual.nome,
        telefone: pessoaAtual.telefone,
        email: pessoaAtual.email,
        cpf: pessoaAtual.cpf,
        planoNome: plano.nome,
        valorMensal: plano.valorMensal,
        personId: pessoaAtual.id,
        customerId: clienteAtual?.asaasCustomerId,
        parcelamento:
          forma.forma.tipo === "boleto_parcelado"
            ? { parcelas: forma.forma.parcelas, valorTotal: valorTotalDoPlano(plano) }
            : undefined,
      });
    } catch (e) {
      console.error("[asaas] falha ao matricular:", e);
      return NextResponse.json(
        { erro: e instanceof AsaasError ? e.message : "Falha ao criar assinatura no Asaas" },
        { status: 502 },
      );
    }

    const pessoa = await matricularPessoa(id, planoId, asaas, g.user?.id);
    if (!pessoa) {
      return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
    }

    // Aluno novo ganha a conta na Freelandoo na matrícula (Q2). Só enfileira:
    // a matrícula não espera a Freelandoo e não falha por causa dela.
    await avaliarContaFreelandooSemFalhar(id);

    // A assinatura nova já existe: as anteriores param de cobrar (senão o
    // aluno pagaria duas mensalidades). Falha aqui não desfaz a matrícula.
    try {
      await cancelarAssinaturasAnteriores(id, asaas.assinaturaId);
    } catch (e) {
      console.error("[asaas] falha ao cancelar assinatura anterior:", e);
    }

    const parcelas = forma.forma.tipo === "boleto_parcelado" ? forma.forma.parcelas : null;
    const waLink = !pessoaAtual.telefone
      ? undefined
      : parcelas
        ? linkParcelamentoWhatsApp(pessoaAtual.telefone, pessoaAtual.nome, asaas.linkPagamento, parcelas)
        : linkPagamentoWhatsApp(pessoaAtual.telefone, pessoaAtual.nome, asaas.linkPagamento);

    return NextResponse.json({
      ...pessoa,
      linkPagamento: asaas.linkPagamento,
      waLink,
      ...(parcelas && { parcelas, valorParcela: asaas.valorCobranca }),
    });
  }

  // Atualização normal da ficha
  const pessoa = await atualizarPessoa(id, body);
  if (!pessoa) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  return NextResponse.json(pessoa);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados", "captacao");
  if (g.erro) return g.erro;
  const { id } = await params;
  const ok = await removerPessoa(id);
  if (!ok) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
