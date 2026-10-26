"use client";

import { useState } from "react";
import { Botao, type VarianteBotao } from "@/components/ui/Botao";

/**
 * "Cadastrar facial" na ficha: pede ao leitor da catraca a captura do rosto
 * desta pessoa — para quem não cadastrou no modal da matrícula/catraca ou
 * precisa refazer (troca o rosto que estava no aparelho). O leitor fica
 * esperando; a pessoa se posiciona em frente a ele.
 */
export function CadastrarFacial({
  personId,
  nome,
  temFace,
  variante = "contorno",
  tamanho = "md",
}: {
  personId: string;
  nome: string;
  temFace?: boolean;
  variante?: VarianteBotao;
  tamanho?: "sm" | "md" | "lg";
}) {
  const [estado, setEstado] = useState<{ tipo: "ocioso" | "enviando" | "enviado" } | { tipo: "erro"; erro: string }>({
    tipo: "ocioso",
  });

  async function cadastrar() {
    if (temFace && !confirm(`${nome} já tem face cadastrada. Refazer o cadastro (o rosto novo substitui o antigo)?`)) return;
    setEstado({ tipo: "enviando" });
    try {
      const r = await fetch("/api/acesso/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, permitirLead: true }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) return setEstado({ tipo: "erro", erro: d.erro ?? "Não foi possível pedir a captura ao leitor." });
      setEstado({ tipo: "enviado" });
    } catch {
      setEstado({ tipo: "erro", erro: "Sem conexão com o servidor." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Botao variante={variante} tamanho={tamanho} onClick={() => void cadastrar()} carregando={estado.tipo === "enviando"}>
        {temFace ? "Recadastrar facial" : "Cadastrar facial"}
      </Botao>
      {estado.tipo === "enviado" && (
        <p role="status" className="max-w-xs text-xs text-ok">
          Leitor pronto: peça para {nome.split(" ")[0]} olhar para a catraca. Em alguns segundos o cadastro aparece no
          cartão Catraca (Atualizar).
        </p>
      )}
      {estado.tipo === "erro" && <p className="max-w-xs text-xs text-danger">{estado.erro}</p>}
    </div>
  );
}
