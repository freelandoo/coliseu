/**
 * Client HTTP da API de parceiro da Freelandoo (`/partner/v1`) — o Coliseu
 * chamando a Freelandoo (o sentido contrário da Gym Provider API em
 * `provider.ts`, que continua igual).
 *
 * Nunca lança: toda falha vira um `erro` tipado, para a fila decidir se
 * repete (transitório), para tudo (chave inválida) ou desiste (dado ruim).
 * Sem `FREELANDOO_API_URL`/`FREELANDOO_PARTNER_KEY` → "nao_configurado".
 */

const TIMEOUT_MS = 10_000;

export type EstadoMembro = "aguardando_aceite" | "ativa";

export interface TreinoMembro {
  nome: string;
  criado_em: string;
  validade_dias: number;
  vence_em: string;
}

export interface ItemMembro {
  id_user: string;
  cpf: string;
  ref_externa: string | null;
  estado: EstadoMembro;
  avatar_url: string | null;
  treino: TreinoMembro | null;
}

export type CriarMembroResposta =
  | { status: "criado"; id_user: string; estado: "aguardando_aceite"; link_primeiro_acesso: string; expira_em: string }
  | { status: "vinculado"; id_user: string; estado: EstadoMembro };

export interface LinkResposta {
  link_primeiro_acesso: string;
  expira_em: string;
}

export interface PaginaMembros {
  itens: ItemMembro[];
  proximo_cursor: string | null;
}

/** Códigos estáveis do contrato + os do lado de cá. */
export type ErroFreelandoo =
  | "nao_configurado"
  | "chave_invalida"
  | "transitorio"
  | "cpf_invalido"
  | "dados_incompletos"
  | "menor_de_idade"
  | "email_em_uso"
  | "ja_aceito"
  | "nao_encontrado"
  | "inesperado";

export type RespostaFreelandoo<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: ErroFreelandoo; status?: number; detalhe?: string };

const CODIGOS_CONHECIDOS: ReadonlySet<string> = new Set([
  "chave_invalida", "cpf_invalido", "dados_incompletos", "menor_de_idade",
  "email_em_uso", "ja_aceito", "nao_encontrado",
]);

export interface ConfigFreelandoo {
  url: string;
  chave: string;
}

export function configFreelandoo(env: Record<string, string | undefined> = process.env): ConfigFreelandoo | null {
  const url = (env.FREELANDOO_API_URL ?? "").trim().replace(/\/+$/, "");
  const chave = (env.FREELANDOO_PARTNER_KEY ?? "").trim();
  if (!url || !chave) return null;
  return { url, chave };
}

export function freelandooConfigurado(): boolean {
  return configFreelandoo() !== null;
}

/**
 * Status HTTP + corpo → erro tipado. Exportada para teste.
 * 401/403 = chave inválida (para a fila); 5xx/429/408 = transitório.
 */
export function erroDaResposta(status: number, corpo: unknown): ErroFreelandoo {
  const codigo =
    typeof corpo === "object" && corpo !== null && typeof (corpo as { erro?: unknown }).erro === "string"
      ? (corpo as { erro: string }).erro
      : null;
  if (status === 401 || status === 403) return "chave_invalida";
  if (status >= 500 || status === 429 || status === 408) return "transitorio";
  if (codigo && CODIGOS_CONHECIDOS.has(codigo)) return codigo as ErroFreelandoo;
  if (status === 404) return "nao_encontrado";
  return "inesperado";
}

type Fetch = typeof fetch;

export interface ClienteFreelandoo {
  criarMembro(dados: {
    cpf: string; nome: string; email: string; data_nascimento: string; telefone?: string; ref_externa: string;
  }): Promise<RespostaFreelandoo<CriarMembroResposta>>;
  novoLink(idUser: string): Promise<RespostaFreelandoo<LinkResposta>>;
  enviarFotoAcademia(idUser: string, jpeg: Uint8Array): Promise<RespostaFreelandoo<{ ok: true }>>;
  listarMembros(cursor?: string | null, limite?: number): Promise<RespostaFreelandoo<PaginaMembros>>;
  obterMembro(idUser: string): Promise<RespostaFreelandoo<ItemMembro>>;
}

/** Cliente que só responde "não configurado" — usado quando falta env. */
const NAO_CONFIGURADO = { ok: false as const, erro: "nao_configurado" as const };
export const clienteNaoConfigurado: ClienteFreelandoo = {
  criarMembro: async () => NAO_CONFIGURADO,
  novoLink: async () => NAO_CONFIGURADO,
  enviarFotoAcademia: async () => NAO_CONFIGURADO,
  listarMembros: async () => NAO_CONFIGURADO,
  obterMembro: async () => NAO_CONFIGURADO,
};

export function criarClienteFreelandoo(
  cfg: ConfigFreelandoo | null = configFreelandoo(),
  fetchImpl: Fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): ClienteFreelandoo {
  if (!cfg) return clienteNaoConfigurado;

  async function chamar<T>(
    metodo: "GET" | "POST" | "PUT",
    caminho: string,
    corpo?: { json: unknown } | { form: FormData },
    validos: number[] = [200, 201],
  ): Promise<RespostaFreelandoo<T>> {
    const headers: Record<string, string> = { Authorization: `Bearer ${cfg!.chave}`, Accept: "application/json" };
    let body: BodyInit | undefined;
    if (corpo && "json" in corpo) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(corpo.json);
    } else if (corpo && "form" in corpo) {
      body = corpo.form; // o fetch monta o boundary do multipart
    }
    let r: Response;
    try {
      r = await fetchImpl(`${cfg!.url}${caminho}`, {
        method: metodo, headers, body, signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
      });
    } catch (e) {
      // rede, DNS, tempo esgotado: sempre transitório
      return { ok: false, erro: "transitorio", detalhe: e instanceof Error ? e.message.slice(0, 200) : "falha de rede" };
    }
    let dados: unknown = null;
    try {
      dados = await r.json();
    } catch {
      dados = null;
    }
    if (validos.includes(r.status) && dados !== null && typeof dados === "object") {
      return { ok: true, dados: dados as T };
    }
    if (r.ok) {
      // 2xx com corpo fora do contrato
      return { ok: false, erro: "inesperado", status: r.status, detalhe: "resposta fora do contrato" };
    }
    const erro = erroDaResposta(r.status, dados);
    const codigo = (dados as { erro?: unknown } | null)?.erro;
    return { ok: false, erro, status: r.status, detalhe: typeof codigo === "string" ? codigo : `HTTP ${r.status}` };
  }

  const id = (s: string) => encodeURIComponent(s);

  return {
    criarMembro: (dados) => chamar<CriarMembroResposta>("POST", "/partner/v1/members", { json: dados }),
    novoLink: (idUser) => chamar<LinkResposta>("POST", `/partner/v1/members/${id(idUser)}/link`),
    enviarFotoAcademia: (idUser, jpeg) => {
      const form = new FormData();
      // cópia em ArrayBuffer próprio: Blob não aceita SharedArrayBuffer
      const bytes = new Uint8Array(jpeg.byteLength);
      bytes.set(jpeg);
      form.append("foto", new Blob([bytes.buffer], { type: "image/jpeg" }), "foto.jpg");
      return chamar<{ ok: true }>("PUT", `/partner/v1/members/${id(idUser)}/foto-academia`, { form });
    },
    listarMembros: (cursor, limite = 200) => {
      const q = new URLSearchParams({ limit: String(limite) });
      if (cursor) q.set("cursor", cursor);
      return chamar<PaginaMembros>("GET", `/partner/v1/members?${q.toString()}`, undefined, [200]);
    },
    obterMembro: (idUser) => chamar<ItemMembro>("GET", `/partner/v1/members/${id(idUser)}`, undefined, [200]),
  };
}
