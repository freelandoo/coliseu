"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { assinarAvisosCatraca } from "@/lib/access/avisos-cliente";
import type { AvisoRecepcao } from "@/lib/access/avisos-recepcao";
import { FichaMatriculaBalcao, type MotivoFicha } from "@/components/acesso/FichaMatriculaBalcao";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao, classeBotao } from "@/components/ui/Botao";

type AvisoCarencia = Extract<AvisoRecepcao, { tipo: "carencia" }>;

/**
 * Escuta a catraca em qualquer tela da recepção: quem tenta entrar e não passa
 * (rosto desconhecido ou aluno sem matrícula ativa) abre a ficha de matrícula
 * sozinha. Com uma ficha aberta, os avisos seguintes são ignorados — quem está
 * sendo atendido não perde o que já digitou.
 *
 * Quem entra na carência (vencido há 1–3 dias) passa, mas a recepção vê quantos
 * dias faltam para o bloqueio e pode abrir a ficha para cobrar.
 */
export function AvisosCatraca() {
  const [motivo, setMotivo] = useState<MotivoFicha | null>(null);
  const [carencia, setCarencia] = useState<AvisoCarencia | null>(null);

  useEffect(
    () =>
      assinarAvisosCatraca((a) => {
        if (a.tipo === "carencia") {
          setCarencia((atual) => atual ?? a);
          return;
        }
        let novo: MotivoFicha | null = null;
        if (a.tipo === "nao-identificado") {
          novo = { tipo: "nao-identificado", deviceId: a.deviceId, quando: a.quando };
        } else if (a.tipo === "sem-matricula") {
          novo = { tipo: "sem-matricula", deviceId: a.deviceId, quando: a.quando, personId: a.personId, nome: a.nome };
        }
        // ficha já aberta: o aviso novo não atropela quem está sendo atendido
        if (novo) setMotivo((atual) => atual ?? novo);
      }),
    [],
  );

  return (
    <>
      {motivo && (
        // key: um aviso novo depois de fechar começa uma ficha limpa
        <FichaMatriculaBalcao key={`${motivo.tipo}-${motivo.quando}`} motivo={motivo} onFechar={() => setMotivo(null)} />
      )}
      {carencia && !motivo && (
        <Modal onFechar={() => setCarencia(null)} fecharAoClicarFora className="max-w-md">
          <TituloModal>{carencia.nome}</TituloModal>
          <DescricaoModal className="mt-1">Entrou na catraca agora.</DescricaoModal>
          <p
            className={
              carencia.restam === 1
                ? "mt-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm font-medium text-danger"
                : "mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm font-medium text-ink"
            }
          >
            {carencia.texto}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Botao variante="secundario" tamanho="sm" onClick={() => setCarencia(null)} data-autofocus>
              Ok
            </Botao>
            <Link
              href={`/matriculados/${carencia.personId}`}
              onClick={() => setCarencia(null)}
              className={classeBotao({ variante: "primario", tamanho: "sm" })}
            >
              Abrir ficha para cobrar
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}
