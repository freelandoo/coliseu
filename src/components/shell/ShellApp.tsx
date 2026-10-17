"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { CabecalhoApp } from "@/components/shell/CabecalhoApp";
import type { Papel } from "@/lib/auth/modulos";

const CONSULTA_DESKTOP = "(min-width: 1024px)";

function assinarDesktop(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_DESKTOP);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/**
 * Estrutura persistente do app autenticado: menu, cabeçalho e área principal.
 *
 * Mora no layout, então NÃO remonta ao trocar de página — e o conteúdo
 * (`children`) também não é remontado por ela (sem `key` de rota). Cada peça
 * com efeito (sino, contador de não lidas) existe uma vez só, nos dois tamanhos
 * de tela: esconder com CSS não impediria rede nem assinatura duplicadas.
 */
export function ShellApp({
  papel,
  desenvolvedor,
  mostrarSino,
  children,
}: {
  papel: Papel;
  desenvolvedor: boolean;
  mostrarSino: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const desktop = useSyncExternalStore(
    assinarDesktop,
    () => window.matchMedia(CONSULTA_DESKTOP).matches,
    () => false,
  );

  // A gaveta guarda a rota em que foi aberta: qualquer navegação (link, logo,
  // voltar do navegador) a fecha sozinha, sem efeito nem entrada de histórico.
  const [abertaEm, setAbertaEm] = useState<string | null>(null);
  const aberta = abertaEm === pathname && !desktop;

  const abrir = useCallback(() => setAbertaEm(pathname), [pathname]);
  const fechar = useCallback(() => setAbertaEm(null), []);

  // Virou desktop com a gaveta aberta: fecha de vez (não reabre ao voltar).
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_DESKTOP);
    const aoMudar = () => {
      if (mq.matches) setAbertaEm(null);
    };
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-[calc(0.75rem_+_var(--safe-t))] focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand focus:shadow-[var(--shadow-overlay)]"
      >
        Pular para o conteúdo
      </a>

      <Sidebar
        papel={papel}
        desenvolvedor={desenvolvedor}
        pathname={pathname}
        aberta={aberta}
        onFechar={fechar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <CabecalhoApp
          pathname={pathname}
          menuAberto={aberta}
          onAbrirMenu={abrir}
          mostrarSino={mostrarSino}
        />
        <main
          id="conteudo"
          tabIndex={-1}
          className="area-principal min-w-0 flex-1 px-4 outline-none sm:px-6 lg:px-10"
        >
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
