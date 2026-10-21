import { evaluateAccessEligibility } from "@/lib/access/policy";
import type { AccessContext } from "@/lib/access/types";
import { cpfValido, normalizarCpf } from "@/lib/cpf";
import type { FreelandooEstado } from "@prisma/client";

/**
 * Quem pode ganhar conta na Freelandoo — função PURA (sem I/O).
 *
 * Decisão Q2/Q5/Q17 do design (2026-10-20): só aluno com matrícula válida,
 * CPF com DV, e-mail e data de nascimento, maior de 18. Nunca inventa dado:
 * falta algo → "falta dado" na ficha, e completar o cadastro libera na
 * próxima passagem pela catraca (ou no botão da ficha).
 */

export type MotivoInelegivel =
  | "nao_e_aluno"
  | "matricula_invalida"
  | "falta_cpf"
  | "cpf_invalido"
  | "falta_email"
  | "falta_nascimento"
  | "menor"
  | "ja_vinculado";

/** O que vai no POST /partner/v1/members. */
export interface DadosMembro {
  cpf: string;
  nome: string;
  email: string;
  data_nascimento: string; // YYYY-MM-DD
  telefone?: string; // dígitos com DDI 55
  ref_externa: string; // Person.id
}

export type Elegibilidade =
  | { elegivel: true; dados: DadosMembro }
  | { elegivel: false; motivo: MotivoInelegivel; estado: FreelandooEstado | null };

export interface PessoaElegibilidade {
  id: string;
  nome: string;
  fase: "lead" | "aluno" | "exaluno";
  cpf: string | null;
  email: string | null;
  dataNascimento: string | null;
  telefone: string | null;
  freelandooUserId: string | null;
}

export const IDADE_MINIMA = 18;
const FUSO_ACADEMIA = "America/Sao_Paulo";

/**
 * Data de nascimento do cadastro → YYYY-MM-DD. O campo é texto livre na base:
 * a tela grava `YYYY-MM-DD` (input date), a importação do CloudGym também, e
 * cadastros antigos podem ter `DD/MM/AAAA`. Data impossível vira null.
 */
export function nascimentoIso(valor: string | null | undefined): string | null {
  const v = String(valor ?? "").trim();
  if (!v) return null;
  let a: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [a, m, d] = [Number(br[3]), Number(br[2]), Number(br[1])];
  else return null;
  if (a < 1900 || m < 1 || m > 12 || d < 1) return null;
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null; // 31/02
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "Hoje" no fuso da academia, YYYY-MM-DD. */
function hojeIso(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_ACADEMIA, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/** Idade completa em anos na data `agora` (fuso da academia). */
export function idadeEm(nascimento: string, agora: Date): number {
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ha, hm, hd] = hojeIso(agora).split("-").map(Number);
  let idade = ha - a;
  if (hm < m || (hm === m && hd < d)) idade -= 1;
  return idade;
}

/**
 * Telefone para a Freelandoo e para o WhatsApp: só dígitos, com DDI 55.
 * Aceita "(11) 90000-0000", "11900000000", "+55 11 9…". Fora disso, null.
 */
export function telefoneComDdi(valor: string | null | undefined): string | null {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Matrícula válida = a mesma regra da catraca (`evaluateAccessEligibility`),
 * olhando só contrato e financeiro: a face/sincronização e o override manual
 * não dizem nada sobre ser aluno. Cortesia conta (aluno recém-matriculado
 * ainda sem o 1º pagamento já é aluno).
 */
export function matriculaValida(ctx: AccessContext | null): boolean {
  if (!ctx || !ctx.membershipStatus) return false;
  return evaluateAccessEligibility({
    ...ctx, temCredencialEnrolled: true, sincronizado: true, overrideAtivo: null,
  }).allow;
}

/** Estado da ficha para cada motivo; null = não mexe no estado atual. */
const ESTADO_DO_MOTIVO: Record<MotivoInelegivel, FreelandooEstado | null> = {
  nao_e_aluno: "sem_conta",
  matricula_invalida: "sem_conta",
  falta_cpf: "falta_dado",
  cpf_invalido: "falta_dado",
  falta_email: "falta_dado",
  falta_nascimento: "falta_dado",
  menor: "menor",
  ja_vinculado: null,
};

export function avaliarElegibilidade(
  pessoa: PessoaElegibilidade,
  ctx: AccessContext | null,
  agora: Date = new Date(),
): Elegibilidade {
  const nao = (motivo: MotivoInelegivel): Elegibilidade => ({
    elegivel: false, motivo, estado: ESTADO_DO_MOTIVO[motivo],
  });

  if (pessoa.freelandooUserId) return nao("ja_vinculado");
  if (pessoa.fase !== "aluno") return nao("nao_e_aluno");
  if (!matriculaValida(ctx)) return nao("matricula_invalida");

  const cpf = normalizarCpf(pessoa.cpf);
  if (!cpf) return nao("falta_cpf");
  const cpfCompleto = cpf.length < 11 ? cpf.padStart(11, "0") : cpf;
  if (!cpfValido(cpfCompleto)) return nao("cpf_invalido");

  const email = String(pessoa.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL.test(email)) return nao("falta_email");

  const nascimento = nascimentoIso(pessoa.dataNascimento);
  if (!nascimento) return nao("falta_nascimento");
  if (idadeEm(nascimento, agora) < IDADE_MINIMA) return nao("menor");

  const telefone = telefoneComDdi(pessoa.telefone);
  return {
    elegivel: true,
    dados: {
      cpf: cpfCompleto,
      nome: pessoa.nome.trim(),
      email,
      data_nascimento: nascimento,
      ...(telefone ? { telefone } : {}),
      ref_externa: pessoa.id,
    },
  };
}

