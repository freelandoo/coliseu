import { prisma } from "@/lib/db";
import { ehIdAsaasReal, pausarAvisosAsaas } from "@/lib/asaas";
import { PREFIXO_PARCELA_BALCAO } from "@/lib/billing/parcelamento";
import { carregarContextoAcesso } from "@/lib/access/context";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { modoExpiracao } from "@/lib/billing/expiracao";
import { AVISO_ANTES_DIAS, COBRANCA_AUTOMATICA_ATE_DIAS, diasDesde } from "@/lib/billing/regua";

/**
 * A régua de cobrança rodando (agendador, de hora em hora). Ver `regua.ts`.
 *
 * O Asaas não conta quando um aviso saiu (nem API nem webhook): o registro dos
 * automáticos é deduzido — a parcela está no Asaas, o aviso daquela etapa está
 * ligado e o dia dele chegou. `ok:false` marca o que não tinha como sair
 * (aluno sem e-mail e sem celular), e é isso que fica vermelho na ficha.
 */

/** Quanto tempo o registro de cobranças fica guardado. */
export const GUARDA_ENVIOS_DIAS = 90;

/** Etapas automáticas: dias desde o vencimento em que o Asaas avisa. */
export const ETAPAS = [
  { etapa: "antes_5", dia: -AVISO_ANTES_DIAS, rotulo: `${AVISO_ANTES_DIAS} dias antes` },
  { etapa: "vencimento", dia: 0, rotulo: "no dia do vencimento" },
  { etapa: "vencida", dia: 1, rotulo: "vencida" },
  { etapa: "vencida_7", dia: COBRANCA_AUTOMATICA_ATE_DIAS, rotulo: `${COBRANCA_AUTOMATICA_ATE_DIAS} dias depois` },
] as const;

export const ROTULO_ETAPA: Record<string, string> = {
  ...Object.fromEntries(ETAPAS.map((e) => [e.etapa, e.rotulo])),
  manual: "manual",
};

const ABERTA = { status: { in: ["PENDING" as const, "OVERDUE" as const] } };
const UM_DIA = 86_400_000;

function temContato(p: { email: string | null; telefone: string | null }): boolean {
  return Boolean(p.email?.includes("@") || (p.telefone ?? "").replace(/\D/g, "").length >= 10);
}

/** Pausa os avisos de quem passou de 7 dias e religa de quem quitou. */
async function sincronizarPausas(agora: Date): Promise<{ pausados: number; religados: number; erros: number }> {
  const r = { pausados: 0, religados: 0, erros: 0 };
  const clientes = await prisma.billingCustomer.findMany({
    select: {
      id: true,
      asaasCustomerId: true,
      avisosPausados: true,
      person: { select: { payments: { where: ABERTA, orderBy: { dueDate: "asc" }, take: 1, select: { dueDate: true } } } },
    },
  });
  for (const c of clientes) {
    if (!ehIdAsaasReal(c.asaasCustomerId)) continue;
    const parcela = c.person.payments[0];
    const pausar = parcela ? diasDesde(parcela.dueDate, agora) > COBRANCA_AUTOMATICA_ATE_DIAS : false;
    if (pausar === c.avisosPausados) continue;
    try {
      await pausarAvisosAsaas(c.asaasCustomerId, pausar);
      await prisma.billingCustomer.update({ where: { id: c.id }, data: { avisosPausados: pausar } });
      if (pausar) r.pausados++;
      else r.religados++;
    } catch (e) {
      r.erros++;
      console.error("[regua] pausa dos avisos falhou:", c.asaasCustomerId, e);
    }
  }
  return r;
}

/** Registra os avisos automáticos cujo dia chegou (idempotente pela `chave`). */
async function registrarAutomaticos(agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() - GUARDA_ENVIOS_DIAS * UM_DIA);
  const parcelas = await prisma.payment.findMany({
    where: { ...ABERTA, personId: { not: null }, dueDate: { gte: limite, lte: new Date(agora.getTime() + AVISO_ANTES_DIAS * UM_DIA) } },
    select: {
      id: true,
      asaasPaymentId: true,
      dueDate: true,
      createdAt: true,
      personId: true,
      person: { select: { email: true, telefone: true } },
    },
  });
  let criados = 0;
  for (const p of parcelas) {
    if (!ehIdAsaasReal(p.asaasPaymentId) || !p.person || !p.personId) continue;
    const atraso = diasDesde(p.dueDate, agora);
    const contato = temContato(p.person);
    for (const e of ETAPAS) {
      if (atraso < e.dia) continue;
      // Parcela criada depois do dia do aviso não recebeu esse aviso.
      if (diasDesde(p.createdAt, agora) < atraso - e.dia) continue;
      const dados = {
        personId: p.personId,
        paymentId: p.id,
        origem: "automatica",
        etapa: e.etapa,
        canal: "asaas",
        ok: contato,
        detalhe: contato ? null : "Aluno sem e-mail e sem celular: o Asaas não tem para onde mandar.",
        chave: `${p.id}:${e.etapa}`,
      };
      const r = await prisma.cobrancaEnvio.createMany({ data: [dados], skipDuplicates: true });
      criados += r.count;
    }
  }
  return criados;
}

/**
 * Carência acabou (4º dia) ou o plano venceu: a política nega, mas o aparelho
 * ainda tem o ENABLE de antes — nada mais muda no banco para disparar o
 * DISABLE. Só mexe em quem já está no aparelho e cujo último comando liberou.
 * Segue a chave do vencimento automático (EXPIRACAO_MATRICULAS): fora do modo
 * "ativa" só conta quem seria bloqueado — antes do corte, a base adotada do
 * CloudGym tem cobranças desatualizadas e bloquearia aluno em dia.
 */
async function bloquearCarenciaVencida(aplicar: boolean): Promise<number> {
  const ultimos = await prisma.$queryRaw<{ personId: string; type: string }[]>`
    SELECT DISTINCT ON (c."personId", c."deviceId") c."personId", c.type
    FROM "DeviceCommand" c
    WHERE c.type IN ('ENABLE', 'DISABLE') AND c."personId" IS NOT NULL
      AND c.status IN ('PENDING', 'DISPATCHED', 'ACKNOWLEDGED', 'SUCCEEDED')
    ORDER BY c."personId", c."deviceId", c."createdAt" DESC`;
  const liberados = new Set(ultimos.filter((u) => u.type === "ENABLE").map((u) => u.personId));
  let bloqueados = 0;
  for (const personId of liberados) {
    const { ctx } = await carregarContextoAcesso(personId);
    const decisao = evaluateAccessEligibility(ctx);
    if (decisao.allow || decisao.reason === "CORTESIA") continue;
    if (aplicar) await recalcularAcessoDePessoa(personId);
    bloqueados++;
  }
  return bloqueados;
}

export interface ResumoRegua {
  pausados: number;
  religados: number;
  registrados: number;
  apagados: number;
  /** Fora do modo "ativa", quantos SERIAM bloqueados. */
  bloqueados: number;
  erros: number;
}

/** Uma rodada da régua. Idempotente. */
export async function rodarReguaCobranca(agora = new Date()): Promise<ResumoRegua> {
  const pausas = await sincronizarPausas(agora);
  const registrados = await registrarAutomaticos(agora);
  const { count: apagados } = await prisma.cobrancaEnvio.deleteMany({
    where: { criadoEm: { lt: new Date(agora.getTime() - GUARDA_ENVIOS_DIAS * UM_DIA) } },
  });
  const bloqueados = await bloquearCarenciaVencida(modoExpiracao() === "ativa");
  return { ...pausas, registrados, apagados, bloqueados };
}

/* ------------------------------------------------------------------ ficha */

export type CorCobranca = "verde" | "vermelho" | "nenhuma";

export interface EstadoCobranca {
  /** "Cobrança enviada": sim (verde), não por problema (vermelho), não precisa (sem cor). */
  cor: CorCobranca;
  enviada: boolean;
  texto: string;
}

export interface EnvioCobranca {
  id: string;
  quando: string;
  origem: string;
  etapa: string;
  canal: string;
  ok: boolean;
  detalhe: string | null;
  porUsuario: string | null;
}

/** A linha "Cobrança enviada" da ficha + o registro dos últimos 3 meses. */
export async function cobrancaDaPessoa(
  personId: string,
  agora = new Date(),
): Promise<{ estado: EstadoCobranca; envios: EnvioCobranca[]; aluno: { nome: string; telefone: string | null } }> {
  const pessoa = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      nome: true,
      email: true,
      telefone: true,
      billingCustomer: { select: { avisosPausados: true } },
      payments: { where: ABERTA, orderBy: { dueDate: "asc" }, take: 1, select: { id: true, asaasPaymentId: true, dueDate: true } },
      cobrancaEnvios: {
        where: { criadoEm: { gte: new Date(agora.getTime() - GUARDA_ENVIOS_DIAS * UM_DIA) } },
        orderBy: { criadoEm: "desc" },
      },
    },
  });
  if (!pessoa) return { estado: { cor: "nenhuma", enviada: false, texto: "—" }, envios: [], aluno: { nome: "", telefone: null } };

  const envios = pessoa.cobrancaEnvios.map((e) => ({
    id: e.id,
    quando: e.criadoEm.toISOString(),
    origem: e.origem,
    etapa: e.etapa,
    canal: e.canal,
    ok: e.ok,
    detalhe: e.detalhe,
    porUsuario: e.porUsuario,
  }));
  return {
    estado: await estadoDaParcela(pessoa, agora),
    envios,
    aluno: { nome: pessoa.nome, telefone: pessoa.telefone },
  };
}

async function estadoDaParcela(
  pessoa: {
    email: string | null;
    telefone: string | null;
    billingCustomer: { avisosPausados: boolean } | null;
    payments: { id: string; asaasPaymentId: string; dueDate: Date }[];
    cobrancaEnvios: { paymentId: string | null; origem: string; etapa: string; ok: boolean; criadoEm: Date }[];
  },
  agora: Date,
): Promise<EstadoCobranca> {
  const parcela = pessoa.payments[0];
  if (!parcela) return { cor: "nenhuma", enviada: false, texto: "Nada a cobrar agora." };
  const atraso = diasDesde(parcela.dueDate, agora);
  const venc = parcela.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" });

  if (parcela.asaasPaymentId.startsWith(PREFIXO_PARCELA_BALCAO)) {
    return atraso > 0
      ? { cor: "vermelho", enviada: false, texto: `Parcela do balcão de ${venc} vencida: cobre e receba no balcão.` }
      : { cor: "nenhuma", enviada: false, texto: `Próxima parcela do balcão vence ${venc}.` };
  }
  if (!ehIdAsaasReal(parcela.asaasPaymentId)) {
    return atraso > 0
      ? { cor: "vermelho", enviada: false, texto: `Parcela de ${venc} vencida fora do Asaas (CloudGym): cobre manualmente.` }
      : { cor: "nenhuma", enviada: false, texto: `Parcela de ${venc} fora do Asaas (CloudGym).` };
  }
  if (atraso < -AVISO_ANTES_DIAS) {
    const aviso = new Date(parcela.dueDate.getTime() - AVISO_ANTES_DIAS * UM_DIA).toLocaleDateString("pt-BR", { timeZone: "UTC" });
    return { cor: "nenhuma", enviada: false, texto: `Ainda não precisa cobrar: o Asaas avisa em ${aviso} (vence ${venc}).` };
  }
  const falhaWebhook = await prisma.webhookEvent.count({
    where: { paymentId: parcela.asaasPaymentId, processState: { in: ["FAILED", "DEAD_LETTER"] } },
  });
  if (falhaWebhook) return { cor: "vermelho", enviada: false, texto: "O Coliseu não conseguiu processar um aviso do Asaas desta parcela." };
  if (!temContato(pessoa)) {
    return { cor: "vermelho", enviada: false, texto: "Aluno sem e-mail e sem celular: o Asaas não tem para onde mandar a cobrança." };
  }
  if (atraso > COBRANCA_AUTOMATICA_ATE_DIAS) {
    return {
      cor: "vermelho",
      enviada: false,
      texto: `Vencida há ${atraso} dias: o Asaas parou de cobrar (régua de ${COBRANCA_AUTOMATICA_ATE_DIAS} dias). Cobre manualmente.`,
    };
  }
  const ultimo = pessoa.cobrancaEnvios.find((e) => e.paymentId === parcela.id && e.origem === "automatica");
  if (ultimo && !ultimo.ok) return { cor: "vermelho", enviada: false, texto: "O último aviso do Asaas não tinha como sair." };
  if (ultimo) {
    return {
      cor: "verde",
      enviada: true,
      texto: `Sim — Asaas avisou ${ROTULO_ETAPA[ultimo.etapa] ?? ultimo.etapa} (${ultimo.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}).`,
    };
  }
  return { cor: "nenhuma", enviada: false, texto: `Vence ${venc}: o Asaas avisa na próxima etapa da régua.` };
}

/** Envio manual pela recepção (link copiado ou WhatsApp). */
export async function registrarEnvioManual(input: {
  personId: string;
  paymentId?: string | null;
  canal: "link" | "whatsapp";
  porUsuario?: string | null;
}): Promise<void> {
  await prisma.cobrancaEnvio.create({
    data: {
      personId: input.personId,
      paymentId: input.paymentId ?? null,
      origem: "manual",
      etapa: "manual",
      canal: input.canal,
      porUsuario: input.porUsuario ?? null,
    },
  });
}
