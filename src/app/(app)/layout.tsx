import type { ReactNode } from "react";
import { ShellApp } from "@/components/shell/ShellApp";
import { PresencaHeartbeat } from "@/components/PresencaHeartbeat";
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
        <main className="flex-1" />
        <TrocaSenhaObrigatoria nome={user.nome} />
      </div>
    );
  }

  return (
    <>
      {/* Menu, cabeçalho e área principal: persistem entre páginas (layout).
          Sino só para quem atende lead — técnico não recebe notificação. Era
          acompanhado de um modal de leads novos ao entrar; saiu porque o login
          já cai no Atendimento, e o modal ficava na frente da lista que ele
          mesmo mandava abrir. */}
      <ShellApp
        papel={user.role as Papel}
        desenvolvedor={user.desenvolvedor === true}
        mostrarSino={podeModulo(user.role as Papel, "captacao")}
      >
        {children}
      </ShellApp>
      {/* Convite de instalação do PWA: só depois do login, nunca na tela pública. */}
      <InstallPrompt />
      {/* Batida de ponto do tempo em tela (aba Uso do Atendimento). Fica aqui, e
          não na página do atendimento, porque o expediente não é só a caixa de
          mensagens — e fica depois da troca de senha obrigatória, que quem não
          passou dela ainda não começou a trabalhar. */}
      <PresencaHeartbeat />
    </>
  );
}
