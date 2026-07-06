import { NextResponse } from "next/server";
import {
  atualizarPessoa,
  matricularPessoa,
  obterPessoa,
  planoPorId,
  removerPessoa,
} from "@/lib/store";
import { linkPagamentoWhatsApp, matricularNoAsaas } from "@/lib/asaas";
import type { Pessoa } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const pessoa = obterPessoa(id);
  if (!pessoa) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  return NextResponse.json(pessoa);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as {
    acao?: "matricular";
    planoId?: string;
  } & Partial<Pessoa>;

  // Ação especial: matricular (lead → aluno) + assinatura no Asaas
  if (body.acao === "matricular") {
    const { acao, planoId, ...campos } = body;
    void acao;
    if (!planoId) {
      return NextResponse.json({ erro: "planoId é obrigatório" }, { status: 400 });
    }
    // aplica campos de cadastro preenchidos no fluxo antes de matricular
    if (Object.keys(campos).length > 0) atualizarPessoa(id, campos);

    const pessoaAtual = obterPessoa(id);
    const plano = planoPorId(planoId);
    if (!pessoaAtual || !plano) {
      return NextResponse.json(
        { erro: "Pessoa ou plano não encontrado" },
        { status: 404 },
      );
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
      });
    } catch (e) {
      console.error("[asaas] falha ao matricular:", e);
      return NextResponse.json(
        { erro: "Falha ao criar assinatura no Asaas" },
        { status: 502 },
      );
    }

    const pessoa = matricularPessoa(id, planoId, asaas);
    if (!pessoa) {
      return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
    }

    const waLink = pessoaAtual.telefone
      ? linkPagamentoWhatsApp(
          pessoaAtual.telefone,
          pessoaAtual.nome,
          asaas.linkPagamento,
        )
      : undefined;

    return NextResponse.json({
      ...pessoa,
      linkPagamento: asaas.linkPagamento,
      waLink,
    });
  }

  // Atualização normal da ficha
  const pessoa = atualizarPessoa(id, body);
  if (!pessoa) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  return NextResponse.json(pessoa);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ok = removerPessoa(id);
  if (!ok) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
