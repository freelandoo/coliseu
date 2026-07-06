import type {
  Plano,
  Pessoa,
  Cobranca,
  Despesa,
  Origem,
  LeadEstagio,
  PessoaFase,
  AlunoStatus,
  CobrancaTipo,
  CobrancaStatus,
} from "@/lib/types";
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
    duracaoMeses: p.duracaoMeses,
    ativo: p.ativo,
    descricao: p.descricao ?? undefined,
  };
}

export function toPessoa(p: PPerson & { memberships: PMembership[] }): Pessoa {
  const m = p.memberships[0];
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    telefone: p.telefone ?? undefined,
    email: p.email ?? undefined,
    cpf: p.cpf ?? undefined,
    origem: p.origem as Origem,
    fase: p.fase as PessoaFase,
    criadoEm: p.criadoEm.toISOString(),
    estagio: (p.estagio ?? undefined) as LeadEstagio | undefined,
    motivoPerdido: p.motivoPerdido ?? undefined,
    planoId: m?.planId,
    status: m ? membershipToStatus(m.status) : undefined,
    matriculadoEm: m?.matriculadoEm.toISOString(),
    vencimentoPlano: m?.vencimentoPlano.toISOString(),
    ultimaPresenca: m?.ultimaPresenca.toISOString(),
    dataNascimento: p.dataNascimento ?? undefined,
    endereco:
      p.cep || p.cidade
        ? {
            cep: p.cep ?? undefined,
            estado: p.estado ?? undefined,
            cidade: p.cidade ?? undefined,
            rua: p.rua ?? undefined,
            numero: p.numero ?? undefined,
          }
        : undefined,
  };
}

function membershipToStatus(s: PMembership["status"]): AlunoStatus {
  switch (s) {
    case "ACTIVE":
      return "ativo";
    case "PENDING_PAYMENT":
      return "pendente";
    case "CANCELED":
      return "cancelado";
    case "SUSPENDED":
    case "EXPIRED":
    default:
      return "inadimplente";
  }
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
