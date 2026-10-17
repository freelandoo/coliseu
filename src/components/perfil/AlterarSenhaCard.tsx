"use client";
import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { classeBotao } from "@/components/ui/Botao";

const btnCls = classeBotao({ variante: "primario" });

export function AlterarSenhaCard() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  async function salvar() {
    setErro("");
    setOk(false);
    if (novaSenha !== confirmar) {
      setErro("A confirmação não confere com a nova senha");
      return;
    }
    setSalvando(true);
    const r = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senhaAtual, novaSenha }),
    });
    setSalvando(false);
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(d?.erro ?? "Falha ao alterar a senha");
      return;
    }
    setOk(true);
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmar("");
  }

  return (
    <Card className="p-5">
      <h3 className="font-display text-xl font-semibold text-ink">
        Alterar senha
      </h3>
      <p className="mt-1.5 text-sm text-muted">
        Ao salvar, as outras sessões abertas com a senha antiga são desconectadas.
      </p>

      <div className="mt-4 flex max-w-sm flex-col gap-3">
        <input
          className={classeCampo}
          type="password"
          placeholder="Senha atual"
          autoComplete="current-password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
        />
        <input
          className={classeCampo}
          type="password"
          placeholder="Nova senha (mín. 8 caracteres)"
          autoComplete="new-password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
        />
        <input
          className={classeCampo}
          type="password"
          placeholder="Confirmar nova senha"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
      </div>

      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}
      {ok && <p className="mt-3 text-xs text-ok">Senha alterada com sucesso.</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !senhaAtual || !novaSenha || !confirmar}
        className={`mt-4 ${btnCls}`}
      >
        {salvando ? "Salvando…" : "Salvar nova senha"}
      </button>
    </Card>
  );
}
