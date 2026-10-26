import type { Membership, Payment, Person, Plan } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as apiReal from "@/lib/cloudgym/api";
import { CloudgymError, type CgCliente, type CgContrato, type CgNovoCliente, type CgParcela } from "@/lib/cloudgym/api";
import { mesesDoPlano, valorTotalDoPlano } from "@/lib/billing/parcelamento";
import { notificarAdmins } from "@/lib/notificacoes";

/**
 * Espelho Coliseu → CloudGym, só de ida, até o corte (26/01/2027). Rede de
 * segurança: se for preciso voltar ao CloudGym, alunos, contratos e
 * pagamentos feitos no Coliseu estão lá.
 *
 * O gatilho é o PAGAMENTO, não a matrícula: o CloudGym ainda manda na
 * catraca, e contrato com parcela em aberto deixa o cliente "overdue" lá.
 * Então o contrato só nasce quando o primeiro pagamento entra, e cada parcela
 * recebida no Coliseu dá baixa na parcela aberta mais antiga do contrato.
 *
 * Regras (testadas na API em 26/10/2026):
 * - cliente novo só existe com contrato (POST /customer exige plano);
 * - o valor de cada parcela é o preço do plano ÷ parcelas — pago a menos
 *   vira desconto na baixa, para não sobrar resto em aberto;
 * - CloudGym aceita cliente duplicado: o vínculo fica aqui, e antes de criar
 *   procura o CPF lá;
 * - matrícula de antes do espelho (veio do CloudGym) recebe na parcela aberta
 *   do contrato que já existe lá; matrícula nova só usa contrato próprio (ou
 *   um do mesmo plano que a recepção lançou à mão depois dela).
 */

export type ApiCloudgym = Pick<
  typeof apiReal,
  "obterCliente" | "buscarPorCpf" | "criarCliente" | "criarContrato" | "receberParcela" | "cancelarContrato" | "criarPlano"
>;

export type ModoEspelho = "ativo" | "simular" | "desligado";

const MAX_TENTATIVAS = 5;
const POR_RODADA = 30;

export function modoEspelho(agora = new Date()): ModoEspelho {
  const ate = new Date(process.env.CLOUDGYM_ESPELHO_ATE || "2027-01-27T03:00:00Z");
  if (agora >= ate) return "desligado";
  const m = process.env.CLOUDGYM_ESPELHO;
  if (m === "ativo" && !process.env.CLOUDGYM_ESPELHO_DESDE) return "simular";
  return m === "ativo" || m === "simular" ? m : "desligado";
}

/** Só o que aconteceu no Coliseu a partir daqui vai para o CloudGym. */
export function espelhoDesde(): Date {
  return new Date(process.env.CLOUDGYM_ESPELHO_DESDE || "2100-01-01");
}

// ---------- regras puras ----------

/** Data civil em São Paulo (YYYY-MM-DD), como o CloudGym espera. */
export function dataBR(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Forma de baixa no CloudGym. Cartão exige bandeira; sem ela, "outros". */
export function formaCloudgym(billingType: string): { forma: string; cartao?: string } {
  switch (billingType) {
    case "BALCAO:pix":
    case "PIX": return { forma: "PIXA" };
    case "BOLETO": return { forma: "BL" };
    case "BALCAO:debito":
    case "DEBIT_CARD": return { forma: "ECD", cartao: "outros" };
    case "BALCAO:credito":
    case "CREDIT_CARD": return { forma: "ECC", cartao: "outros" };
    default: return { forma: "DN" };
  }
}

/** Valor da baixa: pago a menos vira baixa parcial com desconto; igual ou a mais, baixa cheia. */
export function valorDaBaixa(pago: number, parcela: number): number | undefined {
  return pago < parcela - 0.005 ? Math.round(pago * 100) / 100 : undefined;
}

/** Parcelas do contrato: boleto parcelado diz no texto ("Parcela 1 de 12"); assinatura = meses do plano. */
export function parcelasDoContrato(descricao: string | null, ciclo: string | null, plano: Pick<Plan, "duracaoDias">): number {
  const m = ciclo === "INSTALLMENT" ? descricao?.match(/Parcela \d+ de (\d+)/) : null;
  return m ? Number(m[1]) : mesesDoPlano(plano.duracaoDias);
}

const PARCELA_FECHADA = new Set(["paid", "canceled"]);

export function parcelaAberta(c: CgContrato): CgParcela | null {
  return (
    c.payments
      .filter((p) => !PARCELA_FECHADA.has(p.status ?? ""))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
  );
}

const CONTRATO_ENCERRADO = new Set(["canceled", "finished"]);

/** Cadastro do Coliseu no formato do CloudGym — campo que não passa na validação de lá fica de fora. */
export function dadosDoCliente(p: Person): CgNovoCliente {
  const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const fone = so(p.telefone);
  const celular =
    fone.length === 10 || fone.length === 11 ? `+55${fone}`
    : fone.startsWith("55") && (fone.length === 12 || fone.length === 13) ? `+${fone}`
    : undefined;
  const cpf = so(p.cpf);
  const email = (p.email ?? "").trim();
  const endereco = [p.rua, p.numero].filter(Boolean).join(", ");
  return {
    name: p.nome.trim().slice(0, 60),
    ...(cpf.length === 11 && { cpf }),
    ...(email && email.length <= 60 && email.includes("@") && { email }),
    ...(celular && { cellPhoneNumber: celular }),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(p.dataNascimento ?? "") && { birthDay: p.dataNascimento! }),
    ...((p.genero === "M" || p.genero === "F") && { gender: p.genero }),
    ...(p.cep && { zipCode: p.cep.slice(0, 14) }),
    ...(endereco && { address: endereco.slice(0, 100) }),
    ...(p.cidade && { city: p.cidade.slice(0, 45) }),
    ...(p.estado && { state: p.estado.slice(0, 25) }),
    ...(p.rg && p.rg.length <= 12 && { rg: p.rg }),
    extId: p.codigo.slice(0, 10),
  };
}

// ---------- vínculos ----------

type Tipo = "pessoa" | "plano" | "contrato" | "pagamento" | "cancelamento";

async function vinculo(tipo: Tipo, localId: string) {
  return prisma.espelhoCloudgym.findUnique({ where: { tipo_localId: { tipo, localId } } });
}

async function gravar(
  tipo: Tipo,
  localId: string,
  dados: { estado: "feito" | "erro" | "ignorado"; cloudgymId?: number | null; detalhe?: string | null },
) {
  return prisma.espelhoCloudgym.upsert({
    where: { tipo_localId: { tipo, localId } },
    create: { tipo, localId, ...dados, tentativas: dados.estado === "erro" ? 1 : 0 },
    update: { ...dados, ...(dados.estado === "erro" && { tentativas: { increment: 1 } }) },
  });
}

// ---------- passos ----------

async function garantirPlano(api: ApiCloudgym, plano: Plan): Promise<number> {
  if (plano.legacyCloudgymId) return plano.legacyCloudgymId;
  const v = await vinculo("plano", plano.id);
  if (v?.estado === "feito" && v.cloudgymId) return v.cloudgymId;
  const id = await api.criarPlano({
    name: plano.nome,
    price: valorTotalDoPlano(plano),
    duration: mesesDoPlano(plano.duracaoDias),
  });
  await gravar("plano", plano.id, { estado: "feito", cloudgymId: id, detalhe: "criado pelo espelho" });
  return id;
}

/** Id do aluno no CloudGym, se ele já existe lá (legado, vínculo ou CPF). */
async function membroExistente(api: ApiCloudgym, p: Person): Promise<number | null> {
  if (p.legacyCloudgymId) return p.legacyCloudgymId;
  const v = await vinculo("pessoa", p.id);
  if (v?.estado === "feito" && v.cloudgymId) return v.cloudgymId;
  const cpf = (p.cpf ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return null;
  const achados = await api.buscarPorCpf(cpf);
  if (achados.length !== 1) return null;
  await gravar("pessoa", p.id, { estado: "feito", cloudgymId: achados[0].id, detalhe: "achado pelo CPF" });
  return achados[0].id;
}

type PagamentoComTudo = Payment & {
  person: Person;
  subscription: { cycle: string } | null;
};

/** Lança um pagamento recebido no Coliseu. Devolve o que foi feito (vai no `detalhe`). */
async function espelharPagamento(api: ApiCloudgym, pg: PagamentoComTudo, desde: Date): Promise<{ parcela: number | null; detalhe: string }> {
  const matricula = (await prisma.membership.findFirst({
    where: { personId: pg.person.id },
    orderBy: { matriculadoEm: "desc" },
    include: { plan: true },
  })) as (Membership & { plan: Plan }) | null;
  if (!matricula) return { parcela: null, detalhe: "ignorado: aluno sem matrícula" };

  const planoCg = await garantirPlano(api, matricula.plan);
  const parcelas = parcelasDoContrato(pg.descricao, pg.subscription?.cycle ?? null, matricula.plan);
  const vContrato = await vinculo("contrato", matricula.id);
  // 1º contrato da matrícula começa nela; os seguintes (renovação mensal), no vencimento pago.
  const inicio = dataBR(vContrato ? pg.dueDate : matricula.matriculadoEm);
  const novaMatricula = matricula.matriculadoEm >= desde;

  let memberId = await membroExistente(api, pg.person);
  let contratoId: number | null = null;
  let como = "";

  if (!memberId) {
    const r = await api.criarCliente(dadosDoCliente(pg.person), { plano: planoCg, inicio, parcelas });
    memberId = r.id;
    contratoId = r.contractId;
    await gravar("pessoa", pg.person.id, { estado: "feito", cloudgymId: r.id, detalhe: "criado pelo espelho" });
    await gravar("contrato", matricula.id, { estado: "feito", cloudgymId: r.contractId });
    como = `cliente ${r.id} e contrato ${r.contractId} criados`;
  }

  let cliente: CgCliente = await api.obterCliente(memberId);

  if (!contratoId) {
    const vivos = cliente.contracts.filter((c) => !CONTRATO_ENCERRADO.has(c.status));
    let alvo: CgContrato | undefined;
    if (vContrato?.cloudgymId) {
      alvo = vivos.find((c) => c.id === vContrato.cloudgymId && parcelaAberta(c));
    } else if (!novaMatricula) {
      // Matrícula que veio do CloudGym: a parcela aberta mais antiga de lá.
      alvo = vivos
        .filter((c) => parcelaAberta(c))
        .sort((a, b) => parcelaAberta(a)!.dueDate.localeCompare(parcelaAberta(b)!.dueDate))[0];
    } else {
      // A recepção pode ter lançado à mão: contrato do mesmo plano criado depois da matrícula.
      const umDiaAntes = dataBR(new Date(matricula.matriculadoEm.getTime() - 86_400_000));
      const daRecepcao = vivos.find((c) => c.plan === planoCg && c.creationDate.slice(0, 10) >= umDiaAntes);
      if (daRecepcao) {
        await gravar("contrato", matricula.id, { estado: "feito", cloudgymId: daRecepcao.id, detalhe: "lançado pela recepção" });
        if (!parcelaAberta(daRecepcao)) return { parcela: null, detalhe: `já pago no CloudGym (contrato ${daRecepcao.id})` };
        alvo = daRecepcao;
      }
    }
    if (alvo) {
      contratoId = alvo.id;
      como = `contrato ${alvo.id} existente`;
    } else {
      contratoId = await api.criarContrato(memberId, { plano: planoCg, inicio, parcelas });
      await gravar("contrato", matricula.id, { estado: "feito", cloudgymId: contratoId });
      como = `contrato ${contratoId} criado (${parcelas}x)`;
      cliente = await api.obterCliente(memberId);
    }
  } else {
    cliente = await api.obterCliente(memberId);
  }

  const contrato = cliente.contracts.find((c) => c.id === contratoId);
  const parcela = contrato ? parcelaAberta(contrato) : null;
  if (!parcela) throw new CloudgymError(409, `contrato ${contratoId} sem parcela em aberto`);
  const forma = formaCloudgym(pg.billingType);
  const valor = valorDaBaixa(pg.value, parcela.amount);
  await api.receberParcela(parcela.id, { ...forma, valor });
  return {
    parcela: parcela.id,
    detalhe: `${como}; parcela ${parcela.id} recebida (${forma.forma}${valor !== undefined ? `, R$ ${valor} com desconto` : ""})`,
  };
}

export interface ResumoEspelho {
  modo: ModoEspelho;
  pendentes: number;
  feitos: number;
  erros: number;
  cancelados: number;
}

async function avisarFalha(titulo: string, corpo: string, chave: string) {
  await notificarAdmins({ tipo: "cloudgym_espelho_falhou", titulo, corpo, url: "/cobranca", chave }).catch((e) =>
    console.error("[espelho cloudgym] aviso falhou:", e),
  );
}

/** Uma rodada: pagamentos novos e matrículas canceladas. Idempotente. */
export async function rodarEspelho(opts: { api?: ApiCloudgym; agora?: Date } = {}): Promise<ResumoEspelho> {
  const api = opts.api ?? apiReal;
  const agora = opts.agora ?? new Date();
  const modo = modoEspelho(agora);
  const resumo: ResumoEspelho = { modo, pendentes: 0, feitos: 0, erros: 0, cancelados: 0 };
  if (modo === "desligado") return resumo;
  const desde = espelhoDesde();

  // Mensalidade/parcela de contrato (com assinatura ou parcelamento). Avulsa (taxa, produto) fica de fora.
  const candidatos = await prisma.payment.findMany({
    where: { status: "PAID", paidAt: { gte: desde }, personId: { not: null }, subscriptionId: { not: null } },
    include: { person: true, subscription: { select: { cycle: true } } },
    orderBy: { paidAt: "asc" },
    take: 200,
  });
  const vistos = await prisma.espelhoCloudgym.findMany({
    where: { tipo: "pagamento", localId: { in: candidatos.map((c) => c.id) } },
  });
  const porId = new Map(vistos.map((v) => [v.localId, v]));
  const fila = candidatos
    .filter((c) => {
      const v = porId.get(c.id);
      return !v || (v.estado === "erro" && v.tentativas < MAX_TENTATIVAS);
    })
    .slice(0, POR_RODADA) as PagamentoComTudo[];
  resumo.pendentes = fila.length;

  if (modo === "simular") {
    if (fila.length) console.log(`[espelho cloudgym] (simulação) ${fila.length} pagamento(s) seriam lançados`);
    return resumo;
  }

  for (const pg of fila) {
    try {
      const r = await espelharPagamento(api, pg, desde);
      await gravar("pagamento", pg.id, {
        estado: r.detalhe.startsWith("ignorado") ? "ignorado" : "feito",
        cloudgymId: r.parcela,
        detalhe: r.detalhe,
      });
      resumo.feitos++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumo.erros++;
      // Sem login não adianta seguir: avisa uma vez por dia e para a rodada.
      if (e instanceof CloudgymError && e.status === 401) {
        await avisarFalha("Espelho CloudGym parado", msg, `cloudgym_login:${dataBR(agora)}`);
        return resumo;
      }
      const v = await gravar("pagamento", pg.id, { estado: "erro", detalhe: msg.slice(0, 500) });
      if (v.tentativas === 1 || v.tentativas === MAX_TENTATIVAS) {
        await avisarFalha(
          `Espelho CloudGym: pagamento de ${pg.person.nome} não foi lançado`,
          `${msg}${v.tentativas === MAX_TENTATIVAS ? " — desisti depois de 5 tentativas; lance à mão no CloudGym." : " — tento de novo em 10 min."}`,
          `cloudgym_pg:${pg.id}:${v.tentativas}`,
        );
      }
    }
  }

  // Matrícula cancelada no Coliseu: cancela o contrato que o espelho lançou.
  const contratos = await prisma.espelhoCloudgym.findMany({ where: { tipo: "contrato", estado: "feito" } });
  if (contratos.length) {
    const canceladas = await prisma.membership.findMany({
      where: { id: { in: contratos.map((c) => c.localId) }, status: "CANCELED" },
      select: { id: true },
    });
    for (const m of canceladas) {
      const ja = await vinculo("cancelamento", m.id);
      if (ja && (ja.estado === "feito" || ja.tentativas >= MAX_TENTATIVAS)) continue;
      const c = contratos.find((x) => x.localId === m.id)!;
      try {
        await api.cancelarContrato(c.cloudgymId!, dataBR(agora), "Cancelado no Coliseu");
        await gravar("cancelamento", m.id, { estado: "feito", cloudgymId: c.cloudgymId });
        resumo.cancelados++;
      } catch (e) {
        await gravar("cancelamento", m.id, { estado: "erro", detalhe: String(e instanceof Error ? e.message : e).slice(0, 500) });
        resumo.erros++;
      }
    }
  }
  return resumo;
}
