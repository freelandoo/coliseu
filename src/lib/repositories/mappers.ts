import type {
  Plano,
  Pessoa,
  Cobranca,
  Despesa,
  Origem,
  LeadEstagio,
  PessoaFase,
  CobrancaTipo,
  CobrancaStatus,
} from "@/lib/types";
import { ehIdAsaasReal } from "@/lib/asaas";
import { diasDesde, situacaoDoAluno } from "@/lib/billing/regua";
import type {
  Plan as PPlan,
  Person as PPerson,
  Membership as PMembership,
  Cobranca as PCobranca,
  Despesa as PDespesa,
} from "@prisma/client";

export function toPlano(p: PPlan): Plano {
  return {
    id: p.id,
    nome: p.nome,
    valorMensal: p.valorMensal,
    duracaoDias: p.duracaoDias,
    ativo: p.ativo,
    descricao: p.descricao ?? undefined,
    mesclado: Boolean(p.mescladoEmId),
  };
}

type MembershipComAutor = PMembership & { matriculadoPor?: { nome: string } | null };
type ParcelaAberta = { dueDate: Date; value: number; invoiceUrl: string | null };

export function toPessoa(
  p: PPerson & {
    memberships: MembershipComAutor[];
    payments?: ParcelaAberta[];
    billingCustomer?: { subscriptions: { asaasSubscriptionId: string }[] } | null;
  },
): Pessoa {
  const m = p.memberships[0];
  const parcela = p.payments?.[0];
  const diasAtraso = parcela ? diasDesde(parcela.dueDate) : null;
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    telefone: p.telefone ?? undefined,
    email: p.email ?? undefined,
    cpf: p.cpf ?? undefined,
    rg: p.rg ?? undefined,
    vendedor: p.vendedor ?? undefined,
    origem: p.origem as Origem,
    fase: p.fase as PessoaFase,
    criadoEm: p.criadoEm.toISOString(),
    estagio: (p.estagio ?? undefined) as LeadEstagio | undefined,
    motivoPerdido: p.motivoPerdido ?? undefined,
    planoId: m?.planId,
    status: m
      ? situacaoDoAluno({
          matricula: m.status,
          diasAtrasoParcela: diasAtraso,
          diasAposVencimentoPlano: diasDesde(m.vencimentoPlano),
          renovaSozinho: (p.billingCustomer?.subscriptions ?? []).some((s) => ehIdAsaasReal(s.asaasSubscriptionId)),
        })
      : undefined,
    parcelaAberta: parcela
      ? {
          vencimento: parcela.dueDate.toISOString(),
          valor: parcela.value,
          diasAtraso: diasAtraso!,
          link: parcela.invoiceUrl ?? undefined,
        }
      : undefined,
    matriculadoEm: m?.matriculadoEm.toISOString(),
    matriculadoPor: m?.matriculadoPor?.nome ?? undefined,
    vencimentoPlano: m?.vencimentoPlano.toISOString(),
    ultimaPresenca: m?.ultimaPresenca.toISOString(),
    dataNascimento: p.dataNascimento ?? undefined,
    // Qualquer parte do endereço conta: rua e número sem CEP ainda são endereço.
    endereco:
      p.cep || p.estado || p.cidade || p.rua || p.numero
        ? {
            cep: p.cep ?? undefined,
            estado: p.estado ?? undefined,
            cidade: p.cidade ?? undefined,
            rua: p.rua ?? undefined,
            numero: p.numero ?? undefined,
          }
        : undefined,
    freelandoo:
      p.freelandooEstado && p.freelandooEstado !== "sem_conta"
        ? {
            estado: p.freelandooEstado,
            fotoUrl: p.freelandooFotoUrl ?? undefined,
            treinoNome: p.freelandooTreinoNome ?? undefined,
            treinoVenceEm: p.freelandooTreinoVenceEm?.toISOString(),
            treinoValidadeDias: p.freelandooTreinoValidadeDias ?? undefined,
            treinoPropostaPendente: p.freelandooTreinoPropostaPendente || undefined,
          }
        : undefined,
  };
}

export function toCobranca(c: PCobranca): Cobranca {
  return {
    id: c.id,
    alunoId: c.personId,
    tipo: c.tipo as CobrancaTipo,
    valor: c.valor,
    vencimento: c.vencimento.toISOString(),
    status: c.status as CobrancaStatus,
    asaasId: c.asaasId ?? null,
    assinaturaId: c.assinaturaId ?? undefined,
    linkPagamento: c.linkPagamento ?? undefined,
  };
}

export function toDespesa(d: PDespesa): Despesa {
  return {
    id: d.id,
    categoria: d.categoria,
    descricao: d.descricao ?? undefined,
    valor: d.valor,
    data: d.data.toISOString(),
    recorrente: d.recorrente,
  };
}
