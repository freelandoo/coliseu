import Link from "next/link";
import { classeBotao } from "@/components/ui/Botao";

/** Endereço que não existe (ou ficha apagada). Leva de volta ao início do papel. */
export default function NaoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <p className="meta-mono text-muted">Erro 404</p>
        <h1 className="font-manchete mt-2 text-[2.5rem] text-ink">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted">
          O endereço pode ter mudado ou o cadastro pode ter sido removido.
        </p>
        <Link href="/" className={`${classeBotao({ variante: "primario" })} mt-5`}>
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
