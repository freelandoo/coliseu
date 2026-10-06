// ============================================================
// Cliente HTTP do Asaas — só chamadas à API, sem banco.
//   base: https://api.asaas.com/v3  (sandbox: https://api-sandbox.asaas.com/v3)
//   header: access_token: process.env.ASAAS_API_KEY
// Sem ASAAS_API_KEY tudo vira mock (dev e testes rodam sem configurar nada).
// O webhook (/api/webhooks/asaas) é quem confirma pagamento — ver
// @/lib/billing/aplicar. A orquestração com o banco fica em
// @/lib/billing/cobrancas; este arquivo também é importado pelo navegador
// (linkPagamentoWhatsApp), então não pode alcançar o Prisma.
//
// Forma de pagamento: toda cobrança nasce UNDEFINED — o link da fatura
// oferece PIX, boleto e cartão e o aluno escolhe. A forma usada volta no
// webhook (payment.billingType).
// ============================================================

export type AsaasBillingType = "UNDEFINED" | "PIX" | "BOLETO" | "CREDIT_CARD";

export interface AsaasCustomer {
  id: string;
  name: string;
  mobilePhone: string;
  email?: string;
  cpfCnpj?: string; // exigido pelo Asaas para gerar cobrança/assinatura
  externalReference?: string;
}

export interface AsaasCharge {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  dueDate: string; // YYYY-MM-DD
  billingType: AsaasBillingType;
  invoiceUrl: string;
  status: string;
  description?: string | null;
  externalReference?: string | null;
  paymentDate?: string | null;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: "MONTHLY";
  nextDueDate: string; // YYYY-MM-DD
  status: string;
  externalReference?: string;
}

/** Resultado consolidado de uma matrícula no Asaas (mock ou real). */
export interface AsaasMatricula {
  customerId: string;
  assinaturaId: string;
  cobrancaId: string; // id da 1ª cobrança da assinatura (vira Cobranca.asaasId)
  linkPagamento: string; // invoiceUrl da 1ª cobrança
}

/** Forma pagamento como o Asaas devolve na listagem/webhook (o que a reconciliação usa). */
export interface AsaasPaymentLike {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string | null;
  invoiceUrl?: string | null;
  subscription?: string | null;
  customer?: string | null;
  billingType?: string | null;
  description?: string | null;
  externalReference?: string | null;
}

/** Erro da API com a mensagem que o Asaas devolveu (vai para a tela). */
export class AsaasError extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "AsaasError";
  }
}

const ASAAS_BASE =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

export function asaasConfigurado(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

/**
 * Ids que nunca existiram no Asaas: mock (sem chave), balcão (venda presencial
 * sem cobrança online) e semente. Chamar a API com eles só daria 404.
 */
export function ehIdAsaasReal(id: string | null | undefined): id is string {
  if (!id) return false;
  return !/^(pay|cus|sub)_(mock|seed)_|^balcao_|^pay_\d{3}$/.test(id);
}

async function asaas<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY!,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await res.text();
  const json = texto ? (JSON.parse(texto) as unknown) : {};
  if (!res.ok) {
    const erros = (json as { errors?: { description?: string }[] }).errors;
    const msg = erros?.map((e) => e.description).filter(Boolean).join("; ");
    throw new AsaasError(res.status, `Asaas ${metodo} ${caminho.split("?")[0]}: ${msg || res.status}`);
  }
  return json as T;
}

function amanha(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/** Localiza o cliente pelo externalReference (id da pessoa) ou CPF; cria se não houver. */
export async function criarOuLocalizarCliente(
  input: Omit<AsaasCustomer, "id">,
): Promise<AsaasCustomer> {
  if (!asaasConfigurado()) {
    return { id: `cus_mock_${input.externalReference ?? Date.now()}`, ...input };
  }
  const filtros = [
    input.externalReference && `externalReference=${encodeURIComponent(input.externalReference)}`,
    input.cpfCnpj && `cpfCnpj=${encodeURIComponent(input.cpfCnpj)}`,
  ].filter(Boolean) as string[];
  for (const filtro of filtros) {
    const r = await asaas<{ data: AsaasCustomer[] }>("GET", `/customers?${filtro}&limit=1`);
    if (r.data[0]) return r.data[0];
  }
  return asaas<AsaasCustomer>("POST", "/customers", input);
}

/** Cria a assinatura mensal recorrente (POST /subscriptions). 1ª cobrança vence amanhã. */
export async function criarAssinatura(input: {
  customer: string;
  value: number;
  description?: string;
  externalReference?: string;
}): Promise<AsaasSubscription> {
  const nextDueDate = amanha();
  if (!asaasConfigurado()) {
    return {
      id: `sub_mock_${Date.now()}`,
      customer: input.customer,
      value: input.value,
      cycle: "MONTHLY",
      nextDueDate,
      status: "ACTIVE",
    };
  }
  return asaas<AsaasSubscription>("POST", "/subscriptions", {
    customer: input.customer,
    billingType: "UNDEFINED",
    cycle: "MONTHLY",
    value: input.value,
    nextDueDate,
    description: input.description,
    externalReference: input.externalReference,
  });
}

/** Cancela a assinatura: para de gerar mensalidade; o Asaas remove as pendentes. */
export async function cancelarAssinaturaAsaas(subscriptionId: string): Promise<void> {
  if (!asaasConfigurado() || !ehIdAsaasReal(subscriptionId)) return;
  try {
    await asaas("DELETE", `/subscriptions/${subscriptionId}`);
  } catch (e) {
    // Já removida no painel do Asaas: o objetivo (não cobrar mais) está cumprido.
    if (!(e instanceof AsaasError && e.status === 404)) throw e;
  }
}

/** Busca a 1ª cobrança gerada pela assinatura (GET /subscriptions/{id}/payments). */
export async function primeiraCobrancaAssinatura(subscriptionId: string): Promise<AsaasCharge> {
  if (!asaasConfigurado()) {
    const id = `pay_mock_${Date.now()}`;
    return {
      id,
      customer: "",
      value: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      billingType: "UNDEFINED",
      invoiceUrl: `https://asaas.com/c/${id}`,
      status: "PENDING",
    };
  }
  const data = await asaas<{ data: AsaasCharge[] }>("GET", `/subscriptions/${subscriptionId}/payments`);
  if (!data.data[0]) throw new AsaasError(502, "Asaas não gerou a 1ª cobrança da assinatura");
  return data.data[0];
}

/** Cobrança avulsa (taxa, produto, diferença de plano) — o aluno escolhe a forma no link. */
export async function criarCobrancaAvulsa(input: {
  customer: string;
  value: number;
  dueDate: string;
  description: string;
  externalReference?: string;
}): Promise<AsaasCharge> {
  if (!asaasConfigurado()) {
    const id = `pay_mock_${Date.now()}`;
    return {
      id,
      customer: input.customer,
      value: input.value,
      dueDate: input.dueDate,
      billingType: "UNDEFINED",
      invoiceUrl: `https://asaas.com/c/${id}`,
      status: "PENDING",
      description: input.description,
    };
  }
  return asaas<AsaasCharge>("POST", "/payments", { billingType: "UNDEFINED", ...input });
}

/** Remove uma cobrança ainda não paga. */
export async function cancelarCobrancaAsaas(paymentId: string): Promise<void> {
  if (!asaasConfigurado() || !ehIdAsaasReal(paymentId)) return;
  await asaas("DELETE", `/payments/${paymentId}`);
}

/**
 * Baixa de pagamento recebido fora do Asaas (venda de balcão): sem isso o
 * Asaas continua cobrando o aluno e manda lembrete de fatura já paga.
 */
export async function receberEmDinheiroAsaas(paymentId: string, value: number): Promise<void> {
  if (!asaasConfigurado() || !ehIdAsaasReal(paymentId)) return;
  await asaas("POST", `/payments/${paymentId}/receiveInCash`, {
    paymentDate: new Date().toISOString().slice(0, 10),
    value,
    notifyCustomer: false,
  });
}

/** Uma cobrança do Asaas (reconciliação pontual). */
export async function obterCobrancaAsaas(paymentId: string): Promise<AsaasPaymentLike | null> {
  if (!asaasConfigurado() || !ehIdAsaasReal(paymentId)) return null;
  return asaas<AsaasPaymentLike>("GET", `/payments/${paymentId}`);
}

/**
 * Lista as cobranças da conta (reconciliação), paginando de 100 em 100.
 * `desde` limita pela data de criação — a conta pode ter anos de histórico.
 */
export async function listarPaymentsAsaas(desde?: string): Promise<AsaasPaymentLike[]> {
  if (!asaasConfigurado()) return [];
  const todos: AsaasPaymentLike[] = [];
  for (let offset = 0; offset < 10_000; offset += 100) {
    const filtro = desde ? `&dateCreated%5Bge%5D=${desde}` : "";
    const r = await asaas<{ data: AsaasPaymentLike[]; hasMore: boolean }>(
      "GET",
      `/payments?limit=100&offset=${offset}${filtro}`,
    );
    todos.push(...r.data);
    if (!r.hasMore) break;
  }
  return todos;
}

/** Mensagem pronta para o link de pagamento via WhatsApp. */
export function linkPagamentoWhatsApp(
  telefone: string,
  nome: string,
  invoiceUrl: string,
): string {
  const fone = telefone.replace(/\D/g, "");
  const texto = encodeURIComponent(
    `Olá ${nome}! Aqui está o link para concluir sua matrícula na Coliseu Team 💪\n` +
      `Pode pagar por PIX, boleto ou cartão:\n${invoiceUrl}`,
  );
  return `https://wa.me/55${fone}?text=${texto}`;
}

/** Orquestra a matrícula no Asaas: cliente → assinatura → 1ª cobrança/link. */
export async function matricularNoAsaas(input: {
  id: string;
  codigo: string;
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  planoNome: string;
  valorMensal: number;
  membershipId?: string;
  personId?: string;
  /** Cliente já conhecido (BillingCustomer) — evita duplicar no Asaas. */
  customerId?: string;
}): Promise<AsaasMatricula> {
  if (!asaasConfigurado()) {
    const cobrancaId = `pay_mock_${input.codigo.toLowerCase()}_${Date.now()}`;
    return {
      customerId: `cus_mock_${input.id}`,
      assinaturaId: `sub_mock_${input.id}_${Date.now()}`,
      cobrancaId,
      linkPagamento: `https://asaas.com/c/${cobrancaId}`,
    };
  }

  const customerId =
    input.customerId && ehIdAsaasReal(input.customerId)
      ? input.customerId
      : (
          await criarOuLocalizarCliente({
            name: input.nome,
            mobilePhone: (input.telefone ?? "").replace(/\D/g, ""),
            email: input.email || undefined,
            cpfCnpj: (input.cpf ?? "").replace(/\D/g, "") || undefined,
            externalReference: input.personId,
          })
        ).id;
  const assinatura = await criarAssinatura({
    customer: customerId,
    value: input.valorMensal,
    description: `Plano ${input.planoNome} — Coliseu Team`,
    externalReference: input.membershipId,
  });
  const cobranca = await primeiraCobrancaAssinatura(assinatura.id);
  return {
    customerId,
    assinaturaId: assinatura.id,
    cobrancaId: cobranca.id,
    linkPagamento: cobranca.invoiceUrl,
  };
}
