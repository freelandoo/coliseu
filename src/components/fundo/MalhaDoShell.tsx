"use client";

import { usePathname } from "next/navigation";
import { MalhaViva } from "./MalhaViva";

/**
 * Uma única malha viva para o app inteiro (mora no layout raiz). Login e
 * central acendem forte; as telas de trabalho ficam com a malha discreta.
 */
export function MalhaDoShell() {
  const rota = usePathname();
  const alta = rota === "/login" || rota.startsWith("/painel");
  return <MalhaViva intensidade={alta ? "alta" : "baixa"} />;
}
