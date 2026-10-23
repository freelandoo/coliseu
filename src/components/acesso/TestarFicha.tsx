"use client";

import { useState } from "react";
import { Botao } from "@/components/ui/Botao";

/** Admin: abre a ficha automática como se um rosto desconhecido tivesse tentado entrar. */
export function TestarFicha({ deviceId }: { deviceId: string }) {
  const [estado, setEstado] = useState<"livre" | "enviando" | "erro">("livre");

  async function testar() {
    setEstado("enviando");
    try {
      const r = await fetch("/api/acesso/avisos/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      setEstado(r.ok ? "livre" : "erro");
    } catch {
      setEstado("erro");
    }
  }

  return (
    <Botao
      variante="discreto"
      tamanho="sm"
      onClick={() => void testar()}
      carregando={estado === "enviando"}
      title="Simula uma tentativa de alguém sem cadastro: a ficha de matrícula abre em todas as telas da recepção."
    >
      {estado === "erro" ? "Falhou — tentar de novo" : "Testar ficha automática"}
    </Botao>
  );
}
