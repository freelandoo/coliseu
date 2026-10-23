import { prisma } from "@/lib/db";
import { FormularioLogin } from "@/components/login/FormularioLogin";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Mesma regra de /api/auth/register: cadastro só enquanto não há ninguém.
  const podeCadastrar = (await prisma.user.count()) === 0;
  return <FormularioLogin podeCadastrar={podeCadastrar} />;
}
