// ============================================================
// Cliente Asaas (stub) — Estágio 2 e 3 do fluxograma
// Em produção, troque os mocks por chamadas reais:
//   base: https://api.asaas.com/v3  (sandbox: https://api-sandbox.asaas.com/v3)
//   header: access_token: process.env.ASAAS_API_KEY
// O webhook do Asaas (PAYMENT_RECEIVED / PAYMENT_CONFIRMED) deve atingir
//   /api/webhooks/asaas e atualizar o status da cobrança/aluno.
// ============================================================

export interface AsaasCustomer {
  id: string;
  name: string;
  mobilePhone: string;
  email?: string;
  cpfCnpj?: string; // exigido pelo Asaas para gerar cobrança/assinatura PIX
}

export interface AsaasCharge {
  id: string;
  customer: string;
  value: number;
  dueDate: string; // YYYY-MM-DD
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
  invoiceUrl: string;
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE";
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: "MONTHLY";
  nextDueDate: string; // YYYY-MM-DD
  status: string;
}

/** Resultado consolidado de uma matrícula no Asaas (mock ou real). */
export interface AsaasMatricula {
  customerId: string;
  assinaturaId: string;
  cobrancaId: string; // id da 1ª cobrança da assinatura (vira Cobranca.asaasId)
  linkPagamento: string; // invoiceUrl da 1ª cobrança
}

const ASAAS_BASE =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

function temCredenciais(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

/** Cria ou localiza o cliente no Asaas (passo "Criar ou localizar cliente"). */
export async function criarOuLocalizarCliente(
  input: Omit<AsaasCustomer, "id">,
): Promise<AsaasCustomer> {
  if (!temCredenciais()) {
    return { id: `cus_mock_${Date.now()}`, ...input };
  }
  const res = await fetch(`${ASAAS_BASE}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY!,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Asaas customers: ${res.status}`);
  return res.json();
}

/** Gera a cobrança/assinatura (passo "Gerar cobrança ou assinatura"). */
export async function gerarCobranca(input: {
  customer: string;
  value: number;
  dueDate: string;
  description?: string;
}): Promise<AsaasCharge> {
  if (!temCredenciais()) {
    const id = `pay_mock_${Date.now()}`;
    return {
      id,
      customer: input.customer,
      value: input.value,
      dueDate: input.dueDate,
      billingType: "PIX",
      invoiceUrl: `https://asaas.com/c/${id}`,
      status: "PENDING",
    };
  }
  const res = await fetch(`${ASAAS_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY!,
    },
    body: JSON.stringify({ billingType: "PIX", ...input }),
  });
  if (!res.ok) throw new Error(`Asaas payments: ${res.status}`);
  return res.json();
}

/** Cria a assinatura mensal recorrente (POST /subscriptions). */
export async function criarAssinatura(input: {
  customer: string;
  value: number;
  description?: string;
}): Promise<AsaasSubscription> {
  // 1ª cobrança vence amanhã (dá tempo de o aluno pagar o PIX de matrícula).
  const nextDueDate = new Date(Date.now() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  if (!temCredenciais()) {
    return {
      id: `sub_mock_${Date.now()}`,
      customer: input.customer,
      value: input.value,
      cycle: "MONTHLY",
      nextDueDate,
      status: "ACTIVE",
    };
  }

  const res = await fetch(`${ASAAS_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY!,
    },
    body: JSON.stringify({
      customer: input.customer,
      billingType: "PIX",
      cycle: "MONTHLY",
      value: input.value,
      nextDueDate,
      description: input.description,
    }),
  });
  if (!res.ok) throw new Error(`Asaas subscriptions: ${res.status}`);
  return res.json();
}

/** Busca a 1ª cobrança gerada pela assinatura (GET /subscriptions/{id}/payments). */
export async function primeiraCobrancaAssinatura(
  subscriptionId: string,
): Promise<AsaasCharge> {
  if (!temCredenciais()) {
    const id = `pay_mock_${Date.now()}`;
    return {
      id,
      customer: "",
      value: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      billingType: "PIX",
      invoiceUrl: `https://asaas.com/c/${id}`,
      status: "PENDING",
    };
  }

  const res = await fetch(
    `${ASAAS_BASE}/subscriptions/${subscriptionId}/payments`,
    { headers: { access_token: process.env.ASAAS_API_KEY! } },
  );
  if (!res.ok) throw new Error(`Asaas subscription payments: ${res.status}`);
  const data = (await res.json()) as { data: AsaasCharge[] };
  return data.data[0];
}

/** Mensagem pronta para o link de pagamento via WhatsApp. */
export function linkPagamentoWhatsApp(
  telefone: string,
  nome: string,
  invoiceUrl: string,
): string {
  const fone = telefone.replace(/\D/g, "");
  const texto = encodeURIComponent(
    `Olá ${nome}! Aqui está o link para concluir sua matrícula na Coliseu Team 💪\n${invoiceUrl}`,
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
}): Promise<AsaasMatricula> {
  if (!temCredenciais()) {
    const cobrancaId = `pay_mock_${input.codigo.toLowerCase()}`;
    return {
      customerId: `cus_mock_${input.id}`,
      assinaturaId: `sub_mock_${input.id}`,
      cobrancaId,
      linkPagamento: `https://asaas.com/c/${cobrancaId}`,
    };
  }

  const cliente = await criarOuLocalizarCliente({
    name: input.nome,
    mobilePhone: (input.telefone ?? "").replace(/\D/g, ""),
    email: input.email,
    cpfCnpj: (input.cpf ?? "").replace(/\D/g, "") || undefined,
  });
  const assinatura = await criarAssinatura({
    customer: cliente.id,
    value: input.valorMensal,
    description: `Plano ${input.planoNome} — Coliseu Team`,
  });
  const cobranca = await primeiraCobrancaAssinatura(assinatura.id);
  return {
    customerId: cliente.id,
    assinaturaId: assinatura.id,
    cobrancaId: cobranca.id,
    linkPagamento: cobranca.invoiceUrl,
  };
}
