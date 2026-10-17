"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";

/**
 * Remove uma pessoa (lead ou matriculado) com confirmação. Usa o DELETE
 * /api/pessoas/[id], que apaga a ficha e remove a pessoa das catracas (LGPD).
 * O stopPropagation no wrapper protege linhas de tabela clicáveis (o diálogo
 * vai num portal, mas os eventos React continuam subindo por este span).
 */
export function RemoverPessoa({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState("");

  async function remover() {
    setErro("");
    setRemovendo(true);
    const r = await fetch(`/api/pessoas/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(d?.erro ?? "Não foi possível remover.");
      setRemovendo(false);
      return;
    }
    setConfirmando(false);
    setRemovendo(false);
    router.refresh();
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Botao variante="perigo-contorno" tamanho="sm" onClick={() => setConfirmando(true)}>
        Remover
      </Botao>

      {confirmando && (
        // Fora do processamento, fundo e Esc cancelam (o clique no fundo já cancelava).
        <Modal
          onFechar={() => !removendo && setConfirmando(false)}
          fecharComEsc={!removendo}
          fecharAoClicarFora
          className="max-w-sm"
        >
          <TituloModal>Remover cadastro</TituloModal>
          <DescricaoModal className="mt-2">
            Remover <strong className="text-ink">{nome}</strong>? Apaga a ficha, o histórico e a
            biometria das catracas. Não dá para desfazer.
          </DescricaoModal>
          {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}
          <div className="mt-5 flex gap-3">
            <Botao variante="perigo" onClick={remover} carregando={removendo} className="flex-1">
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
