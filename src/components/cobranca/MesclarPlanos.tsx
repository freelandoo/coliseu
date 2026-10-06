"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { PlanoComContagem } from "@/components/cobranca/GestaoPlanos";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/**
 * Junta os planos selecionados em um só. Um deles serve de base (o que
 * sobrevive) — os alunos de todos passam para ele, com o nome, valor e duração
 * definidos aqui. Os demais ficam arquivados como "mesclado em".
 */
export function ModalMesclarPlanos({
  planos,
  onFechar,
  onMesclado,
}: {
  planos: PlanoComContagem[];
  onFechar: () => void;
  onMesclado: (resumo: string) => void;
}) {
  // Base padrão: o plano com mais alunos (é o que menos muda para a recepção).
  const inicial = [...planos].sort((a, b) => b.alunos - a.alunos)[0];
  const [destinoId, setDestinoId] = useState(inicial.id);
  const [nome, setNome] = useState(inicial.nome);
  const [valor, setValor] = useState(String(inicial.valorMensal).replace(".", ","));
  const [duracao, setDuracao] = useState(String(inicial.duracaoDias));
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const totalAlunos = planos.reduce((s, p) => s + p.alunos, 0);

  function escolherBase(p: PlanoComContagem) {
    setDestinoId(p.id);
    setNome(p.nome);
    setValor(String(p.valorMensal).replace(".", ","));
    setDuracao(String(p.duracaoDias));
  }

  async function mesclar() {
    setErro("");
    const valorMensal = Number(valor.replace(/\./g, "").replace(",", "."));
    const duracaoDias = Number(duracao);
    if (
      !confirm(
        `Mesclar ${planos.length} planos em "${nome.trim()}"? ${totalAlunos} aluno(s) ficam nesse plano ` +
          "e os outros planos serão arquivados. Não dá para desfazer pela tela.",
      )
    )
      return;
    setEnviando(true);
    try {
      const r = await fetch("/api/planos/mesclar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planoIds: planos.map((p) => p.id), destinoId, nome, valorMensal, duracaoDias }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string; matriculasMovidas?: number; plano?: { nome: string } };
      if (!r.ok) {
        setErro(d.erro ?? "Falha ao mesclar");
        return;
      }
      onMesclado(`Planos mesclados em "${d.plano?.nome}" — ${d.matriculasMovidas ?? 0} matrícula(s) movida(s).`);
    } catch {
      setErro("Sem conexão com o servidor");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
          Mesclar {planos.length} planos
        </h3>
        <p className="mt-1 text-sm text-muted">
          Escolha o plano base. Todos os {totalAlunos} aluno(s) passam para ele.
        </p>

        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {planos.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  name="base"
                  checked={destinoId === p.id}
                  onChange={() => escolherBase(p)}
                  className="accent-red"
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", destinoId === p.id ? "font-medium text-ink" : "text-muted")}>
                    {p.nome}
                  </span>
                  <span className="text-xs text-faint">
                    {p.alunos} aluno{p.alunos === 1 ? "" : "s"} · {p.duracaoDias} dias
                    {p.ativo === false ? " · arquivado" : ""}
                  </span>
                </span>
                <span className="text-xs text-muted">{formatBRL(p.valorMensal)}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nome do plano</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Valor/mês (R$)</label>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Duração (dias)</label>
              <input inputMode="numeric" value={duracao} onChange={(e) => setDuracao(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-faint">
            O novo valor vale para matrículas e renovações. Assinaturas já ativas no Asaas continuam
            cobrando o valor de hoje.
          </p>
        </div>

        {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-border-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={mesclar}
            disabled={enviando || !nome.trim()}
            className="rounded-lg bg-red px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60"
          >
            {enviando ? "Mesclando…" : "Mesclar"}
          </button>
        </div>
      </div>
    </div>
  );
}
