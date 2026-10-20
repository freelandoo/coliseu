import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Classe dos controles de texto (input, select, textarea).
 * 16px no celular (o iOS não dá zoom ao focar) e 14px a partir de `sm`.
 * O erro aparece por `aria-invalid` — a borda muda junto da mensagem escrita,
 * nunca só pela cor.
 */
export const classeCampoEmLinha =
  "min-h-10 rounded-lg border border-control bg-surface px-3 py-2 text-base text-ink sm:text-sm " +
  "placeholder:text-faint transition-colors duration-150 ease-padrao " +
  "focus:border-brand focus-visible:outline-offset-1 " +
  "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint";

/** Largura cheia — o padrão dos formulários. `classeCampoEmLinha` serve ao seletor ao lado de texto. */
export const classeCampo = "w-full " + classeCampoEmLinha;

/** Versão compacta, para barras de ferramentas e listas densas. */
export const classeCampoCompacto =
  "w-full min-h-8 rounded-lg border border-control bg-surface px-2.5 py-1.5 text-base text-ink sm:text-xs " +
  "placeholder:text-faint transition-colors duration-150 ease-padrao " +
  "focus:border-brand focus-visible:outline-offset-1 " +
  "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint";

export const classeRotulo = "mb-1.5 block text-sm font-medium text-muted";

/** Atributos que o `Campo` entrega ao controle para ligar rótulo, ajuda e erro. */
export interface AtributosCampo {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * Rótulo + controle + ajuda + erro, com ids estáveis.
 * O controle continua do consumidor (valor, máscara, handlers e validação):
 *
 *   <Campo rotulo="CPF" erro={erros.cpf}>
 *     {(a) => <input {...a} value={cpf} onChange={…} className={classeCampo} />}
 *   </Campo>
 */
export function Campo({
  rotulo,
  ajuda,
  erro,
  id,
  className,
  children,
}: {
  rotulo: ReactNode;
  ajuda?: ReactNode;
  erro?: string | null | false;
  /** Id do controle; gerado quando omitido. */
  id?: string;
  className?: string;
  children: (atributos: AtributosCampo) => ReactNode;
}) {
  const gerado = useId();
  const idControle = id ?? `campo-${gerado}`;
  const idAjuda = `${idControle}-ajuda`;
  const idErro = `${idControle}-erro`;
  const descritores = [ajuda ? idAjuda : null, erro ? idErro : null].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <label htmlFor={idControle} className={classeRotulo}>
        {rotulo}
      </label>
      {children({
        id: idControle,
        "aria-describedby": descritores || undefined,
        "aria-invalid": erro ? true : undefined,
      })}
      {ajuda && (
        <p id={idAjuda} className="mt-1.5 text-xs text-faint">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={idErro} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-alerta">
          <IconeAlerta />
          <span>{erro}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Erro de operação (API, validação do formulário inteiro). `role="alert"` faz o
 * leitor de tela anunciar a mensagem quando ela aparece.
 */
export function MensagemErro({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-sm text-alerta", className)}>
      <IconeAlerta />
      <span>{children}</span>
    </p>
  );
}

function IconeAlerta() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="mt-[0.15em] h-[1.1em] w-[1.1em] shrink-0">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.5a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4ZM10 14.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
