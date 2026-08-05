import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { TrocaSenhaObrigatoria } from "@/components/perfil/TrocaSenhaObrigatoria";
import { podeModulo } from "@/lib/auth/modulos";
import { requireUser, type Papel } from "@/lib/auth/rbac";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Senha provisória bloqueia tudo até ser trocada: nada aparece atrás do modal
  // obrigatório.
  if (user.senhaProvisoria) {
    return (
      <div className="flex min-h-dvh">
        <main className="flex-1 px-5 pb-[calc(2rem_+_var(--safe-b))] pt-[calc(5rem_+_var(--safe-t))] sm:px-8 lg:px-12 lg:pt-[calc(2rem_+_var(--safe-t))]" />
        <TrocaSenhaObrigatoria nome={user.nome} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar papel={user.role as Papel} desenvolvedor={user.desenvolvedor} />
      <main className="flex-1 px-5 pb-[calc(2rem_+_var(--safe-b))] pt-[calc(5rem_+_var(--safe-t))] sm:px-8 lg:px-12 lg:pt-[calc(2rem_+_var(--safe-t))]">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      {/* Sino: só para quem atende lead — técnico não recebe notificação.
          Era acompanhado de um modal de leads novos ao entrar; saiu porque
          agora o login já cai no Atendimento, e o modal só ficava na frente da
          lista que ele mesmo mandava abrir. O sino continua avisando. */}
      {podeModulo(user.role as Papel, "captacao") && <NotificationBell />}
      {/* Convite de instalação do PWA: só depois do login, nunca na tela pública. */}
      <InstallPrompt />
    </div>
  );
}
