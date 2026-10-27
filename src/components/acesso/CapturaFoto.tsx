"use client";

import { cn } from "@/lib/cn";

/**
 * Foto do cadastro de face, tirada pelo próprio leitor da catraca. Usada pela
 * ficha automática da catraca e pelo "Corrigir facial" da ficha do aluno: a
 * captura é pedida em /api/acesso/enroll e a foto volta pelo canal de avisos
 * (`assinarAvisosCatraca`, tipo "face").
 */
export type Foto =
  | { tipo: "vazia" }
  | { tipo: "pedindo" }
  | { tipo: "aguardando" }
  | { tipo: "capturada"; src: string }
  | { tipo: "falhou"; erro: string };

/** Captura que não volta nesse tempo (agente fora, ninguém na frente do leitor) vira erro. */
export const ESPERA_FOTO_MS = 100_000;

export function srcDaFoto(imagem?: string): string | null {
  if (!imagem) return null;
  return imagem.startsWith("data:") ? imagem : `data:image/jpeg;base64,${imagem}`;
}

export function MolduraFoto({ foto, nome }: { foto: Foto; nome: string }) {
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const aguardando = foto.tipo === "aguardando" || foto.tipo === "pedindo";
  return (
    <div
      className={cn(
        "relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 bg-surface-2",
        foto.tipo === "capturada" ? "border-brand" : "border-dashed border-border-strong",
        aguardando && "border-brand motion-safe:animate-pulse",
      )}
    >
      {foto.tipo === "capturada" ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL da captura, sem otimização possível
        <img
          src={foto.src}
          alt={`Foto de ${nome.trim() || "quem está sendo matriculado"}`}
          className="h-full w-full object-cover motion-safe:animate-[foto-entra_260ms_var(--ease-padrao)]"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-faint">
          {iniciais ? (
            <span className="font-display text-4xl font-semibold text-muted">{iniciais}</span>
          ) : (
            <svg aria-hidden viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8.5" r="3.75" />
              <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" strokeLinecap="round" />
            </svg>
          )}
          <span className="text-xs">{aguardando ? "Aguardando o leitor…" : "Sem foto"}</span>
        </div>
      )}
    </div>
  );
}
