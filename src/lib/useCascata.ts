"use client";

import { useEffect, useState } from "react";

/**
 * Classe `cascata` só na primeira carga da lista. Em tabela filtrada pela
 * busca, linhas que voltam a montar a cada tecla não devem reentrar em
 * escada — a cascata mais longa (280ms de atraso + 240ms) acaba antes de 600ms.
 */
export function useCascata(): string | undefined {
  const [ativa, setAtiva] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAtiva(false), 600);
    return () => clearTimeout(t);
  }, []);
  return ativa ? "cascata" : undefined;
}
