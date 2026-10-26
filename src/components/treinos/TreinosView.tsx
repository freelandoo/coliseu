"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Badge, Card, Stat } from "@/components/ui/primitives";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { BarraTreino, FotoAluno } from "@/components/clientes/FreelandooAluno";
import { cn } from "@/lib/cn";
import type { SituacaoTreino } from "@/lib/freelandoo/rotulos";

export interface LinhaTreino {
  id: string;
  nome: string;
  fotoUrl?: string;
  treinoNome?: string;
  treinoVenceEm?: string;
  treinoValidadeDias?: number;
  situacao: SituacaoTreino;
}

type Filtro = "pendentes" | "vencido" | "vencendo" | "sem_treino" | "aguardando_aluno";

const PENDENTES: SituacaoTreino[] = ["vencido", "vencendo", "sem_treino"];

const CHIPS: { key: Filtro; label: string }[] = [
  { key: "pendentes", label: "Precisam de treino" },
  { key: "vencido", label: "Vencidos" },
  { key: "vencendo", label: "Vencendo" },
  { key: "sem_treino", label: "Sem treino" },
  { key: "aguardando_aluno", label: "Aguardando o aluno" },
];

type Aviso =
  | { tipo: "parado" }
  | { tipo: "enviando" }
  | { tipo: "ok"; professores: number; pendentes: number }
  | { tipo: "erro"; mensagem: string };

export function TreinosView({ linhas, configurado }: { linhas: LinhaTreino[]; configurado: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [aviso, setAviso] = useState<Aviso>({ tipo: "parado" });
  const emVoo = useRef(false);

  const contagem = useMemo(() => {
    const c: Record<SituacaoTreino, number> = { vencido: 0, vencendo: 0, sem_treino: 0, aguardando_aluno: 0, sem_conta: 0 };
    for (const l of linhas) c[l.situacao] += 1;
    return c;
  }, [linhas]);
  const pendentes = contagem.vencido + contagem.vencendo + contagem.sem_treino;
  const porChip: Record<Filtro, number> = { pendentes, ...contagem };

  const visiveis = linhas.filter((l) =>
    filtro === "pendentes" ? PENDENTES.includes(l.situacao) : l.situacao === filtro,
  );

  async function avisar() {
    if (emVoo.current) return;
    emVoo.current = true;
    setAviso({ tipo: "enviando" });
    try {
      const res = await fetch("/api/treinos/avisar", { method: "POST" });
      const dados = (await res.json().catch(() => ({}))) as { professores?: number; pendentes?: number; erro?: string };
      if (res.ok && typeof dados.professores === "number") {
        setAviso({ tipo: "ok", professores: dados.professores, pendentes: dados.pendentes ?? 0 });
      } else {
        setAviso({ tipo: "erro", mensagem: dados.erro ?? "Não foi possível avisar os professores." });
      }
    } catch {
      setAviso({ tipo: "erro", mensagem: "Sem resposta do servidor. Tente de novo." });
    } finally {
      emVoo.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Treino vencido" value={contagem.vencido} tone={contagem.vencido ? "danger" : "neutral"} />
        <Stat label="Vencendo" value={contagem.vencendo} tone={contagem.vencendo ? "warning" : "neutral"} />
        <Stat label="Sem treino" value={contagem.sem_treino} />
        <Stat label="Aguardando o aluno" value={contagem.aguardando_aluno} hint="Ficha enviada, falta o aluno confirmar" />
      </section>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Os professores recebem esta fila num aviso ao entrar na Freelandoo. O botão manda o aviso de novo agora.
        </p>
        <Botao
          variante="primario"
          onClick={() => void avisar()}
          carregando={aviso.tipo === "enviando"}
          disabled={!configurado || pendentes === 0}
          className="shrink-0"
        >
          {aviso.tipo === "enviando" ? "Avisando…" : "Avisar professores"}
        </Botao>
      </Card>
      {!configurado && <MensagemErro>A integração com a Freelandoo não está configurada.</MensagemErro>}
      {aviso.tipo === "ok" && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-ink">
          {aviso.professores} professor{aviso.professores === 1 ? "" : "es"} avisado{aviso.professores === 1 ? "" : "s"} ·{" "}
          {aviso.pendentes} aluno{aviso.pendentes === 1 ? "" : "s"} na fila.
        </p>
      )}
      {aviso.tipo === "erro" && <MensagemErro>{aviso.mensagem}</MensagemErro>}

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button
              type="button"
              key={chip.key}
              onClick={() => setFiltro(chip.key)}
              aria-pressed={ativo}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors sm:gap-2 sm:px-3.5",
                ativo
                  ? "border-brand/60 bg-brand-soft text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span>{chip.label}</span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-semibold",
                  ativo ? "bg-brand text-white" : "bg-surface-2 text-muted",
                )}
              >
                {porChip[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">Ninguém aqui.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visiveis.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/matriculados/${l.id}?de=treinos`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <FotoAluno nome={l.nome} url={l.fotoUrl} tamanho={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-ink">{l.nome}</span>
                    {l.situacao === "aguardando_aluno" ? (
                      <span className="text-xs text-muted">Ficha nova enviada pelo professor — falta o aluno confirmar no app</span>
                    ) : (
                      <BarraTreino venceEm={l.treinoVenceEm} validadeDias={l.treinoValidadeDias} />
                    )}
                  </span>
                  {l.treinoNome && <Badge className="hidden shrink-0 sm:inline-flex">{l.treinoNome}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {contagem.sem_conta > 0 && (
        <p className="text-sm text-muted">
          {contagem.sem_conta} aluno{contagem.sem_conta === 1 ? "" : "s"} ainda sem conta na Freelandoo não aparece
          {contagem.sem_conta === 1 ? "" : "m"} aqui —{" "}
          <Link href="/matriculados?app=sem_conta" className="font-medium text-destaque underline-offset-2 hover:underline">
            ver em Alunos
          </Link>
          .
        </p>
      )}
    </div>
  );
}
