import { redirect } from "next/navigation";

/**
 * O Atendimento virou página própria em /atendimento. Esta rota fica só de
 * redirecionamento: aviso de push antigo, aba fixada e link salvo continuam
 * caindo na conversa certa (o `?c` vai junto).
 */
export default async function AtendimentoAntigoPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  redirect(c ? `/atendimento?c=${encodeURIComponent(c)}` : "/atendimento");
}
