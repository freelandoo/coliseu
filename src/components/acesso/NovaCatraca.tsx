"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/primitives";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

const btnCls =
  "rounded-lg bg-red px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest " +
  "text-white transition-colors hover:bg-red-bright disabled:opacity-60";

export function NovaCatraca() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    setErro("");
    setCriando(true);
    const r = await fetch("/api/acesso/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome }),
    });
    setCriando(false);
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(d?.erro ?? "Falha ao cadastrar a catraca");
      return;
    }
    setNome("");
    router.refresh();
  }

  return (
    <Card className="flex flex-col justify-center gap-3 border-dashed p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-faint">Nova catraca</p>
      <div className="flex items-center gap-3">
        <input
          className={inputCls}
          placeholder="Nome (ex.: Catraca Principal)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button type="button" onClick={criar} disabled={criando || !nome.trim()} className={btnCls}>
          {criando ? "Criando…" : "Cadastrar"}
        </button>
      </div>
      {erro && <p className="text-xs text-red-bright">{erro}</p>}
    </Card>
  );
}
