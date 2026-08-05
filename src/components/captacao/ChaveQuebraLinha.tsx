"use client";
import { cn } from "@/lib/cn";

/**
 * Chave do Enter, logo abaixo do título do Atendimento — perto da caixa que ela
 * governa, e não escondida numa tela de configurações: quem descobre o incômodo
 * está atendendo, não mexendo no perfil.
 *
 * A chave fala do lado que o dedo sente ("quebra de linha"), não do campo do
 * banco: ligada = Enter quebra linha; desligada = Enter envia. Quem liga ou
 * desliga é a conta, então a escolha acompanha quem loga, não a máquina do
 * balcão.
 */
export function ChaveQuebraLinha({
  ligada,
  salvando,
  onMudar,
}: {
  ligada: boolean;
  salvando: boolean;
  onMudar: (ligada: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      onClick={() => onMudar(!ligada)}
      disabled={salvando}
      title={
        ligada
          ? "Enter quebra linha; Ctrl+Enter envia"
          : "Enter envia; Shift+Enter quebra linha"
      }
      className={cn(
        "group flex items-center gap-2 text-[11px] font-light text-faint transition-colors hover:text-muted",
        salvando && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-[14px] w-[26px] shrink-0 rounded-full border transition-colors",
          ligada ? "border-red bg-red" : "border-border bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[8px] w-[8px] rounded-full transition-all",
            ligada ? "left-[14px] bg-white" : "left-[3px] bg-faint",
          )}
        />
      </span>
      Quebra de linha (Enter)
    </button>
  );
}
