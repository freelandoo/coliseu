"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(""); setEnviando(true);
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d?.erro ?? "Falha no login"); setEnviando(false); return;
    }
    router.push("/painel"); router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Coliseu CRM
        </h1>
        <p className="mt-1 text-sm text-muted">Acesso restrito</p>
        <div className="mt-5 flex flex-col gap-3">
          <input className={inputCls} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Senha" value={senha}
            onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} />
        </div>
        {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}
        <button onClick={entrar} disabled={enviando}
          className="mt-5 w-full rounded-lg bg-red px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </main>
  );
}
