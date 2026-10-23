"use client";

import { useEffect } from "react";
import Link from "next/link";
import { classeBotao } from "@/components/ui/Botao";
import { EstadoVazio } from "@/components/ui/editorial";

/**
 * Falha ao montar uma tela (banco fora, consulta que estourou). O menu e o
 * cabeçalho continuam de pé — só o miolo cai aqui, com um "tentar de novo"
 * que refaz a tela sem recarregar o sistema inteiro.
 */
export default function ErroDaTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[tela]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <EstadoVazio
        tom="erro"
        titulo="Esta tela não carregou"
        acao={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} className={classeBotao({ variante: "primario" })}>
              Tentar de novo
            </button>
            <Link href="/" className={classeBotao({ variante: "secundario" })}>
              Ir para o início
            </Link>
          </div>
        }
      >
        Pode ser uma instabilidade momentânea. Se continuar, avise o administrador
        {error.digest ? (
          <>
            {" "}com o código <code className="font-mono text-ink">{error.digest}</code>
          </>
        ) : null}
        .
      </EstadoVazio>
    </div>
  );
}
