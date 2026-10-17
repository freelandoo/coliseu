"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { lerResultado, temOk } from "@/lib/operacao";

/**
 * Remove uma pessoa (lead ou matriculado) com confirmação. Usa o DELETE
 * /api/pessoas/[id], que apaga a ficha e remove a pessoa das catracas (LGPD).
 * O diálogo só fecha — e `aoRemover` só roda — depois que o servidor confirmou.
 * O stopPropagation no wrapper protege linhas de tabela clicáveis.
 */
export function RemoverPessoa({
  id,
  nome,
  rotulo = "Remover",
  aoRemover,
}: {
  id: string;
  nome: string;
  rotulo?: string;
  /** Depois da remoção confirmada. Padrão: atualizar a tela. */
  aoRemover?: () => void;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState("");

  async function remover() {
    if (removendo) return;
    setErro("");
    setRemovendo(true);
    const res = await lerResultado(fetch(`/api/pessoas/${id}`, { method: "DELETE" }), temOk, "Não foi possível remover.");
    setRemovendo(false);
    if (res.tipo === "ok") {
      setConfirmando(false);
      if (aoRemover) aoRemover();
      else router.refresh();
      return;
    }
    setErro(
      res.tipo === "falha"
        ? res.erro
        : "Sem confirmação do servidor. A remoção pode ter acontecido — recarregue a página antes de tentar de novo.",
    );
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Botao variante="perigo-contorno" tamanho="sm" onClick={() => setConfirmando(true)}>
        {rotulo}
      </Botao>

      {confirmando && (
        <Modal
          onFechar={() => !removendo && setConfirmando(false)}
          fecharComEsc={!removendo}
          fecharAoClicarFora
          className="max-w-sm"
        >
          <TituloModal>Remover cadastro</TituloModal>
          <DescricaoModal className="mt-2">
            Remover <strong className="text-ink">{nome}</strong>? Apaga a ficha, o histórico e a biometria das catracas.
            Não dá para desfazer.
          </DescricaoModal>
          {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}
          <div className="mt-5 flex gap-3">
            <Botao variante="perigo" onClick={() => void remover()} carregando={removendo} className="flex-1">
              {removendo ? "Removendo…" : "Remover"}
            </Botao>
            <Botao onClick={() => setConfirmando(false)} disabled={removendo}>
              Cancelar
            </Botao>
          </div>
        </Modal>
      )}
    </span>
  );
}
