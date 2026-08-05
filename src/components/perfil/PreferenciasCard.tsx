"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/**
 * Preferência de teclado do atendimento. Duas opções escritas por extenso em
 * vez de um interruptor: "Enter envia" ligado/desligado obrigaria a adivinhar o
 * que acontece no estado desligado — aqui os dois comportamentos estão à vista,
 * cada um com o atalho que sobra para o outro uso.
 */
export function PreferenciasCard({ enterEnvia }: { enterEnvia: boolean }) {
  const [valor, setValor] = useState(enterEnvia);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();

  async function escolher(novo: boolean) {
    if (novo === valor || salvando) return;
    const anterior = valor;
    setErro("");
    setValor(novo); // troca na hora: a escolha é reversível com um clique
    setSalvando(true);
    try {
      const r = await fetch("/api/perfil/preferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterEnvia: novo }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { erro?: string } | null;
        setValor(anterior);
        setErro(d?.erro ?? "Não foi possível salvar a preferência");
        return;
      }
      // O Atendimento lê a preferência no servidor: sem isto, a aba já aberta
      // continuaria com o comportamento antigo até um recarregamento.
      router.refresh();
    } catch {
      setValor(anterior);
      setErro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        Preferências
      </h3>
      <p className="mt-1.5 text-sm text-muted">
        Vale só para a sua conta, em qualquer aparelho onde você entrar.
      </p>

      <p className="mt-4 text-xs font-medium uppercase tracking-widest text-faint">
        Tecla Enter na caixa de resposta do Atendimento
      </p>

      <div
        role="radiogroup"
        aria-label="Tecla Enter na caixa de resposta do Atendimento"
        className="mt-2 flex max-w-md flex-col gap-2"
      >
        <Opcao
          selecionada={!valor}
          titulo="Enter quebra linha"
          detalhe="Envio no botão ou com Ctrl+Enter. Bom para mensagem longa."
          onClick={() => void escolher(false)}
          disabled={salvando}
        />
        <Opcao
          selecionada={valor}
          titulo="Enter envia"
          detalhe="Shift+Enter quebra linha. Como no WhatsApp Web."
          onClick={() => void escolher(true)}
          disabled={salvando}
        />
      </div>

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}
    </Card>
  );
}

function Opcao({
  selecionada,
  titulo,
  detalhe,
  onClick,
  disabled,
}: {
  selecionada: boolean;
  titulo: string;
  detalhe: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selecionada}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selecionada ? "border-red/60 bg-red-ghost" : "border-border hover:bg-surface-2",
        disabled && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1 h-3 w-3 shrink-0 rounded-full border",
          selecionada ? "border-red bg-red" : "border-border",
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{titulo}</span>
        <span className="mt-0.5 block text-xs text-muted">{detalhe}</span>
      </span>
    </button>
  );
}
