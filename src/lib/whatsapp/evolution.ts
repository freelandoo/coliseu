/**
 * Client HTTP da Evolution API (v2).
 *
 * Só o servidor fala com a Evolution: a `apikey` nunca sai daqui. Sem
 * `EVOLUTION_URL`/`EVOLUTION_API_KEY` o módulo se declara não configurado e as
 * rotas devolvem 503 — o resto do Coliseu continua funcionando, igual ao modo
 * demonstração do Asaas.
 *
 * Este módulo **envia** mensagens. A ingestão do webhook não o importa: é o que
 * garante, estruturalmente, que ninguém é respondido automaticamente.
 */

const TIMEOUT_MS = 15_000;

export interface ConfigEvolution {
  url: string;
  apiKey: string;
  instancia: string;
  webhookUrl: string;
  webhookSecret: string;
}

export class EvolutionError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

export function configEvolution(): ConfigEvolution | null {
  const url = (process.env.EVOLUTION_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.EVOLUTION_API_KEY ?? "").trim();
  if (!url || !apiKey) return null;

  const base = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  return {
    url,
    apiKey,
    instancia: (process.env.EVOLUTION_INSTANCE ?? "coliseu").trim(),
    webhookUrl: base ? `${base}/api/webhooks/whatsapp` : "",
    webhookSecret: (process.env.WHATSAPP_WEBHOOK_SECRET ?? "").trim(),
  };
}

/** Nome de instância vai na URL — restringe ao alfabeto aceito pela Evolution. */
export function validarNomeInstancia(nome: string): string {
  const limpo = String(nome ?? "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(limpo)) {
    throw new EvolutionError("Nome de instância inválido (use letras, números, _ e -).", 400);
  }
  return limpo;
}

interface RespostaEvolution {
  status: number;
  data: Record<string, unknown>;
}

async function chamar(
  cfg: ConfigEvolution,
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<RespostaEvolution> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${cfg.url}${caminho}`, {
      method: metodo,
      headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controle.signal,
      cache: "no-store",
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: r.status, data };
  } catch (e) {
    const motivo = e instanceof Error && e.name === "AbortError" ? "tempo esgotado" : "sem resposta";
    throw new EvolutionError(`Evolution indisponível (${motivo}).`);
  } finally {
    clearTimeout(timer);
  }
}

/** A Evolution responde 200 com `success:false` em algumas falhas — vale erro. */
function mensagemDeErro(data: Record<string, unknown>): string {
  const resposta = data.response as { message?: unknown } | undefined;
  const bruto = resposta?.message ?? data.message ?? data.error;
  if (Array.isArray(bruto)) return bruto.map(String).join("; ").slice(0, 300);
  if (typeof bruto === "string" && bruto.trim()) return bruto.trim().slice(0, 300);
  return "Falha na Evolution API.";
}

function garantirOk({ status, data }: RespostaEvolution): Record<string, unknown> {
  if (status >= 400 || data.success === false) {
    throw new EvolutionError(mensagemDeErro(data), status >= 400 ? status : 502);
  }
  return data;
}

function configWebhook(cfg: ConfigEvolution) {
  if (!cfg.webhookUrl) return null;
  return {
    enabled: true,
    url: cfg.webhookUrl,
    byEvents: false,
    base64: false,
    headers: cfg.webhookSecret ? { "x-webhook-secret": cfg.webhookSecret } : undefined,
    events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
  };
}

/**
 * Cria a instância. Idempotente: se já existe na Evolution (403/409/"already in
 * use"), segue em frente e só reaplica o webhook.
 */
export async function criarInstancia(cfg: ConfigEvolution, nome: string): Promise<void> {
  const instancia = validarNomeInstancia(nome);
  const webhook = configWebhook(cfg);
  const r = await chamar(cfg, "POST", "/instance/create", {
    instanceName: instancia,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    ...(webhook ? { webhook } : {}),
  });

  const jaExiste =
    r.status === 403 || r.status === 409 || /already in use|exists/i.test(mensagemDeErro(r.data));
  if (r.status >= 400 && !jaExiste) {
    throw new EvolutionError(mensagemDeErro(r.data), r.status);
  }

  await aplicarWebhook(cfg, instancia);
}

/** Reaplicar o webhook é seguro e cobre instância criada fora do Coliseu. */
export async function aplicarWebhook(cfg: ConfigEvolution, nome: string): Promise<void> {
  const webhook = configWebhook(cfg);
  if (!webhook) return;
  await chamar(cfg, "POST", `/webhook/set/${encodeURIComponent(validarNomeInstancia(nome))}`, {
    webhook,
  }).catch(() => undefined); // webhook é reaplicado a cada conexão; falha aqui não trava o QR
}

export interface Pareamento {
  conectado: boolean;
  qrBase64: string | null;
  pairingCode: string | null;
}

/** `instance/connect`: devolve o QR, ou `conectado` quando já está pareado. */
export async function conectar(cfg: ConfigEvolution, nome: string): Promise<Pareamento> {
  const instancia = validarNomeInstancia(nome);
  const data = garantirOk(await chamar(cfg, "GET", `/instance/connect/${encodeURIComponent(instancia)}`));

  const estado = (data.instance as { state?: string } | undefined)?.state;
  if (estado === "open") return { conectado: true, qrBase64: null, pairingCode: null };

  const qr = data.qrcode as { base64?: string } | undefined;
  const qrBase64 = (data.base64 as string | undefined) ?? qr?.base64 ?? null;
  const pairingCode = (data.pairingCode as string | undefined) ?? (data.code as string | undefined) ?? null;
  if (!qrBase64 && !pairingCode) {
    throw new EvolutionError("A Evolution não devolveu QR Code. Tente de novo em alguns segundos.");
  }
  return { conectado: false, qrBase64, pairingCode };
}

/** Estado da sessão. Nunca lança: indisponibilidade vira `null` (desconhecido). */
export async function estadoConexao(cfg: ConfigEvolution, nome: string): Promise<boolean | null> {
  try {
    const { status, data } = await chamar(
      cfg,
      "GET",
      `/instance/connectionState/${encodeURIComponent(validarNomeInstancia(nome))}`,
    );
    if (status >= 400) return null;
    const estado = (data.instance as { state?: string } | undefined)?.state ?? data.state;
    return ["open", "connected", "connection_open"].includes(String(estado ?? "").toLowerCase());
  } catch {
    return null;
  }
}

export async function desconectar(cfg: ConfigEvolution, nome: string): Promise<void> {
  const instancia = encodeURIComponent(validarNomeInstancia(nome));
  const r = await chamar(cfg, "DELETE", `/instance/logout/${instancia}`);
  if (r.status >= 400 && r.status !== 404) {
    throw new EvolutionError(mensagemDeErro(r.data), r.status);
  }
}

/**
 * Envia texto. Único ponto de saída de mensagem do sistema — sempre acionado por
 * um clique da recepção, nunca pelo webhook.
 * Devolve o `key.id` do WhatsApp para deduplicar o eco que volta pelo webhook.
 */
export async function enviarTexto(
  cfg: ConfigEvolution,
  nome: string,
  telefone: string,
  texto: string,
): Promise<string | null> {
  const numero = telefone.replace(/\D/g, "");
  if (!numero) throw new EvolutionError("Conversa sem número de telefone para envio.", 400);
  const conteudo = texto.trim();
  if (!conteudo) throw new EvolutionError("Mensagem vazia.", 400);

  const data = garantirOk(
    await chamar(cfg, "POST", `/message/sendText/${encodeURIComponent(validarNomeInstancia(nome))}`, {
      number: numero,
      text: conteudo,
    }),
  );
  const chave = (data.key ?? (data.message as { key?: unknown } | undefined)?.key) as
    | { id?: string }
    | undefined;
  return chave?.id ?? null;
}
