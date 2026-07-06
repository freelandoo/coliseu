// ============================================================
// Store em memória — fonte única da verdade (Pessoa).
// Seedado dos mocks. Em PRODUÇÃO, troque este módulo por acesso a
// banco de dados: a API (/api/pessoas) e as telas não precisam mudar.
// ⚠️ O estado zera quando o servidor/container reinicia.
// ============================================================

import {
  alunos as seedAlunos,
  cobrancas as seedCobrancas,
  diasEntre,
  leads as seedLeads,
  planosSeed,
} from "./mock-data";
import type { AsaasMatricula } from "./asaas";
import {
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type Aluno,
  type Candidato,
  type Cobranca,
  type Despesa,
  type Lead,
  type LeadEstagio,
  type NovaDespesa,
  type NovaPessoa,
  type NovoPlano,
  type Pessoa,
  type Plano,
} from "./types";

/* ---------- seed: converte leads + alunos em Pessoa ---------- */
function seed(): Pessoa[] {
  const pessoas: Pessoa[] = [];

  // Alunos → pessoa fase "aluno"
  for (const a of seedAlunos) {
    const leadMatch = seedLeads.find((l) => l.nome === a.nome);
    pessoas.push({
      id: a.id,
      codigo: a.codigo,
      nome: a.nome,
      telefone: a.telefone,
      email: a.email,
      cpf: a.cpf,
      origem: leadMatch?.origem ?? "balcao",
      fase: "aluno",
      criadoEm: a.matriculadoEm,
      status: a.status,
      planoId: a.planoId,
      matriculadoEm: a.matriculadoEm,
      vencimentoPlano: a.vencimentoPlano,
      ultimaPresenca: a.ultimaPresenca,
      dataNascimento: a.dataNascimento,
      endereco:
        a.cep || a.cidade
          ? { cep: a.cep, estado: a.estado, cidade: a.cidade, rua: a.rua, numero: a.numero }
          : undefined,
    });
  }

  // Leads não convertidos → pessoa fase "lead" (convertidos já viraram aluno acima)
  let seq = seedAlunos.length;
  for (const l of seedLeads) {
    if (l.estagio === "convertido") continue;
    if (pessoas.some((p) => p.nome === l.nome)) continue;
    seq += 1;
    pessoas.push({
      id: l.id,
      codigo: `CD${String(seq).padStart(5, "0")}`,
      nome: l.nome,
      telefone: l.telefone,
      origem: l.origem,
      fase: "lead",
      criadoEm: l.criadoEm,
      estagio: l.estagio,
      motivoPerdido: l.motivoPerdido,
    });
  }

  return pessoas;
}

// Guarda o estado no globalThis para SOBREVIVER ao hot reload do dev
// (sem isso, cada recompilação re-executaria o seed e apagaria os cadastros).
// Só um restart real do processo/container zera.
type StoreDB = {
  pessoas: Pessoa[];
  cobrancas: Cobranca[];
  despesas: Despesa[];
  planos: Plano[];
};
const g = globalThis as unknown as { __coliseuDB?: StoreDB };
g.__coliseuDB ??= {
  pessoas: seed(),
  cobrancas: [...seedCobrancas],
  planos: planosSeed.map((p) => ({ ...p })),
  despesas: [
    { id: "d-01", categoria: "Luz", valor: 320, data: "2026-07-05" },
    { id: "d-02", categoria: "Água", valor: 140, data: "2026-07-05" },
    { id: "d-03", categoria: "Internet", valor: 150, data: "2026-07-03", recorrente: true },
  ],
};
// Referências estáveis aos mesmos arrays do global — mutações in-place persistem.
const { pessoas, cobrancas, despesas, planos } = g.__coliseuDB;

/* ---------- leitura ---------- */
export function listarPessoas(): Pessoa[] {
  return pessoas;
}

export function obterPessoa(id: string): Pessoa | undefined {
  return pessoas.find((p) => p.id === id);
}

function proximoCodigo(): string {
  const maior = pessoas.reduce((max, p) => {
    const n = Number(p.codigo.replace(/\D/g, "")) || 0;
    return n > max ? n : max;
  }, 0);
  return `CD${String(maior + 1).padStart(5, "0")}`;
}

export function proximoCodigoCadastro(): string {
  return proximoCodigo();
}

/* ---------- planos ---------- */
export function listarPlanos(): Plano[] {
  return planos;
}

export function planoPorId(id: string): Plano | undefined {
  return planos.find((p) => p.id === id);
}

export function criarPlano(input: NovoPlano): Plano {
  const novo: Plano = {
    id: `p-${Date.now().toString(36)}`,
    nome: input.nome.trim(),
    valorMensal: input.valorMensal,
    duracaoMeses: input.duracaoMeses,
    descricao: input.descricao?.trim() || undefined,
    ativo: true,
  };
  planos.push(novo);
  return novo;
}

export function atualizarPlano(
  id: string,
  patch: Partial<Plano>,
): Plano | undefined {
  const i = planos.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  planos[i] = { ...planos[i], ...patch, id: planos[i].id };
  return planos[i];
}

/* ---------- escrita ---------- */
export function criarPessoa(input: NovaPessoa): Pessoa {
  const nova: Pessoa = {
    id: `p-${Date.now().toString(36)}`,
    codigo: proximoCodigo(),
    nome: input.nome.trim(),
    telefone: input.telefone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    cpf: input.cpf?.trim() || undefined,
    origem: input.origem,
    fase: "lead",
    estagio: "novo",
    criadoEm: new Date().toISOString(),
    dataNascimento: input.dataNascimento || undefined,
    endereco: input.endereco,
  };
  pessoas.unshift(nova);
  return nova;
}

export function atualizarPessoa(
  id: string,
  patch: Partial<Pessoa>,
): Pessoa | undefined {
  const i = pessoas.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  pessoas[i] = { ...pessoas[i], ...patch, id: pessoas[i].id };
  return pessoas[i];
}

export function removerPessoa(id: string): boolean {
  const i = pessoas.findIndex((p) => p.id === id);
  if (i < 0) return false;
  pessoas.splice(i, 1);
  // remove cobranças ligadas a essa pessoa
  for (let j = cobrancas.length - 1; j >= 0; j--) {
    if (cobrancas[j].alunoId === id) cobrancas.splice(j, 1);
  }
  return true;
}

/** Transição lead → aluno: gera cobrança pendente e mantém o código da pessoa. */
export function matricularPessoa(
  id: string,
  planoId: string,
  asaas?: AsaasMatricula,
): Pessoa | undefined {
  const p = obterPessoa(id);
  if (!p) return undefined;

  const plano = planoPorId(planoId);
  const agora = new Date();
  const venc = new Date(agora);
  venc.setMonth(venc.getMonth() + (plano?.duracaoMeses ?? 1));

  const atualizado = atualizarPessoa(id, {
    fase: "aluno",
    status: "pendente",
    planoId,
    matriculadoEm: agora.toISOString(),
    vencimentoPlano: venc.toISOString(),
    ultimaPresenca: agora.toISOString(),
    estagio: undefined,
  });

  const asaasId = asaas?.cobrancaId ?? `pay_mock_${p.codigo.toLowerCase()}`;
  cobrancas.unshift({
    id: `c-${Date.now().toString(36)}`,
    alunoId: id,
    tipo: "matricula",
    valor: plano?.valorMensal ?? 0,
    vencimento: venc.toISOString(),
    status: "pendente",
    asaasId,
    assinaturaId: asaas?.assinaturaId,
    linkPagamento: asaas?.linkPagamento ?? `https://asaas.com/c/${asaasId}`,
  });

  return atualizado;
}

/* ---------- despesas / custos ---------- */
export function listarDespesas(): Despesa[] {
  return [...despesas].sort((a, b) => +new Date(b.data) - +new Date(a.data));
}

export function criarDespesa(input: NovaDespesa): Despesa {
  const nova: Despesa = {
    id: `d-${Date.now().toString(36)}`,
    categoria: input.categoria.trim(),
    descricao: input.descricao?.trim() || undefined,
    valor: input.valor,
    data: input.data || new Date().toISOString(),
    recorrente: input.recorrente ?? false,
  };
  despesas.unshift(nova);
  return nova;
}

export function removerDespesa(id: string): boolean {
  const i = despesas.findIndex((d) => d.id === id);
  if (i < 0) return false;
  despesas.splice(i, 1);
  return true;
}

export function totalDespesas(): number {
  return despesas.reduce((s, d) => s + d.valor, 0);
}

/** Receita recorrente mensal (MRR) — soma dos planos da base não cancelada. */
export function receitaRecorrente(): number {
  return pessoas
    .filter((p) => p.fase === "aluno" && p.status !== "cancelado")
    .reduce((s, p) => s + (p.planoId ? planoPorId(p.planoId)?.valorMensal ?? 0 : 0), 0);
}

/* ---------- adaptadores (formato legado das telas atuais) ---------- */
export function listarLeads(): Lead[] {
  return pessoas
    .filter((p) => p.fase === "lead")
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      telefone: p.telefone ?? "",
      origem: p.origem,
      estagio: p.estagio ?? "novo",
      motivoPerdido: p.motivoPerdido,
      criadoEm: p.criadoEm,
    }));
}

export function listarAlunos(): Aluno[] {
  return pessoas
    .filter((p) => p.fase === "aluno")
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      cpf: p.cpf ?? "",
      planoId: p.planoId ?? "",
      status: p.status ?? "ativo",
      matriculadoEm: p.matriculadoEm ?? p.criadoEm,
      vencimentoPlano: p.vencimentoPlano ?? p.criadoEm,
      ultimaPresenca: p.ultimaPresenca ?? p.criadoEm,
      dataNascimento: p.dataNascimento,
      cep: p.endereco?.cep,
      estado: p.endereco?.estado,
      cidade: p.endereco?.cidade,
      rua: p.endereco?.rua,
      numero: p.endereco?.numero,
    }));
}

export function listarCobrancas(): Cobranca[] {
  return cobrancas;
}

/** Webhook Asaas: pagamento confirmado → cobrança paga + aluno ativo. */
export function marcarCobrancaPaga(asaasId: string): boolean {
  const c = cobrancas.find((c) => c.asaasId === asaasId);
  if (!c) return false;
  c.status = "pago";
  const p = pessoas.find((p) => p.id === c.alunoId);
  if (p) p.status = "ativo";
  return true;
}

/** Webhook Asaas: pagamento vencido → cobrança atrasada + aluno inadimplente. */
export function marcarCobrancaAtrasada(asaasId: string): boolean {
  const c = cobrancas.find((c) => c.asaasId === asaasId);
  if (!c) return false;
  c.status = "atrasado";
  const p = pessoas.find((p) => p.id === c.alunoId);
  if (p) p.status = "inadimplente";
  return true;
}

export function alunoPorId(id: string): Aluno | undefined {
  return listarAlunos().find((a) => a.id === id);
}

/** Candidatos à matrícula: leads em aberto + alunos que precisam renovar. */
export function candidatosMatricula(): Candidato[] {
  const doLead: Candidato[] = pessoas
    .filter(
      (p) =>
        p.fase === "lead" &&
        ["novo", "qualificado", "interesse"].includes(p.estagio ?? ""),
    )
    .map((p) => ({
      refId: p.id,
      origem: "lead",
      nome: p.nome,
      telefone: p.telefone ?? "",
      email: p.email,
      cpf: p.cpf,
      codigo: p.codigo,
      detalhe: `Lead · ${ORIGEM_LABEL[p.origem]} · ${LEAD_ESTAGIO_LABEL[(p.estagio ?? "novo") as LeadEstagio]}`,
    }));

  const doAluno: Candidato[] = pessoas
    .filter((p) => {
      if (p.fase !== "aluno") return false;
      if (p.status === "inadimplente" || p.status === "cancelado") return true;
      return p.vencimentoPlano ? diasEntre(p.vencimentoPlano) >= -15 : false;
    })
    .map((p) => {
      const dias = p.vencimentoPlano ? diasEntre(p.vencimentoPlano) : 0;
      const situacao =
        p.status === "inadimplente"
          ? "inadimplente"
          : p.status === "cancelado"
            ? "cancelado"
            : dias >= 0
              ? `venceu há ${dias}d`
              : `vence em ${-dias}d`;
      return {
        refId: p.id,
        origem: "renovacao",
        nome: p.nome,
        telefone: p.telefone ?? "",
        email: p.email,
        cpf: p.cpf,
        codigo: p.codigo,
        planoAtualId: p.planoId,
        detalhe: `Renovação · ${situacao}`,
      };
    });

  return [...doLead, ...doAluno];
}
