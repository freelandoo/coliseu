"use client";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import type { StatusTokenFreelandoo } from "@/lib/freelandoo/token";

function fmtData(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function FreelandooTokenCard({ inicial }: { inicial: StatusTokenFreelandoo }) {
  const [status, setStatus] = useState(inicial);
  const [token, setToken] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    setErro(""); setGerando(true); setConfirmando(false); setCopiado(false);
    const r = await fetch("/api/settings/freelandoo-token", { method: "POST" });
    if (!r.ok) { setErro("Falha ao gerar o token"); setGerando(false); return; }
    const d = (await r.json()) as { token: string };
    setToken(d.token);
    setStatus({ exists: true, createdAt: new Date().toISOString(), createdByNome: status.createdByNome, lastUsedAt: null });
    setGerando(false);
  }

  async function copiar() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopiado(true);
  }

  const btnCls =
    "rounded-lg bg-red px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest " +
    "text-white transition-colors hover:bg-red-bright disabled:opacity-60";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Integração API
        </h3>
        {status.exists
          ? <Badge tone="ok">Token ativo</Badge>
          : <Badge>Nunca gerado</Badge>}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Token Bearer usado para consumir a API da academia
        (membros, acessos e pagamentos).
      </p>

      {status.exists && !token && (
        <p className="mt-3 text-xs text-faint">
          Gerado em {fmtData(status.createdAt)} · último uso: {fmtData(status.lastUsedAt)}
        </p>
      )}

      {token && (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-warn">
            Copie agora — este token não será mostrado de novo
          </p>
          <code className="mt-2 block break-all font-mono text-sm text-ink">{token}</code>
          <button type="button" onClick={copiar} className={`mt-3 ${btnCls}`}>
            {copiado ? "Copiado ✓" : "Copiar token"}
          </button>
        </div>
      )}

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      {!token && (
        <div className="mt-4 flex items-center gap-3">
          {status.exists && !confirmando ? (
            <button type="button" onClick={() => setConfirmando(true)} className={btnCls}>
              Rotacionar token
            </button>
          ) : status.exists && confirmando ? (
            <>
              <button type="button" onClick={gerar} disabled={gerando} className={btnCls}>
                {gerando ? "Gerando…" : "Confirmar rotação"}
              </button>
              <button type="button" onClick={() => setConfirmando(false)}
                className="text-xs text-muted transition-colors hover:text-ink">
                Cancelar
              </button>
              <p className="text-xs text-warn">
                O token atual para de valer na hora — a integração fica fora até você colar o novo token no sistema integrado.
              </p>
            </>
          ) : (
            <button type="button" onClick={gerar} disabled={gerando} className={btnCls}>
              {gerando ? "Gerando…" : "Gerar token"}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
