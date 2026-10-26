"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Achada = { id: string; codigo: string; nome: string; fase: string; cpf: string | null; telefone: string | null };

const FASE: Record<string, string> = { lead: "Lead", aluno: "Aluno", exaluno: "Ex-aluno" };

function cpfMascarado(cpf: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : null;
}

/**
 * "Em todos os cadastros": o que a busca acha fora da lista da tela — lead
 * antigo, ex-aluno, cadastro importado do CloudGym. Antes de cadastrar alguém
 * de novo, a recepção vê aqui que a pessoa já existe.
 */
export function BuscaTodosCadastros({
  termo,
  ocultarIds = [],
  aoEscolher,
}: {
  termo: string;
  /** Quem a lista da tela já mostra — não repete. */
  ocultarIds?: string[];
  /** Sem isso, cada resultado abre a ficha. */
  aoEscolher?: (p: Achada) => void;
}) {
  // Resultado guardado com o termo que o gerou: termo mudou, o velho não aparece.
  const [resposta, setResposta] = useState<{ termo: string; achadas: Achada[] } | null>(null);
  const t = termo.trim();

  useEffect(() => {
    if (t.length < 3) return;
    let vivo = true;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pessoas/busca?q=${encodeURIComponent(t)}`, { cache: "no-store" });
        const d = (await r.json()) as Achada[];
        if (vivo) setResposta({ termo: t, achadas: Array.isArray(d) ? d : [] });
      } catch {
        if (vivo) setResposta({ termo: t, achadas: [] });
      }
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [t]);

  const achadas = resposta && resposta.termo === t ? resposta.achadas : null;
  const visiveis = (achadas ?? []).filter((a) => !ocultarIds.includes(a.id));
  if (t.length < 3 || achadas === null || visiveis.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="mb-2 text-xs font-semibold text-muted">Em todos os cadastros (inclusive leads antigos e ex-alunos)</p>
      <ul className="flex flex-col divide-y divide-border">
        {visiveis.map((a) => {
          const conteudo = (
            <>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{a.nome}</span>
                <span className="block text-xs text-muted">
                  {[a.codigo, cpfMascarado(a.cpf) && `CPF ${cpfMascarado(a.cpf)}`, a.telefone].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.6875rem] text-muted">
                {FASE[a.fase] ?? a.fase}
              </span>
            </>
          );
          const classe = "flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-surface";
          return (
            <li key={a.id}>
              {aoEscolher ? (
                <button type="button" onClick={() => aoEscolher(a)} className={classe}>
                  {conteudo}
                </button>
              ) : (
                <Link href={`/matriculados/${encodeURIComponent(a.id)}`} className={classe}>
                  {conteudo}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
