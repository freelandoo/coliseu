// ============================================================
// Cliente da API do CloudGym (https://api.prod.cloudgym.io) — só para o
// espelho Coliseu → CloudGym até o corte. Nada aqui lê ou grava o banco.
//
// Login: usuário staff dedicado (CLOUDGYM_USUARIO/CLOUDGYM_SENHA) em
// POST /auth/token com Basic base64(email:senha). O JWT dura ~48 h e o
// CloudGym mantém UM token ativo por usuário — por isso o usuário é só do
// espelho. Sem senha, CLOUDGYM_TOKEN (colado do painel) serve até vencer.
// ============================================================

const BASE = process.env.CLOUDGYM_API_URL || "https://api.prod.cloudgym.io";
export const UNIDADE_CLOUDGYM = Number(process.env.CLOUDGYM_UNIDADE || 1668);

export class CloudgymError extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "CloudgymError";
  }
}

export interface CgParcela {
  id: number;
  amount: number;
  dueDate: string;
  /** paid | overdue | canceled | null (em aberto, ainda não venceu) */
  status: string | null;
}

export interface CgContrato {
  id: number;
  plan: number;
  status: string; // active | overdue | canceled | finished | ...
  creationDate: string;
  startDate: string;
  endDate: string;
  payments: CgParcela[];
}

export interface CgCliente {
  id: number;
  name: string;
  cpf: string | null;
  status: string;
  contracts: CgContrato[];
}

/** Dados de cadastro para POST /customer (o contrato vai junto — a API exige). */
export interface CgNovoCliente {
  name: string;
  cpf?: string;
  email?: string;
  cellPhoneNumber?: string;
  birthDay?: string;
  gender?: "M" | "F";
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  rg?: string;
  extId?: string;
}

export interface CgNovoPlano {
  name: string;
  price: number;
  duration: number;
}

export function cloudgymConfigurado(): boolean {
  return Boolean(
    (process.env.CLOUDGYM_USUARIO && process.env.CLOUDGYM_SENHA) || process.env.CLOUDGYM_TOKEN,
  );
}

const g = globalThis as unknown as { __cloudgymToken?: { valor: string; expira: number } };

function expiracaoDoJwt(token: string): number {
  try {
    const corpo = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp?: number };
    return corpo.exp ? corpo.exp * 1000 : Date.now() + 3_600_000;
  } catch {
    return Date.now() + 3_600_000;
  }
}

/** O corpo do /auth/token é "string" no swagger: aceita JSON com o token ou o JWT puro. */
function lerToken(texto: string): string | null {
  const t = texto.trim();
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) return t;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    for (const k of ["access_token", "accessToken", "token", "jwt"]) {
      if (typeof j[k] === "string") return j[k] as string;
    }
  } catch {
    // não era JSON
  }
  return null;
}

async function login(): Promise<string> {
  const usuario = process.env.CLOUDGYM_USUARIO;
  const senha = process.env.CLOUDGYM_SENHA;
  if (!usuario || !senha) {
    const colado = process.env.CLOUDGYM_TOKEN;
    if (!colado) throw new CloudgymError(401, "CloudGym sem credenciais (CLOUDGYM_USUARIO/CLOUDGYM_SENHA)");
    if (expiracaoDoJwt(colado) < Date.now()) {
      throw new CloudgymError(401, "Token do CloudGym venceu — configure CLOUDGYM_USUARIO/CLOUDGYM_SENHA");
    }
    return colado;
  }
  const res = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${usuario}:${senha}`).toString("base64")}`,
    },
    body: JSON.stringify({ grantType: "password" }),
  });
  const texto = await res.text();
  const token = res.ok ? lerToken(texto) : null;
  if (!token) throw new CloudgymError(res.status, `Login no CloudGym falhou (${res.status}): ${texto.slice(0, 200)}`);
  return token;
}

async function token(renovar = false): Promise<string> {
  const atual = g.__cloudgymToken;
  // Renova uma hora antes de vencer.
  if (!renovar && atual && atual.expira - 3_600_000 > Date.now()) return atual.valor;
  const valor = await login();
  g.__cloudgymToken = { valor, expira: expiracaoDoJwt(valor) };
  return valor;
}

async function cg<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const res = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token(tentativa > 0)}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    // Token derrubado (outro login do mesmo usuário): renova uma vez.
    if (res.status === 401 && tentativa === 0 && process.env.CLOUDGYM_SENHA) continue;
    const texto = await res.text();
    let json: unknown = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      json = { message: texto };
    }
    if (!res.ok) {
      const j = json as { message?: string; details?: string[] };
      const msg = j.details?.join("; ") || j.message || String(res.status);
      throw new CloudgymError(res.status, `CloudGym ${metodo} ${caminho.split("?")[0]}: ${msg}`);
    }
    return json as T;
  }
}

export async function obterCliente(id: number): Promise<CgCliente> {
  return cg<CgCliente>("GET", `/customer/byid/${id}`);
}

/** Clientes da unidade com este CPF (só dígitos). Excluídos não aparecem. */
export async function buscarPorCpf(cpf: string): Promise<{ id: number; name: string }[]> {
  const r = await cg<{ content: { id: number; name: string; cpf: string | null }[] }>(
    "GET",
    `/customer/${UNIDADE_CLOUDGYM}?page=0&size=5&filter=${encodeURIComponent(`cpf:${cpf}`)}`,
  );
  return r.content.filter((c) => (c.cpf ?? "").replace(/\D/g, "") === cpf);
}

/**
 * Cliente novo — a API cria o contrato junto. `methodPayment` DN (dinheiro)
 * nunca aciona gateway; a forma real vai na baixa de cada parcela.
 */
export async function criarCliente(
  dados: CgNovoCliente,
  contrato: { plano: number; inicio: string; parcelas: number },
): Promise<{ id: number; contractId: number }> {
  const r = await cg<{ id: number; contract_id: number }>("POST", "/customer", {
    ...dados,
    methodPayment: "DN",
    plan: contrato.plano,
    startDate: contrato.inicio,
    installments: contrato.parcelas,
    installman: contrato.parcelas,
    installreg: 1,
  });
  return { id: r.id, contractId: r.contract_id };
}

/** Contrato novo: o valor de cada parcela é o preço do plano ÷ parcelas (o CloudGym ignora `price`). */
export async function criarContrato(
  memberId: number,
  contrato: { plano: number; inicio: string; parcelas: number },
): Promise<number> {
  const r = await cg<{ id: number }>("POST", "/customer/contract", {
    idMember: memberId,
    plan: contrato.plano,
    startDate: contrato.inicio,
    methodPayment: "DN",
    installments: contrato.parcelas,
    installman: contrato.parcelas,
    installreg: 1,
  });
  return r.id;
}

/**
 * Baixa manual de parcela. Com `valor` menor que o da parcela, a diferença vira
 * desconto (sem sobra em aberto — parcela aberta deixa o cliente "overdue").
 */
export async function receberParcela(
  parcelaId: number,
  baixa: { forma: string; cartao?: string; valor?: number },
): Promise<void> {
  await cg("POST", `/customer/payment/${parcelaId}/receive`, {
    methodPayment: baixa.forma,
    ...(baixa.cartao && { card: baixa.cartao }),
    ...(baixa.valor !== undefined && { amount: baixa.valor, discount: true }),
  });
}

export async function cancelarContrato(contratoId: number, data: string, motivo: string): Promise<void> {
  await cg("PUT", `/customer/contract/${contratoId}/cancel/${data}/${encodeURIComponent(motivo)}`);
}

/** Plano criado no Coliseu que o CloudGym não tem. Mesmo formato dos planos de lá: preço cheio, duração em meses. */
export async function criarPlano(p: CgNovoPlano): Promise<number> {
  const r = await cg<{ id: number }>("POST", "/config/plan", {
    unit_id: UNIDADE_CLOUDGYM,
    name: p.name.slice(0, 60),
    price: p.price,
    months: 1,
    duration: p.duration,
    cycle: "m",
    type: "std",
    registrationFee: 0,
    graceRegistrationFee: 0,
    maintenanceFee: 0,
    graceMaintenanceFee: 0,
    renew: false,
    chartAccountId: Number(process.env.CLOUDGYM_CONTA_CONTABIL || 38073),
    accessfrom: "00:00:00",
    accessto: "23:59:00",
    nsessions: 0,
    installreg: 1,
    installman: 1,
    showOnSite: false,
    allowedClasses: "-1",
    allowedUnits: "-1",
    allowedTurnStile: "-1",
    dependents: 0,
    checkinRestriction: false,
    maxCheckIns: -1,
    maxCheckInsDay: -1,
    maxFreezeDays: -1,
    minFreezeDays: -1,
    countActiveCustomer: false,
    tax1: 0,
    tax2: 0,
  });
  return r.id;
}

/** Catálogo de planos da unidade (GET /config/plans/{unidade}). */
export async function listarPlanos(): Promise<import("@/lib/cloudgym/planos").PlanoCloudgym[]> {
  const r = await cg<{ content: import("@/lib/cloudgym/planos").PlanoCloudgym[] }>(
    "GET",
    `/config/plans/${UNIDADE_CLOUDGYM}?page=0&size=1000`,
  );
  return r.content;
}
