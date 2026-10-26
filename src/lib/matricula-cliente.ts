/**
 * Matrícula vista da tela: criar a pessoa (se for nova) e matricular, com o
 * desfecho de cada passo dito separadamente.
 *
 * Os dois passos são duas requisições. O que este módulo garante:
 *
 * - Pessoa criada (POST confirmado) tem o id guardado em `idConfirmado`. Se a
 *   matrícula falhar depois, o próximo clique matricula ESSA pessoa — não
 *   cria outra.
 * - Resultado desconhecido (rede, tempo, 5xx sem explicação, JSON fora do
 *   combinado) não é repetido aqui nem vira sucesso: a cobrança pode ter sido
 *   gerada.
 * - Pagamento confirmado não sai daqui: a matrícula nasce pendente, e só o
 *   webhook ou o balcão confirmam pagamento.
 *
 * Não é idempotência durável: outra aba, um reload ou uma resposta perdida
 * podem repetir a operação. É só a mesma tela não duplicando o próprio trabalho.
 */
import { lerResultado, sinalDeTempo, temId, type Resultado } from "@/lib/operacao";
import type { AlteracoesCadastro } from "@/lib/cadastro";
import type { NovaPessoa } from "@/lib/types";
import type { FormaCobranca } from "@/lib/billing/parcelamento";

type Buscar = (url: string, init: RequestInit) => Promise<Response>;

export interface MatriculaRegistrada {
  id: string;
  linkPagamento?: string;
  waLink?: string;
  status?: string;
  /** Boleto parcelado: quantos boletos e o valor de cada um. */
  parcelas?: number;
  valorParcela?: number;
}

function ehMatricula(v: unknown): v is MatriculaRegistrada {
  return temId(v);
}

export type DesfechoMatricula =
  | { tipo: "registrada"; personId: string; dados: MatriculaRegistrada }
  /** Cadastro ficou como estava (ou foi salvo), mas a matrícula não aconteceu. */
  | { tipo: "falha-cadastro"; erro: string }
  | { tipo: "falha-matricula"; personId: string; erro: string; pessoaCriadaAgora: boolean }
  | { tipo: "desconhecido-cadastro" }
  | { tipo: "desconhecido-matricula"; personId: string };

export async function criarPessoa(nova: NovaPessoa, buscar: Buscar = fetch): Promise<Resultado<{ id: string }>> {
  return lerResultado(
    buscar("/api/pessoas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nova),
      signal: sinalDeTempo(),
    }),
    temId,
    "Não foi possível cadastrar.",
  );
}

/**
 * Cria (se preciso) e matricula. `idConfirmado` é o id de uma pessoa que esta
 * tela já criou numa tentativa anterior; `pessoaId`, o de quem já existia.
 */
export async function executarMatricula(
  entrada: {
    pessoaId?: string;
    idConfirmado?: string | null;
    nova?: NovaPessoa;
    alteracoes: AlteracoesCadastro;
    planoId: string;
    /** Sem isso, assinatura mensal (o padrão do servidor). */
    formaCobranca?: FormaCobranca;
  },
  buscar: Buscar = fetch,
): Promise<DesfechoMatricula> {
  let personId = entrada.pessoaId ?? entrada.idConfirmado ?? null;
  let criadaAgora = false;

  if (!personId) {
    if (!entrada.nova) return { tipo: "falha-cadastro", erro: "Dados do cadastro ausentes." };
    const r = await criarPessoa(entrada.nova, buscar);
    if (r.tipo === "falha") return { tipo: "falha-cadastro", erro: r.erro };
    if (r.tipo === "desconhecido") return { tipo: "desconhecido-cadastro" };
    personId = r.dados.id;
    criadaAgora = true;
  }

  const m = await lerResultado(
    buscar(`/api/pessoas/${encodeURIComponent(personId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Só o que a pessoa mudou vai junto — o resto da ficha fica como está.
      body: JSON.stringify({
        acao: "matricular",
        planoId: entrada.planoId,
        ...(entrada.formaCobranca && { formaCobranca: entrada.formaCobranca }),
        ...entrada.alteracoes,
      }),
      signal: sinalDeTempo(),
    }),
    ehMatricula,
    "Não foi possível registrar a matrícula.",
  );
  if (m.tipo === "ok") return { tipo: "registrada", personId, dados: m.dados };
  if (m.tipo === "falha") {
    return { tipo: "falha-matricula", personId, erro: m.erro, pessoaCriadaAgora: criadaAgora };
  }
  return { tipo: "desconhecido-matricula", personId };
}

/** O id que a tela deve guardar depois de um desfecho (para não recriar a pessoa). */
export function idParaGuardar(d: DesfechoMatricula): string | null {
  return "personId" in d ? d.personId : null;
}
