"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { classeBotao } from "@/components/ui/Botao";

const btnCls = classeBotao({ variante: "primario" });

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
      <p className="text-xs font-medium text-faint">Nova catraca</p>
      <div className="flex items-center gap-3">
        <input
          className={classeCampo}
          placeholder="Nome (ex.: Catraca Principal)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button type="button" onClick={criar} disabled={criando || !nome.trim()} className={btnCls}>
          {criando ? "Criando…" : "Cadastrar"}
        </button>
      </div>
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </Card>
  );
}
