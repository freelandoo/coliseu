"use client";

import { useEffect, useState } from "react";
import { assinarAvisosCatraca } from "@/lib/access/avisos-cliente";
import { FichaMatriculaBalcao, type MotivoFicha } from "@/components/acesso/FichaMatriculaBalcao";

/**
 * Escuta a catraca em qualquer tela da recepção: quem tenta entrar e não passa
 * (rosto desconhecido ou aluno sem matrícula ativa) abre a ficha de matrícula
 * sozinha. Com uma ficha aberta, os avisos seguintes são ignorados — quem está
 * sendo atendido não perde o que já digitou.
 */
export function AvisosCatraca() {
  const [motivo, setMotivo] = useState<MotivoFicha | null>(null);

  useEffect(
    () =>
      assinarAvisosCatraca((a) => {
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

  if (!motivo) return null;
  // key: um aviso novo depois de fechar começa uma ficha limpa
  return <FichaMatriculaBalcao key={`${motivo.tipo}-${motivo.quando}`} motivo={motivo} onFechar={() => setMotivo(null)} />;
}
