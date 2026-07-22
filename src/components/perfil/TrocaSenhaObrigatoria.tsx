"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { BotaoSair } from "@/components/perfil/BotaoSair";
import { cn } from "@/lib/cn";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/**
 * Bloqueia o sistema até o colaborador trocar a senha provisória.
 *
 * Não pede a senha atual: ela acabou de ser usada para abrir esta sessão, e o
 * servidor só dispensa a atual quando a conta está marcada como provisória.
 * Sem botão de fechar — a ideia é justamente não deixar seguir com a senha que
 * o admin ditou em voz alta.
 */
export function TrocaSenhaObrigatoria({ nome }: { nome: string }) {
  const router = useRouter();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (novaSenha !== confirmar) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }
    setSalvando(true);
    const r = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novaSenha }),
    });
    setSalvando(false);
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(d?.erro ?? "Não foi possível alterar a senha.");
      return;
    }
    router.refresh();
  }

  const invalido = novaSenha.length < 8 || !confirmar;

  return (
    <Modal onFechar={() => undefined}>
      <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        Crie sua senha
      </h3>
      <p className="mt-2 text-sm text-muted">
        Olá, {nome}. Você entrou com a senha provisória do administrador. Escolha uma senha só sua
        para continuar.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <input
          className={inputCls}
          type="password"
          placeholder="Nova senha (mín. 8 caracteres)"
          autoComplete="new-password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
        />
        <input
          className={inputCls}
          type="password"
          placeholder="Confirmar nova senha"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !invalido) void salvar();
          }}
        />
      </div>

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      <button
        onClick={salvar}
        disabled={salvando || invalido}
        className={cn(
          "mt-5 w-full rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
          salvando || invalido
            ? "cursor-not-allowed bg-surface-2 text-faint"
            : "bg-red text-white hover:bg-red-bright",
        )}
      >
        {salvando ? "Salvando…" : "Salvar e entrar"}
      </button>

      {/* Sem isto a tela vira armadilha: quem entrou na conta errada não tem
          como voltar ao login, já que o modal cobre o sistema inteiro. */}
      <div className="mt-3 flex justify-center">
        <BotaoSair className="border-transparent px-2 py-1 text-[11px]" rotulo="Sair" />
      </div>
    </Modal>
  );
}
