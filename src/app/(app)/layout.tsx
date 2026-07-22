import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { AvisoLeadsNovos } from "@/components/captacao/AvisoLeadsNovos";
import { requireUser } from "@/lib/auth/rbac";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 px-5 pb-8 pt-20 sm:px-8 lg:px-12 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      {/* Aviso de lead novo: aparece uma vez por sessão, em qualquer tela. */}
      <AvisoLeadsNovos />
    </div>
  );
}
