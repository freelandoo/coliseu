// Fachada de dados — delega aos repositórios Prisma.
// As telas e rotas continuam importando estas funções (agora assíncronas).
import {
  listarPlanosRepo, planoPorIdRepo, criarPlanoRepo, atualizarPlanoRepo,
} from "@/lib/repositories/planos";
import {
  listarPessoasRepo, obterPessoaRepo, criarPessoaRepo, atualizarPessoaRepo,
  removerPessoaRepo, matricularPessoaRepo, proximoCodigoRepo,
} from "@/lib/repositories/pessoas";
import {
  listarCobrancasRepo, marcarCobrancaPagaRepo, marcarCobrancaAtrasadaRepo,
} from "@/lib/repositories/cobrancas";
import {
  listarDespesasRepo, criarDespesaRepo, removerDespesaRepo, totalDespesasRepo,
} from "@/lib/repositories/despesas";
import { mapaConversaPorPessoaRepo } from "@/lib/repositories/whatsapp";
import {
  LEAD_ESTAGIO_LABEL, ORIGEM_LABEL,
  type Aluno, type Candidato, type Cobranca, type Despesa, type Lead,
  type LeadEstagio, type NovaDespesa, type NovaPessoa, type NovoPlano, type Pessoa, type Plano,
} from "@/lib/types";
import type { AsaasMatricula } from "@/lib/asaas";
import { diasEntre } from "@/lib/mock-data";

/* ---------- planos ---------- */
export const listarPlanos = (): Promise<Plano[]> => listarPlanosRepo();
export const planoPorId = (id: string): Promise<Plano | undefined> => planoPorIdRepo(id);
export const criarPlano = (input: NovoPlano): Promise<Plano> => criarPlanoRepo(input);
export const atualizarPlano = (id: string, patch: Partial<Plano>): Promise<Plano | undefined> =>
  atualizarPlanoRepo(id, patch);

/* ---------- pessoas ---------- */
export const listarPessoas = (): Promise<Pessoa[]> => listarPessoasRepo();
export const obterPessoa = (id: string): Promise<Pessoa | undefined> => obterPessoaRepo(id);
export const proximoCodigoCadastro = (): Promise<string> => proximoCodigoRepo();
export const criarPessoa = (input: NovaPessoa): Promise<Pessoa> => criarPessoaRepo(input);
export const atualizarPessoa = (id: string, patch: Partial<Pessoa>): Promise<Pessoa | undefined> =>
  atualizarPessoaRepo(id, patch);
export const removerPessoa = (id: string): Promise<boolean> => removerPessoaRepo(id);
export const matricularPessoa = (
  id: string, planoId: string, asaas?: AsaasMatricula,
): Promise<Pessoa | undefined> => matricularPessoaRepo(id, planoId, asaas);

/* ---------- cobranças ---------- */
export const listarCobrancas = (): Promise<Cobranca[]> => listarCobrancasRepo();
export const marcarCobrancaPaga = (asaasId: string): Promise<boolean> => marcarCobrancaPagaRepo(asaasId);
export const marcarCobrancaAtrasada = (asaasId: string): Promise<boolean> => marcarCobrancaAtrasadaRepo(asaasId);

/* ---------- despesas ---------- */
export const listarDespesas = (): Promise<Despesa[]> => listarDespesasRepo();
export const criarDespesa = (input: NovaDespesa): Promise<Despesa> => criarDespesaRepo(input);
export const removerDespesa = (id: string): Promise<boolean> => removerDespesaRepo(id);
export const totalDespesas = (): Promise<number> => totalDespesasRepo();

/* ---------- derivados ---------- */
export async function listarAlunos(): Promise<Aluno[]> {
  const pessoas = await listarPessoasRepo();
  return pessoas
    .filter((p) => p.fase === "aluno")
    .map((p) => ({
      id: p.id, codigo: p.codigo, nome: p.nome,
      telefone: p.telefone ?? "", email: p.email ?? "", cpf: p.cpf ?? "",
      planoId: p.planoId ?? "", status: p.status ?? "ativo",
      matriculadoEm: p.matriculadoEm ?? p.criadoEm,
      vencimentoPlano: p.vencimentoPlano ?? p.criadoEm,
      ultimaPresenca: p.ultimaPresenca ?? p.criadoEm,
      dataNascimento: p.dataNascimento,
      cep: p.endereco?.cep, estado: p.endereco?.estado, cidade: p.endereco?.cidade,
      rua: p.endereco?.rua, numero: p.endereco?.numero,
    }));
}

export async function listarLeads(): Promise<Lead[]> {
  const [pessoas, conversas] = await Promise.all([
    listarPessoasRepo(),
    mapaConversaPorPessoaRepo(),
  ]);
  return pessoas
    .filter((p) => p.fase === "lead")
    .map((p) => ({
      id: p.id, nome: p.nome, telefone: p.telefone ?? "",
      origem: p.origem, estagio: p.estagio ?? "novo",
      motivoPerdido: p.motivoPerdido, criadoEm: p.criadoEm,
      conversaId: conversas.get(p.id),
    }));
}

export async function alunoPorId(id: string): Promise<Aluno | undefined> {
  return (await listarAlunos()).find((a) => a.id === id);
}

export async function receitaRecorrente(): Promise<number> {
  const [pessoas, planos] = await Promise.all([listarPessoasRepo(), listarPlanosRepo()]);
  const byId = new Map(planos.map((p) => [p.id, p]));
  return pessoas
    .filter((p) => p.fase === "aluno" && p.status !== "cancelado")
    .reduce((s, p) => s + (p.planoId ? byId.get(p.planoId)?.valorMensal ?? 0 : 0), 0);
}

export async function candidatosMatricula(): Promise<Candidato[]> {
  const pessoas = await listarPessoasRepo();
  const doLead: Candidato[] = pessoas
    .filter((p) => p.fase === "lead" && ["novo", "qualificado", "interesse"].includes(p.estagio ?? ""))
    .map((p) => ({
      refId: p.id, origem: "lead", nome: p.nome, telefone: p.telefone ?? "",
      email: p.email, cpf: p.cpf, codigo: p.codigo,
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
      const situacao = p.status === "inadimplente" ? "inadimplente"
        : p.status === "cancelado" ? "cancelado"
        : dias >= 0 ? `venceu há ${dias}d` : `vence em ${-dias}d`;
      return {
        refId: p.id, origem: "renovacao", nome: p.nome, telefone: p.telefone ?? "",
        email: p.email, cpf: p.cpf, codigo: p.codigo, planoAtualId: p.planoId,
        detalhe: `Renovação · ${situacao}`,
      };
    });
  return [...doLead, ...doAluno];
}
