import { NextResponse } from "next/server";
import { pessoaComCpfRepo } from "@/lib/repositories/pessoas";
import { criarPessoa, listarPessoas } from "@/lib/store";
import type { NovaPessoa } from "@/lib/types";
import { exigirModuloApi } from "@/lib/auth/api-guard";

export async function GET() {
  const g = await exigirModuloApi("matriculados", "captacao");
  if (g.erro) return g.erro;
  return NextResponse.json(await listarPessoas());
}

export async function POST(req: Request) {
  const g = await exigirModuloApi("matriculados", "captacao");
  if (g.erro) return g.erro;
  const body = (await req.json()) as Partial<NovaPessoa>;

  if (!body?.nome?.trim()) {
    return NextResponse.json({ erro: "Nome é obrigatório" }, { status: 400 });
  }
  if (!body.origem) {
    return NextResponse.json({ erro: "Origem é obrigatória" }, { status: 400 });
  }
  if (!body.telefone?.trim() && !body.email?.trim()) {
    return NextResponse.json(
      { erro: "Informe ao menos telefone ou e-mail" },
      { status: 400 },
    );
  }

  // CPF já cadastrado (lead antigo, ex-aluno, importado do CloudGym): não
  // duplica — a tela mostra quem é para continuar daquele cadastro.
  if (body.cpf?.trim()) {
    const ja = await pessoaComCpfRepo(body.cpf);
    if (ja) {
      return NextResponse.json(
        {
          erro: `Já existe cadastro com este CPF: ${ja.codigo} · ${ja.nome}. Abra esse cadastro em vez de criar outro.`,
          existente: { id: ja.id, codigo: ja.codigo, nome: ja.nome, fase: ja.fase },
        },
        { status: 409 },
      );
    }
  }

  // Vendedor é quem está logado fazendo o cadastro — não um campo livre do
  // formulário (a ficha ainda permite corrigir depois).
  const pessoa = await criarPessoa({ ...(body as NovaPessoa), vendedor: g.user?.nome });
  return NextResponse.json(pessoa, { status: 201 });
}
