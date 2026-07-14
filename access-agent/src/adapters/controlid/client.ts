// Cliente HTTP para a API REST (.fcgi) da linha de Acesso Control iD (iDFace).
// Fluxo confirmado na doc oficial:
//   POST /login.fcgi {login,password} -> { session }
//   sessão vai como query ?session=<token> em todas as chamadas subsequentes
//   re-login automático quando a sessão expira (401/403).

export interface ControlIdClientOptions {
  host: string; // ip ou host; aceita com ou sem http://
  login: string;
  password: string;
  timeoutMs?: number;
}

export class ControlIdClient {
  private readonly base: string;
  private session: string | null = null;

  constructor(private readonly opts: ControlIdClientOptions) {
    const h = /^https?:\/\//.test(opts.host) ? opts.host : `http://${opts.host}`;
    this.base = h.replace(/\/+$/, "");
  }

  /** Faz login e guarda a sessão. Idempotente do ponto de vista do chamador. */
  private async login(): Promise<string> {
    const res = await this.raw("/login.fcgi", { login: this.opts.login, password: this.opts.password }, false);
    if (!res.ok) throw new Error(`login.fcgi falhou: HTTP ${res.status}`);
    const data = (await res.json()) as { session?: string };
    if (!data.session) throw new Error("login.fcgi não retornou 'session'");
    this.session = data.session;
    return this.session;
  }

  private async raw(path: string, body: unknown, withSession: boolean, timeoutMs?: number): Promise<Response> {
    const url = withSession ? `${this.base}${path}?session=${this.session}` : `${this.base}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? this.opts.timeoutMs ?? 8000);
    try {
      return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * POST autenticado num endpoint .fcgi, com re-login automático em sessão inválida.
   * `timeoutMs` opcional para chamadas que ficam abertas (ex.: remote_enroll síncrono).
   */
  async post<T = unknown>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    if (!this.session) await this.login();
    let res = await this.raw(path, body, true, timeoutMs);
    if (res.status === 401 || res.status === 403) {
      this.session = null;
      await this.login();
      res = await this.raw(path, body, true, timeoutMs);
    }
    if (!res.ok) throw new Error(`${path} falhou: HTTP ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Garante uma sessão válida (usado por testConnection). */
  async ensureSession(): Promise<void> {
    if (!this.session) await this.login();
  }
}
