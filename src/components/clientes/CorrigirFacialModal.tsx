"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, TituloModal, DescricaoModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { assinarAvisosCatraca } from "@/lib/access/avisos-cliente";
import { ESPERA_FOTO_MS, MolduraFoto, srcDaFoto, type Foto } from "@/components/acesso/CapturaFoto";

/**
 * "Corrigir facial" da ficha: o mesmo cadastro de rosto do modal da catraca.
 * Abrir já pede a captura ao leitor; a pessoa fica de frente para ele e a foto
 * aparece aqui quando o leitor termina. Serve para quem não cadastrou no modal
 * ou precisa refazer (o rosto novo substitui o antigo no aparelho).
 */
export function CorrigirFacialModal({
  personId,
  nome,
  onFechar,
}: {
  personId: string;
  nome: string;
  /** `capturou`: a face foi cadastrada — a ficha recarrega o diagnóstico. */
  onFechar: (capturou: boolean) => void;
}) {
  const [foto, setFoto] = useState<Foto>({ tipo: "vazia" });
  const pediu = useRef(false);

  async function capturar() {
    setFoto({ tipo: "pedindo" });
    try {
      const r = await fetch("/api/acesso/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, permitirLead: true }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { erro?: string } | null;
        setFoto({ tipo: "falhou", erro: d?.erro ?? "Não foi possível pedir a captura ao leitor." });
        return;
      }
      setFoto({ tipo: "aguardando" });
    } catch {
      setFoto({ tipo: "falhou", erro: "Sem conexão para pedir a captura." });
    }
  }

  // Abriu o modal = quer capturar: já pede ao leitor (uma vez).
  useEffect(() => {
    if (pediu.current) return;
    pediu.current = true;
    const t = setTimeout(() => void capturar(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A foto volta pelo canal de avisos da catraca quando o leitor termina.
  useEffect(
    () =>
      assinarAvisosCatraca((a) => {
        if (a.tipo !== "face" || a.personId !== personId) return;
        const src = srcDaFoto(a.imagem);
        const nova: Foto = !a.ok
          ? { tipo: "falhou", erro: `A captura não terminou${a.erro ? ` (${a.erro})` : ""}. Peça para olhar para o leitor e tente de novo.` }
          : src
            ? { tipo: "capturada", src }
            : { tipo: "falhou", erro: "O leitor cadastrou a face, mas não devolveu a foto." };
        setFoto((atual) => (atual.tipo === "aguardando" ? nova : atual));
      }),
    [personId],
  );

  // Sem resposta do leitor, não fica esperando para sempre.
  useEffect(() => {
    if (foto.tipo !== "aguardando") return;
    const t = setTimeout(() => {
      setFoto((atual) =>
        atual.tipo === "aguardando"
          ? { tipo: "falhou", erro: "O leitor não respondeu. Confira se o agente da recepção está online e tente de novo." }
          : atual,
      );
    }, ESPERA_FOTO_MS);
    return () => clearTimeout(t);
  }, [foto.tipo]);

  const capturou = foto.tipo === "capturada";
  const esperando = foto.tipo === "pedindo" || foto.tipo === "aguardando";

  return (
    <Modal onFechar={() => onFechar(capturou)} fecharComEsc={!esperando} className="max-w-sm">
      <TituloModal>Cadastro facial</TituloModal>
      <DescricaoModal className="mt-0.5">{nome}</DescricaoModal>

      <div className="mx-auto mt-4 w-44">
        <MolduraFoto foto={foto} nome={nome} />
      </div>

      <p role="status" className="mt-3 text-center text-sm text-ink">
        {foto.tipo === "pedindo" && "Chamando o leitor da catraca…"}
        {foto.tipo === "aguardando" && "Peça para a pessoa ficar de frente para o leitor. Ele conta 3 segundos e tira a foto."}
        {foto.tipo === "capturada" && "Face cadastrada. A catraca já reconhece este rosto."}
      </p>
      {foto.tipo === "falhou" && <p className="mt-3 text-center text-sm text-danger">{foto.erro}</p>}

      <div className="mt-5 flex gap-2">
        {capturou ? (
          <Botao variante="primario" bloco onClick={() => onFechar(true)}>
            Concluir
          </Botao>
        ) : (
          <>
            <Botao
              variante="primario"
              className="flex-1"
              onClick={() => void capturar()}
              carregando={foto.tipo === "pedindo"}
              disabled={esperando}
            >
              {foto.tipo === "aguardando" ? "Olhando para o leitor…" : "Capturar de novo"}
            </Botao>
            <Botao onClick={() => onFechar(false)}>Fechar</Botao>
          </>
        )}
      </div>
    </Modal>
  );
}
