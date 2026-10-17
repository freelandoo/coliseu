"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Envia SHUTDOWN para o agente do device. Só o agente de SIMULAÇÃO (fake) obedece —
 * o driver real (controlid) recusa o comando, então é seguro deixar visível.
 */
export function PararAgente({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">("idle");

  async function parar() {
    setEstado("enviando");
    const r = await fetch(`/api/acesso/device/${deviceId}/stop-agent`, { method: "POST" });
    if (!r.ok) {
      setEstado("erro");
      return;
    }
    setEstado("enviado");
    router.refresh();
  }

  if (estado === "enviado") {
    return <p className="text-xs text-faint">comando enviado — o agente encerra no próximo ciclo</p>;
  }
  return (
    <button
      type="button"
      onClick={parar}
      disabled={estado === "enviando"}
      title="Encerra o agente de simulação (fake). O agente real da catraca ignora este comando."
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-faint transition-colors hover:border-danger/ hover:text-danger disabled:opacity-60"
    >
      {estado === "enviando" ? "Enviando…" : estado === "erro" ? "Falhou — tentar de novo" : "Parar simulação"}
    </button>
  );
}
