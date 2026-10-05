/**
 * Núcleo puro da importação completa do CloudGym: monta registros a partir das
 * linhas dos CSVs, casa com o que já existe no Coliseu e decide a parcela que
 * representa a situação financeira de cada aluno. Nada aqui toca o banco — o
 * script `scripts/migracao/importar-cloudgym.ts` cuida de ler e gravar.
 */
import {
  centavos,
  chaveNome,
  chaveTelefone,
  explodirPlanos,
  finalCartao,
  formaPagamento,
  limparCidade,
  limparCpf,
  limparData,
  limparEmail,
  limparTelefone,
  nomeTitleCase,
  tipoParcela,
} from "@/lib/migracao/limpeza";

export type Linha = Record<string, string>;

export interface Issue {
  arquivo: string;
  linha?: number;
  chave?: string;
  motivo: string;
  detalhe?: string;
}

/* ---------------------------------------------------------------- clientes */

export type OrigemColiseu = "whatsapp" | "redes" | "balcao" | "indicacao";

/** `source` do CloudGym → enum Origem do Coliseu. O valor bruto fica em `origemLegado`. */
export function origemDoColiseu(source: string | null | undefined): OrigemColiseu {
  const s = (source ?? "").trim().toLowerCase();
  if (s === "indication") return "indicacao";
  if (["instagram", "facebook", "google", "youtube", "tiktok"].includes(s)) return "redes";
  return "balcao";
}

export interface ClienteCG {
  legacyId: number;
  ativo: boolean;
  nome: string;
  legacyName: string;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  celular: string | null;
  fixo: string | null;
  genero: string | null;
  nascimento: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  origem: OrigemColiseu;
  origemLegado: string | null;
  vendedor: string | null;
  nps: number | null;
  cadastro: string | null;
  inicio: string | null;
  fim: string | null;
  /** Do mais recente para o mais antigo. */
  planos: string[];
}

function texto(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/**
 * Ativos + inativos, deduplicados pelo id do CloudGym (o ativo prevalece).
 * Dado inválido não derruba a linha: vira null e gera issue.
 */
export function montarClientes(ativos: Linha[], inativos: Linha[], hojeISO: string, issues: Issue[]): ClienteCG[] {
  const porId = new Map<number, ClienteCG>();
  const ler = (linhas: Linha[], arquivo: string, ativo: boolean) => {
    linhas.forEach((l, i) => {
      const legacyId = Number(l.id);
      if (!Number.isInteger(legacyId) || legacyId === 0) {
        issues.push({ arquivo, linha: i + 2, motivo: "id_invalido", detalhe: l.id });
        return;
      }
      if (porId.has(legacyId) && !ativo) return; // ativo prevalece
      const cpf = limparCpf(l.cpf);
      if (l.cpf?.trim() && !cpf) issues.push({ arquivo, linha: i + 2, chave: String(legacyId), motivo: "cpf_invalido" });
      const email = limparEmail(l.email);
      if (l.email?.trim() && !email) issues.push({ arquivo, linha: i + 2, chave: String(legacyId), motivo: "email_invalido" });
      const nascimento = limparData(l.birthDay, "1900-01-01", hojeISO);
      if (l.birthDay?.trim() && !nascimento) {
        issues.push({ arquivo, linha: i + 2, chave: String(legacyId), motivo: "nascimento_invalido", detalhe: l.birthDay });
      }
      const nps = Number(l.nps);
      porId.set(legacyId, {
        legacyId,
        ativo,
        nome: nomeTitleCase(l.name ?? ""),
        legacyName: l.name ?? "",
        cpf,
        rg: texto(l.rg),
        email,
        celular: limparTelefone(l.cellPhoneNumber),
        fixo: limparTelefone(l.phoneNumber),
        genero: l.gender === "M" || l.gender === "F" ? l.gender : null,
        nascimento,
        cidade: limparCidade(l.city),
        uf: texto(l.state)?.toUpperCase() ?? null,
        cep: (l.zipCode ?? "").replace(/\D/g, "") || null,
        origem: origemDoColiseu(l.source),
        origemLegado: texto(l.source),
        vendedor: texto(l.salesRep),
        nps: l.nps?.trim() && Number.isFinite(nps) ? nps : null,
        cadastro: limparData(l.creationDate),
        inicio: limparData(l.startDate),
        fim: limparData(l.endDate),
        planos: explodirPlanos(l.plan),
      });
    });
  };
  ler(inativos, "clientes_inativos_completo", false);
  ler(ativos, "clientes_ativos", true);
  return [...porId.values()];
}

/* ------------------------------------------------------ índice de contato */

export type Via = "email" | "celular" | "nome";

/**
 * Casa um registro sem id (check-in, ausente, aniversariante) com uma pessoa,
 * na ordem do prompt: email → celular → nome normalizado. Chave que aponta para
 * mais de uma pessoa é descartada — casar errado dá presença de outra pessoa.
 */
export class IndiceContato {
  private email = new Map<string, string | null>();
  private celular = new Map<string, string | null>();
  private nome = new Map<string, string | null>();

  constructor(itens: { id: string; email?: string | null; celular?: string | null; nome?: string | null }[]) {
    const por = (m: Map<string, string | null>, k: string, id: string) => {
      if (!k) return;
      const atual = m.get(k);
      m.set(k, atual === undefined || atual === id ? id : null);
    };
    for (const it of itens) {
      por(this.email, limparEmail(it.email) ?? "", it.id);
      por(this.celular, chaveTelefone(it.celular), it.id);
      por(this.nome, chaveNome(it.nome), it.id);
    }
  }

  achar(email?: string | null, celular?: string | null, nome?: string | null): { id: string; via: Via } | null {
    const e = this.email.get(limparEmail(email) ?? "");
    if (e) return { id: e, via: "email" };
    const c = this.celular.get(chaveTelefone(celular));
    if (c) return { id: c, via: "celular" };
    const n = this.nome.get(chaveNome(nome));
    if (n) return { id: n, via: "nome" };
    return null;
  }
}

/* ------------------------------------------- casamento com quem já existe */

export interface PessoaExistente {
  id: string;
  legacyCloudgymId: number | null;
  cpf: string | null;
  nome: string;
  telefone: string | null;
}

export type ViaCasamento = "legacy" | "cpf" | "celular+nome" | "nome";

const primeiroNome = (n: string) => chaveNome(n).split(" ")[0] ?? "";

/**
 * Cliente do CloudGym → Person já existente. Ordem: id legado → CPF (com o
 * primeiro nome batendo: dependente compartilha CPF do titular) → celular com o
 * primeiro nome → nome completo único. Cada pessoa casa com um cliente só.
 */
export function casarComExistentes(
  clientes: ClienteCG[],
  pessoas: PessoaExistente[],
): Map<number, { personId: string; via: ViaCasamento }> {
  const usados = new Set<string>();
  const out = new Map<number, { personId: string; via: ViaCasamento }>();
  const porLegacy = new Map(pessoas.filter((p) => p.legacyCloudgymId).map((p) => [p.legacyCloudgymId!, p]));
  const agrupar = (f: (p: PessoaExistente) => string) => {
    const m = new Map<string, PessoaExistente[]>();
    for (const p of pessoas) {
      const k = f(p);
      if (k) m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  };
  const porCpf = agrupar((p) => limparCpf(p.cpf) ?? "");
  const porCel = agrupar((p) => chaveTelefone(p.telefone));
  const porNome = agrupar((p) => chaveNome(p.nome));

  const marcar = (c: ClienteCG, p: PessoaExistente | undefined, via: ViaCasamento) => {
    if (!p || usados.has(p.id)) return false;
    usados.add(p.id);
    out.set(c.legacyId, { personId: p.id, via });
    return true;
  };
  // Ativos primeiro: em empate, a pessoa do Coliseu fica com o cadastro vivo.
  const ordem = [...clientes].sort((a, b) => Number(b.ativo) - Number(a.ativo));
  for (const c of ordem) if (marcar(c, porLegacy.get(c.legacyId), "legacy")) continue;
  for (const c of ordem) {
    if (out.has(c.legacyId)) continue;
    const pn = primeiroNome(c.legacyName);
    const porDoc = c.cpf ? (porCpf.get(c.cpf) ?? []).filter((p) => primeiroNome(p.nome) === pn && !usados.has(p.id)) : [];
    if (porDoc.length === 1 && marcar(c, porDoc[0], "cpf")) continue;
    const cel = chaveTelefone(c.celular);
    const porFone = cel ? (porCel.get(cel) ?? []).filter((p) => primeiroNome(p.nome) === pn && !usados.has(p.id)) : [];
    if (porFone.length === 1 && marcar(c, porFone[0], "celular+nome")) continue;
    const homonimos = (porNome.get(chaveNome(c.legacyName)) ?? []).filter((p) => !usados.has(p.id));
    if (homonimos.length === 1) marcar(c, homonimos[0], "nome");
  }
  return out;
}

/* ---------------------------------------------------------------- parcelas */

export interface ParcelaCG {
  legacyPaymentId: number;
  legacyMemberId: number;
  vencimento: string;
  pagamento: string | null;
  compensacao: string | null;
  valorBrutoCent: number;
  valorLiquidoCent: number | null;
  forma: string;
  cartaoFinal: string | null;
  bandeira: string | null;
  nsu: string | null;
  gateway: string | null;
  status: string | null;
  tipo: "mensalidade" | "adesao" | "legado";
  realizadoCaixa: boolean;
}

/** Linha do "previsto competência" → parcela. Forma desconhecida é mantida e vira issue. */
export function montarParcela(l: Linha, linha: number, caixaIds: Set<string>, issues: Issue[]): ParcelaCG | null {
  const arquivo = "recebimentos_previsto_competencia";
  const legacyPaymentId = Number(l.payment_id);
  const vencimento = limparData(l.data_vencimento, "2000-01-01");
  const bruto = centavos(l.valor_bruto);
  if (!Number.isInteger(legacyPaymentId) || !vencimento || bruto === null) {
    issues.push({ arquivo, linha, chave: l.payment_id, motivo: "parcela_invalida", detalhe: `${l.data_vencimento} ${l.valor_bruto}` });
    return null;
  }
  const forma = formaPagamento(l.forma_pagamento);
  if (!forma) issues.push({ arquivo, linha, chave: l.payment_id, motivo: "forma_desconhecida", detalhe: l.forma_pagamento });
  return {
    legacyPaymentId,
    legacyMemberId: Number(l.member_id),
    vencimento,
    pagamento: limparData(l.data_pagamento, "2000-01-01"),
    compensacao: limparData(l.data_compensacao, "2000-01-01"),
    valorBrutoCent: bruto,
    valorLiquidoCent: centavos(l.valor_liquido),
    forma: forma ?? (l.forma_pagamento ?? "").trim().toUpperCase(),
    cartaoFinal: finalCartao(l.numero_cartao),
    bandeira: texto(l.bandeira),
    nsu: texto(l.nsu_autorizacao),
    gateway: texto(l.campo_15),
    status: texto(l.status),
    tipo: tipoParcela(l.tipo),
    realizadoCaixa: caixaIds.has(l.payment_id),
  };
}

/** Chave cliente|data|valor que liga uma receita/lançamento à parcela correspondente. */
export function chaveReceita(memberId: string | number, dataISO: string | null, valorCent: number | null): string {
  return `${memberId}|${dataISO ?? ""}|${valorCent ?? ""}`;
}

/* -------------------------------------------- situação financeira do aluno */

export type StatusPayment = "PAID" | "PENDING" | "OVERDUE" | "REFUNDED";

/**
 * A parcela que a política da catraca deve enxergar: a mais recente já vencida
 * (paga ou não); sem nenhuma vencida, a próxima a vencer. Estorno (`canceled`)
 * e erro de cobrança não contam — a parcela vigente é outra.
 */
export function parcelaDeReferencia(parcelas: ParcelaCG[], hojeISO: string): ParcelaCG | null {
  const validas = parcelas.filter((p) => p.status !== "canceled" && p.status !== "error");
  const vencidas = validas.filter((p) => p.vencimento <= hojeISO).sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  if (vencidas.length) return vencidas[0];
  const futuras = validas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return futuras[0] ?? null;
}

/** Status do `Payment` que espelha a parcela de referência. */
export function statusDoPayment(p: ParcelaCG, hojeISO: string): StatusPayment {
  if (p.pagamento || p.status === "paid") return "PAID";
  if (p.status === "overdue" || p.vencimento < hojeISO) return "OVERDUE";
  return "PENDING";
}

/* -------------------------------------------------------------- check-ins */

/**
 * Chave determinística de um check-in: o export não tem id. Duas entradas da
 * mesma pessoa no mesmo minuto ganham ordinal, para reimportar sem duplicar e
 * sem perder repetição real.
 */
export function chavesCheckin(linhas: Linha[]): string[] {
  const vistos = new Map<string, number>();
  return linhas.map((l) => {
    const base = `${l.data}|${l.hora}|${chaveNome(l.nome)}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return n ? `${base}|${n}` : base;
  });
}

/** "2026-10-03" + "12:20:00" em America/Sao_Paulo (sem horário de verão desde 2019). */
export function instanteSaoPaulo(dataISO: string, hora: string): Date | null {
  const h = (hora ?? "").trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  const d = limparData(dataISO);
  if (!d || !h) return null;
  return new Date(`${d}T${h[1]}:${h[2]}:${h[3] ?? "00"}-03:00`);
}
