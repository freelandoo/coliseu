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
// Forma de pagamento: a assinatura mensal nasce UNDEFINED — o link da
// fatura oferece PIX, boleto e cartão e o aluno escolhe. A forma usada volta
// no webhook (payment.billingType). A exceção é o boleto parcelado: o plano
// inteiro vira N boletos de uma vez (um por mês, com carnê em PDF).
// ============================================================

import { AVISO_ANTES_DIAS } from "@/lib/billing/regua";

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
  installment?: string | null;
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
  /** Id da assinatura ou do parcelamento — ver `ciclo`. */
  assinaturaId: string;
  /** MONTHLY = assinatura recorrente; INSTALLMENT = boleto parcelado. */
  ciclo: "MONTHLY" | "INSTALLMENT";
  /** Valor da 1ª cobrança quando difere da mensalidade (parcela do boleto). */
  valorCobranca?: number;
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
  /** Parcelamento a que a cobrança pertence (boleto parcelado). */
  installment?: string | null;
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
 * sem cobrança online), adotados do CloudGym (cg_…) e semente. Chamar a API
 * com eles só daria 404.
 */
export function ehIdAsaasReal(id: string | null | undefined): id is string {
  if (!id) return false;
  return !/^(pay|cus|sub|ins)_(mock|seed)_|^balcao_|^cg_|^pay_\d{3}$/.test(id);
}

async function chamar(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown): Promise<Response> {
  const res = await fetch(`${ASAAS_BASE}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY!,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!res.ok) {
    const texto = await res.text();
    let msg = "";
    try {
      const erros = (JSON.parse(texto) as { errors?: { description?: string }[] }).errors;
      msg = erros?.map((e) => e.description).filter(Boolean).join("; ") ?? "";
    } catch {
      // corpo não é JSON: fica só o status
    }
    throw new AsaasError(res.status, `Asaas ${metodo} ${caminho.split("?")[0]}: ${msg || res.status}`);
  }
  return res;
}

async function asaas<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const texto = await (await chamar(metodo, caminho, corpo)).text();
  return (texto ? JSON.parse(texto) : {}) as T;
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
  const novo = await asaas<AsaasCustomer>("POST", "/customers", input);
  // Cliente novo já nasce com os avisos da academia (ver `ajustesDeAviso`).
  // Falha aqui não impede a cobrança: o script asaas-avisos corrige depois.
  await configurarAvisosAsaas(novo.id).catch((e) => console.error("[asaas] avisos do cliente não configurados:", e));
  return novo;
}

/** Aviso do Asaas para o aluno (GET /customers/{id}/notifications). */
export interface AvisoAsaas {
  id: string;
  event: string;
  scheduleOffset: number;
  enabled: boolean;
}

/**
 * Avisos que a academia quer que o Asaas mande — régua de 27/10/2026 (antes,
 * em 26/10, era só "no dia + vencida"):
 * - 5 dias antes (o Asaas só antecipa 5/10/15/30; usa o aviso de 10 dias,
 *   remarcado para 5);
 * - no dia do vencimento;
 * - vencida (dia seguinte) e 7 dias depois do vencimento;
 * - recibo e alteração continuam; sem "cobrança criada" nem linha digitável
 *   na criação (a mensalidade seguinte nasce logo depois do pagamento e o
 *   aviso confundia quem acabou de pagar).
 * Depois do 7º dia o Coliseu pausa os avisos do cliente (`pausarAvisosAsaas`)
 * e a cobrança passa a ser manual.
 * Devolve só o que precisa mudar (rodar de novo não faz nada).
 */
export function ajustesDeAviso(avisos: AvisoAsaas[]): { id: string; enabled: boolean; scheduleOffset?: number }[] {
  const ajustes: { id: string; enabled: boolean; scheduleOffset?: number }[] = [];
  const antecipados = avisos.filter((a) => a.event === "PAYMENT_DUEDATE_WARNING" && a.scheduleOffset > 0);
  // O lembrete de 5 dias: o que já está em 5, ou o primeiro antecipado remarcado.
  const cinco = antecipados.find((a) => a.scheduleOffset === AVISO_ANTES_DIAS) ?? antecipados[0];
  if (cinco && (!cinco.enabled || cinco.scheduleOffset !== AVISO_ANTES_DIAS)) {
    ajustes.push({ id: cinco.id, enabled: true, scheduleOffset: AVISO_ANTES_DIAS });
  }
  for (const a of avisos) {
    if (a === cinco) continue;
    const desligar =
      a.event === "PAYMENT_CREATED" ||
      a.event === "SEND_LINHA_DIGITAVEL" ||
      (a.event === "PAYMENT_DUEDATE_WARNING" && a.scheduleOffset > 0);
    if (desligar && a.enabled) ajustes.push({ id: a.id, enabled: false });
  }
  return ajustes;
}

/** Aplica `ajustesDeAviso` a um cliente do Asaas. Devolve quantos avisos mudaram. */
export async function configurarAvisosAsaas(customerId: string): Promise<number> {
  if (!asaasConfigurado() || !ehIdAsaasReal(customerId)) return 0;
  const r = await asaas<{ data: AvisoAsaas[] }>("GET", `/customers/${customerId}/notifications`);
  const ajustes = ajustesDeAviso(r.data);
  for (const { id, ...corpo } of ajustes) await asaas("PUT", `/notifications/${id}`, corpo);
  return ajustes.length;
}

/**
 * Liga/desliga todos os avisos do Asaas para o cliente (`notificationDisabled`).
 * A régua pausa no 8º dia de atraso — dali em diante a cobrança é manual — e
 * religa quando ele quita.
 */
export async function pausarAvisosAsaas(customerId: string, pausar: boolean): Promise<void> {
  if (!asaasConfigurado() || !ehIdAsaasReal(customerId)) return;
  await asaas("PUT", `/customers/${customerId}`, { notificationDisabled: pausar });
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

/**
 * Boleto parcelado (POST /payments com installmentCount): o valor total vira
 * N boletos mensais, o 1º vencendo amanhã. O Asaas divide os centavos e
 * avisa o aluno antes de cada vencimento. Devolve a 1ª parcela.
 */
export async function criarParcelamento(input: {
  customer: string;
  valorTotal: number;
  parcelas: number;
  description: string;
  externalReference?: string;
}): Promise<AsaasCharge & { installment: string }> {
  const dueDate = amanha();
  if (!asaasConfigurado()) {
    const id = `pay_mock_${Date.now()}`;
    return {
      id,
      customer: input.customer,
      installment: `ins_mock_${Date.now()}`,
      value: Math.round((input.valorTotal / input.parcelas) * 100) / 100,
      dueDate,
      billingType: "BOLETO",
      invoiceUrl: `https://asaas.com/c/${id}`,
      status: "PENDING",
      description: `Parcela 1 de ${input.parcelas}. ${input.description}`,
    };
  }
  const c = await asaas<AsaasCharge>("POST", "/payments", {
    customer: input.customer,
    billingType: "BOLETO",
    dueDate,
    installmentCount: input.parcelas,
    totalValue: input.valorTotal,
    description: input.description,
    externalReference: input.externalReference,
  });
  if (!c.installment) throw new AsaasError(502, "Asaas não devolveu o parcelamento");
  return c as AsaasCharge & { installment: string };
}

/** Cancela as parcelas ainda em aberto (as pagas ficam). Equivale a cancelar a assinatura. */
export async function cancelarParcelamentoAsaas(installmentId: string): Promise<void> {
  if (!asaasConfigurado() || !ehIdAsaasReal(installmentId)) return;
  try {
    await asaas("DELETE", `/installments/${installmentId}/payments`);
  } catch (e) {
    if (!(e instanceof AsaasError && e.status === 404)) throw e;
  }
}

/** Carnê em PDF com todos os boletos do parcelamento (para imprimir no balcão). */
export async function carneDoParcelamento(installmentId: string): Promise<ArrayBuffer | null> {
  if (!asaasConfigurado() || !ehIdAsaasReal(installmentId)) return null;
  return (await chamar("GET", `/installments/${installmentId}/paymentBook`)).arrayBuffer();
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

/**
 * Desfaz a baixa de `receberEmDinheiroAsaas` (o pagamento feito fora voltou:
 * estorno na Freelandoo antes do repasse). A cobrança volta a ficar em aberto.
 */
export async function desfazerRecebimentoAsaas(paymentId: string): Promise<void> {
  if (!asaasConfigurado() || !ehIdAsaasReal(paymentId)) return;
  await asaas("POST", `/payments/${paymentId}/undoReceivedInCash`);
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

/** Cobrança manual (régua: depois de 7 dias a recepção cobra). */
export function linkCobrancaWhatsApp(
  telefone: string,
  nome: string,
  invoiceUrl: string,
  vencimento: string,
): string {
  const fone = telefone.replace(/\D/g, "");
  const dd = fone.startsWith("55") && fone.length > 11 ? fone : `55${fone}`;
  const texto = encodeURIComponent(
    `Olá ${nome}! Consta em aberto a mensalidade da Coliseu Team com vencimento em ${vencimento}.\n` +
      `Pode pagar por PIX, boleto ou cartão neste link:\n${invoiceUrl}`,
  );
  return `https://wa.me/${dd}?text=${texto}`;
}

/** Mensagem do boleto parcelado: manda o 1º boleto; os outros o Asaas avisa. */
export function linkParcelamentoWhatsApp(
  telefone: string,
  nome: string,
  invoiceUrl: string,
  parcelas: number,
): string {
  const fone = telefone.replace(/\D/g, "");
  const texto = encodeURIComponent(
    `Olá ${nome}! Sua matrícula na Coliseu Team foi parcelada em ${parcelas} boletos 💪\n` +
      `O 1º boleto está aqui:\n${invoiceUrl}\n` +
      `Os próximos chegam por e-mail/SMS antes de cada vencimento, um por mês.`,
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
  /** Boleto parcelado no lugar da assinatura mensal. */
  parcelamento?: { parcelas: number; valorTotal: number };
}): Promise<AsaasMatricula> {
  if (!asaasConfigurado()) {
    const cobrancaId = `pay_mock_${input.codigo.toLowerCase()}_${Date.now()}`;
    return {
      customerId: `cus_mock_${input.id}`,
      assinaturaId: `${input.parcelamento ? "ins" : "sub"}_mock_${input.id}_${Date.now()}`,
      ciclo: input.parcelamento ? "INSTALLMENT" : "MONTHLY",
      valorCobranca: input.parcelamento
        ? Math.round((input.parcelamento.valorTotal / input.parcelamento.parcelas) * 100) / 100
        : undefined,
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
  if (input.parcelamento) {
    const p = await criarParcelamento({
      customer: customerId,
      valorTotal: input.parcelamento.valorTotal,
      parcelas: input.parcelamento.parcelas,
      description: `Plano ${input.planoNome} — Coliseu Team`,
      externalReference: input.membershipId,
    });
    return {
      customerId,
      assinaturaId: p.installment,
      ciclo: "INSTALLMENT",
      valorCobranca: p.value,
      cobrancaId: p.id,
      linkPagamento: p.invoiceUrl,
    };
  }
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
    ciclo: "MONTHLY",
    cobrancaId: cobranca.id,
    linkPagamento: cobranca.invoiceUrl,
  };
}
