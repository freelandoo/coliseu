"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";
import { BotaoSair } from "@/components/perfil/BotaoSair";

/**
 * Bloqueia o sistema até o colaborador trocar a senha provisória.
 *
 * Não pede a senha atual: ela acabou de ser usada para abrir esta sessão, e o
 * servidor só dispensa a atual quando a conta está marcada como provisória.
 * Sem botão de fechar — a ideia é justamente não deixar seguir com a senha que
 * o admin ditou em voz alta. Por isso o Modal vai sem `onFechar`: Esc não fecha.
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
    <Modal>
      <TituloModal>Crie sua senha</TituloModal>
      <DescricaoModal className="mt-2">
        Olá, {nome}. Você entrou com a senha provisória do administrador. Escolha uma senha só sua
        para continuar.
      </DescricaoModal>

      <div className="mt-5 flex flex-col gap-4">
        <Campo rotulo="Nova senha" ajuda="Mínimo de 8 caracteres.">
          {(a) => (
            <input
              {...a}
              className={classeCampo}
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Confirmar nova senha">
          {(a) => (
            <input
              {...a}
              className={classeCampo}
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !invalido) void salvar();
              }}
            />
          )}
        </Campo>
      </div>

      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

      <Botao
        variante="primario"
        tamanho="lg"
        bloco
        onClick={salvar}
        disabled={invalido}
        carregando={salvando}
        className="mt-5"
      >
        {salvando ? "Salvando…" : "Salvar e entrar"}
      </Botao>

      {/* Sem isto a tela vira armadilha: quem entrou na conta errada não tem
          como voltar ao login, já que o modal cobre o sistema inteiro. */}
      <div className="mt-3 flex justify-center">
        <BotaoSair variante="discreto" tamanho="sm" rotulo="Sair" />
      </div>
    </Modal>
  );
}
