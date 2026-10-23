"use client";

import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";

/**
 * Confirmação de ação destrutiva. Deixa explícito o que sobrevive a cada uma —
 * "limpar" e "remover" soam parecidos e têm consequências bem diferentes.
 * Fecha só depois que o servidor confirmou.
 */
export function ConfirmarExclusao({
  tipo,
  nome,
  apagando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  tipo: "limpar" | "remover";
  nome: string;
  apagando: boolean;
  erro: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const limpando = tipo === "limpar";
  return (
    <Modal onFechar={onCancelar} fecharComEsc={!apagando}>
      <TituloModal>{limpando ? "Limpar conversa" : "Remover conversa"}</TituloModal>
      <DescricaoModal className="mt-2">
        {limpando ? (
          <>
            Apaga as mensagens de <strong className="text-ink">{nome}</strong>. A conversa continua na lista, com o
            lead e o histórico de atendimento intactos.
          </>
        ) : (
          <>
            Remove a conversa de <strong className="text-ink">{nome}</strong> com as mensagens e os registros de
            atendimento. O cadastro do lead <strong className="text-ink">não</strong> é apagado e continua no funil.
          </>
        )}
      </DescricaoModal>
      <p className="mt-2 text-xs text-muted">
        {limpando
          ? "Não dá para desfazer por aqui — fica uma cópia no backup do sistema."
          : "Não dá para desfazer por aqui — fica uma cópia no backup do sistema. Se a pessoa escrever de novo, uma conversa nova aparece."}
      </p>
      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}
      <div className="mt-5 flex gap-3">
        <Botao variante="perigo" onClick={onConfirmar} carregando={apagando} className="flex-1">
          {apagando ? "Apagando…" : limpando ? "Limpar" : "Remover"}
        </Botao>
        <Botao onClick={onCancelar} disabled={apagando}>
          Cancelar
        </Botao>
      </div>
    </Modal>
  );
}
