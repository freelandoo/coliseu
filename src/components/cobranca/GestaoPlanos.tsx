"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { Plano } from "@/lib/types";
import { ModalMesclarPlanos } from "@/components/cobranca/MesclarPlanos";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";

export interface PlanoComContagem extends Plano {
  alunos: number;
}

type Situacao = "ativos" | "arquivados";
type Coluna = "nome" | "duracao" | "alunos" | "valor";
type Direcao = "asc" | "desc";

/** Direção de partida ao clicar numa coluna nova: texto sobe, número desce. */
const DIRECAO_INICIAL: Record<Coluna, Direcao> = {
  nome: "asc",
  duracao: "desc",
  alunos: "desc",
  valor: "desc",
};

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function comparar(a: PlanoComContagem, b: PlanoComContagem, coluna: Coluna) {
  switch (coluna) {
    case "nome":
      return colator.compare(a.nome, b.nome);
    case "duracao":
      return a.duracaoDias - b.duracaoDias;
    case "alunos":
      return a.alunos - b.alunos;
    case "valor":
      return a.valorMensal - b.valorMensal;
  }
}

/**
 * Leitura aproximada em meses ao lado dos dias — o contrato é vendido como
 * "semestral", mas vale em dias; mostrar os dois evita conferência de cabeça.
 */
function equivalenteEmMeses(dias: number): string | null {
  const meses = Math.round(dias / 30.44);
  return meses >= 2 ? `≈ ${meses} meses` : null;
}

export function GestaoPlanos({ planos }: { planos: PlanoComContagem[] }) {
  const router = useRouter();
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState<Plano | null>(null);
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  // Espelha a ordem que o servidor devolve (valorMensal desc).
  const [coluna, setColuna] = useState<Coluna>("valor");
  const [direcao, setDirecao] = useState<Direcao>("desc");
  // Mesclagem: modo de seleção (vale entre Ativos e Arquivados) + modal.
  const [mesclando, setMesclando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalMescla, setModalMescla] = useState(false);
  const [aviso, setAviso] = useState("");

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  function sairDaMescla() {
    setMesclando(false);
    setSelecionados(new Set());
  }

  const contagem = useMemo(
    () => ({
      ativos: planos.filter((p) => p.ativo !== false).length,
      arquivados: planos.filter((p) => p.ativo === false).length,
    }),
    [planos],
  );

  const visiveis = useMemo(() => {
    const arquivado = situacao === "arquivados";
    const sinal = direcao === "asc" ? 1 : -1;
    return planos
      .filter((p) => (p.ativo === false) === arquivado)
      .sort((a, b) => sinal * comparar(a, b, coluna));
  }, [planos, situacao, coluna, direcao]);

  function ordenarPor(c: Coluna) {
    if (c === coluna) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setColuna(c);
    setDirecao(DIRECAO_INICIAL[c]);
  }

  async function arquivar(p: Plano, ativo: boolean) {
    await fetch(`/api/planos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-faint">
          Planos
        </h2>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => (mesclando ? sairDaMescla() : setMesclando(true))}
            className={classeBotao({ variante: "secundario" })}
          >
            {mesclando ? "Cancelar mescla" : "Mesclar planos"}
          </button>
          <button type="button"
            onClick={() => setModalNovo(true)}
            className={classeBotao({ variante: "primario" })}
          >
            + Novo plano
          </button>
        </div>
      </div>

      {aviso && <p className="text-sm text-ok">{aviso}</p>}

      {mesclando && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/40 bg-brand-soft px-4 py-3 text-sm">
          <span className="text-ink">
            {selecionados.size === 0
              ? "Marque os planos que vão virar um só (pode incluir arquivados)."
              : `${selecionados.size} plano(s) selecionado(s)`}
          </span>
          <button type="button"
            onClick={() => setModalMescla(true)}
            disabled={selecionados.size < 2}
            className={classeBotao({ variante: "primario", tamanho: "sm" })}
          >
            Mesclar {selecionados.size >= 2 ? selecionados.size : ""}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "ativos", label: "Ativos" },
            { key: "arquivados", label: "Arquivados" },
          ] as const
        ).map((chip) => {
          const ativo = situacao === chip.key;
          return (
            <button type="button"
              key={chip.key}
              onClick={() => setSituacao(chip.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm",
                ativo
                  ? "border-brand/60 bg-brand-soft text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span className="">{chip.label}</span>
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-xs font-semibold sm:h-5 sm:min-w-5 sm:text-xs",
                  ativo ? "bg-brand text-white" : "bg-surface-2 text-faint",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">
            {situacao === "ativos"
              ? "Nenhum plano ativo."
              : "Nenhum plano arquivado."}
          </p>
        ) : (
          <>
          {/* mobile: cards empilhados, sem scroll horizontal */}
          <div className="divide-y divide-border sm:hidden">
            {visiveis.map((p) => {
              const inativo = p.ativo === false;
              return (
                <div key={p.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    {mesclando && !p.mesclado && (
                      <input
                        type="checkbox"
                        checked={selecionados.has(p.id)}
                        onChange={() => alternar(p.id)}
                        aria-label={`Selecionar ${p.nome}`}
                        className="mt-1 accent-brand"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          inativo ? "text-muted" : "text-ink",
                        )}
                      >
                        {p.nome}
                      </p>
                      {p.descricao && (
                        <p className="text-xs text-faint">{p.descricao}</p>
                      )}
                      <p className="text-xs text-muted">
                        {p.duracaoDias} {p.duracaoDias === 1 ? "dia" : "dias"}
                        {equivalenteEmMeses(p.duracaoDias) &&
                          ` (${equivalenteEmMeses(p.duracaoDias)})`}
                        {" · "}
                        {p.alunos} aluno{p.alunos === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold",
                        inativo ? "text-muted" : "text-ink",
                      )}
                    >
                      {formatBRL(p.valorMensal)}
                    </span>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button"
                      onClick={() => setEditando(p)}
                      className="text-xs font-medium text-faint transition-colors hover:text-destaque"
                    >
                      Editar
                    </button>
                    {!p.mesclado && (
                      <button type="button"
                        onClick={() => arquivar(p, inativo)}
                        className="text-xs font-medium text-faint transition-colors hover:text-ink"
                      >
                        {inativo ? "Reativar" : "Arquivar"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* desktop: tabela */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {mesclando && <Th className="w-10"> </Th>}
                  <Th coluna="nome" atual={coluna} direcao={direcao} onOrdenar={ordenarPor}>
                    Plano
                  </Th>
                  <Th coluna="duracao" atual={coluna} direcao={direcao} onOrdenar={ordenarPor}>
                    Duração
                  </Th>
                  <Th coluna="alunos" atual={coluna} direcao={direcao} onOrdenar={ordenarPor}>
                    Alunos
                  </Th>
                  <Th
                    coluna="valor"
                    atual={coluna}
                    direcao={direcao}
                    onOrdenar={ordenarPor}
                    className="text-right"
                  >
                    Valor/mês
                  </Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const inativo = p.ativo === false;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      {mesclando && (
                        <td className="px-4 py-3">
                          {!p.mesclado && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(p.id)}
                              onChange={() => alternar(p.id)}
                              aria-label={`Selecionar ${p.nome}`}
                              className="accent-brand"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-medium",
                            inativo ? "text-muted" : "text-ink",
                          )}
                        >
                          {p.nome}
                        </span>
                        {p.descricao && (
                          <p className="text-xs text-faint">{p.descricao}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {p.duracaoDias} {p.duracaoDias === 1 ? "dia" : "dias"}
                        {equivalenteEmMeses(p.duracaoDias) && (
                          <span className="block text-xs text-faint">
                            {equivalenteEmMeses(p.duracaoDias)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.alunos}</td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-semibold",
                          inativo ? "text-muted" : "text-ink",
                        )}
                      >
                        {formatBRL(p.valorMensal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button type="button"
                            onClick={() => setEditando(p)}
                            className="text-xs font-medium text-faint transition-colors hover:text-destaque"
                          >
                            Editar
                          </button>
                          {!p.mesclado && (
                            <button type="button"
                              onClick={() => arquivar(p, inativo)}
                              className="text-xs font-medium text-faint transition-colors hover:text-ink"
                            >
                              {inativo ? "Reativar" : "Arquivar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {modalMescla && (
        <ModalMesclarPlanos
          planos={planos.filter((p) => selecionados.has(p.id))}
          onFechar={() => setModalMescla(false)}
          onMesclado={(resumo) => {
            setModalMescla(false);
            sairDaMescla();
            setAviso(resumo);
            router.refresh();
          }}
        />
      )}

      {modalNovo && (
        <ModalPlano
          onFechar={() => setModalNovo(false)}
          onSalvo={() => {
            setModalNovo(false);
            router.refresh();
          }}
        />
      )}
      {editando && (
        <ModalPlano
          plano={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ModalPlano({
  plano,
  onFechar,
  onSalvo,
}: {
  plano?: Plano;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const editando = Boolean(plano);
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [valor, setValor] = useState(
    plano ? String(plano.valorMensal).replace(".", ",") : "",
  );
  const [duracao, setDuracao] = useState(String(plano?.duracaoDias ?? 30));
  const [descricao, setDescricao] = useState(plano?.descricao ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro("");
    const v = Number(valor.replace(",", "."));
    const d = Number(duracao);
    if (!nome.trim()) return setErro("Informe o nome do plano.");
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor válido.");
    if (!Number.isInteger(d) || d < 1) return setErro("Duração inválida.");

    setEnviando(true);
    const url = editando ? `/api/planos/${plano!.id}` : "/api/planos";
    const method = editando ? "PATCH" : "POST";
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          valorMensal: v,
          duracaoDias: d,
          descricao,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErro(data?.erro ?? "Não foi possível salvar.");
        setEnviando(false);
        return;
      }
      onSalvo();
    } catch {
      setErro("Falha de conexão.");
      setEnviando(false);
    }
  }

  return (
    // Sem fechar no clique do fundo: o formulário está preenchido e o clique
    // fora do campo apagava tudo. Sai por Cancelar (ou Esc, fora do envio).
    <Modal onFechar={onFechar} fecharComEsc={!enviando}>
        <TituloModal>{editando ? "Editar plano" : "Novo plano"}</TituloModal>

        <div className="mt-5 flex flex-col gap-4">
          <Campo rotulo="Nome">
            {(a) => (
              <input
                {...a}
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Mensal, Trimestral…"
                className={classeCampo}
              />
            )}
          </Campo>
          <Campo rotulo="Valor mensal (R$)">
            {(a) => (
              <input
                {...a}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className={classeCampo}
              />
            )}
          </Campo>
          <Campo
            rotulo="Duração (dias)"
            ajuda="30 = mensal · 90 = trimestral · 180 = semestral · 365 = anual"
          >
            {(a) => (
              <input
                {...a}
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                inputMode="numeric"
                placeholder="30"
                className={classeCampo}
              />
            )}
          </Campo>
          <Campo rotulo="Descrição (opcional)">
            {(a) => (
              <input
                {...a}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className={classeCampo}
              />
            )}
          </Campo>
        </div>

        {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

        <div className="mt-5 flex gap-3">
          <Botao variante="primario" tamanho="lg" onClick={enviar} carregando={enviando} className="flex-1">
            {enviando ? "Salvando…" : editando ? "Salvar" : "Criar plano"}
          </Botao>
          <Botao tamanho="lg" onClick={onFechar}>
            Cancelar
          </Botao>
        </div>
    </Modal>
  );
}

type ThProps = {
  children: React.ReactNode;
  className?: string;
} & (
  | { coluna?: undefined; atual?: undefined; direcao?: undefined; onOrdenar?: undefined }
  | {
      coluna: Coluna;
      atual: Coluna;
      direcao: Direcao;
      onOrdenar: (c: Coluna) => void;
    }
);

function Th({ children, className, coluna, atual, direcao, onOrdenar }: ThProps) {
  const base = cn(
    "px-4 py-3 text-xs font-semibold text-faint",
    className,
  );

  if (!coluna) return <th className={base}>{children}</th>;

  const ordenada = atual === coluna;
  return (
    <th
      className={base}
      aria-sort={
        ordenada
          ? direcao === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button type="button"
        onClick={() => onOrdenar(coluna)}
        className={cn(
          "inline-flex items-center gap-1.5 transition-colors hover:text-ink",
          ordenada && "text-ink",
          className?.includes("text-right") && "flex-row-reverse",
        )}
      >
        {children}
        <span aria-hidden className={cn("text-xs", !ordenada && "opacity-25")}>
          {ordenada && direcao === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}
