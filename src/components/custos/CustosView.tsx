"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Stat } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL, formatData } from "@/lib/mock-data";
import type { Despesa } from "@/lib/types";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { MensagemErro, classeCampo, classeRotulo } from "@/components/ui/Campo";

const CATEGORIAS = [
  "Luz",
  "Água",
  "Internet",
  "Aluguel",
  "Salários",
  "Limpeza",
  "Manutenção",
  "Marketing",
];

export function CustosView({
  despesas,
  receita,
}: {
  despesas: Despesa[];
  receita: number;
}) {
  const router = useRouter();
  const [modalCategoria, setModalCategoria] = useState<string | null>(null);

  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const lucro = receita - totalDespesas;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;

  async function excluir(id: string) {
    await fetch(`/api/despesas/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* relatório de lucro */}
      <section>
        <h2 className="mb-4 font-display text-sm font-semibold text-faint">
          Resultado do mês
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="Receita recorrente"
            value={formatBRL(receita)}
            tone="ok"
            hint="MRR da base ativa"
          />
          <Stat
            label="Despesas lançadas"
            value={formatBRL(totalDespesas)}
            tone="danger"
            hint={`${despesas.length} lançamento${despesas.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Lucro"
            value={formatBRL(lucro)}
            tone={lucro >= 0 ? "ok" : "danger"}
            hint={`Margem ${margem.toFixed(1).replace(".", ",")}%`}
          />
        </div>
      </section>

      {/* lançar despesa */}
      <section>
        <h2 className="mb-4 font-display text-sm font-semibold text-faint">
          Lançar despesa
        </h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((cat) => (
            <button type="button"
              key={cat}
              onClick={() => setModalCategoria(cat)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-red/40 hover:bg-surface-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              + {cat}
            </button>
          ))}
          <button type="button"
            onClick={() => setModalCategoria("")}
            className={classeBotao({ variante: "secundario", tamanho: "sm" })}
          >
            + Outra despesa
          </button>
        </div>
      </section>

      {/* lista de despesas */}
      <section>
        <h2 className="mb-4 font-display text-sm font-semibold text-faint">
          Despesas lançadas
        </h2>
        <Card className="overflow-hidden">
          {despesas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-faint">
              Nenhuma despesa lançada ainda.
            </p>
          ) : (
            <>
            {/* mobile: cards empilhados, sem scroll horizontal */}
            <div className="divide-y divide-border sm:hidden">
              {despesas.map((d) => (
                <div key={d.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {d.categoria}
                        {d.recorrente && (
                          <span className="ml-2 text-xs text-warn">
                            fixa
                          </span>
                        )}
                      </p>
                      {d.descricao && (
                        <p className="text-xs text-muted">{d.descricao}</p>
                      )}
                      <p className="text-xs text-faint">{formatData(d.data)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-danger">
                      {formatBRL(d.valor)}
                    </span>
                  </div>
                  <div className="text-right">
                    <button type="button"
                      onClick={() => excluir(d.id)}
                      className="text-xs font-medium text-faint transition-colors hover:text-danger"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* desktop: tabela */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Data</Th>
                    <Th>Categoria</Th>
                    <Th>Descrição</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody className="cascata">
                  {despesas.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 text-faint">{formatData(d.data)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{d.categoria}</span>
                        {d.recorrente && (
                          <span className="ml-2 text-xs text-warn">
                            fixa
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{d.descricao || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-danger">
                        {formatBRL(d.valor)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button"
                          onClick={() => excluir(d.id)}
                          className="text-xs font-medium text-faint transition-colors hover:text-danger"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>
      </section>

      {modalCategoria !== null && (
        <ModalDespesa
          categoriaInicial={modalCategoria}
          onFechar={() => setModalCategoria(null)}
          onCriado={() => {
            setModalCategoria(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ModalDespesa({
  categoriaInicial,
  onFechar,
  onCriado,
}: {
  categoriaInicial: string;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [recorrente, setRecorrente] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro("");
    const v = Number(valor.replace(",", "."));
    if (!categoria.trim()) return setErro("Informe a categoria.");
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor válido.");

    setEnviando(true);
    try {
      const r = await fetch("/api/despesas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria,
          descricao,
          valor: v,
          data: new Date(data).toISOString(),
          recorrente,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErro(d?.erro ?? "Não foi possível lançar.");
        setEnviando(false);
        return;
      }
      onCriado();
    } catch {
      setErro("Falha de conexão.");
      setEnviando(false);
    }
  }

  return (
    // Clique no fundo não fecha: o lançamento já digitado se perdia.
    // Esc fecha como o Cancelar, exceto durante o envio.
    <Modal onFechar={onFechar} fecharComEsc={!enviando}>
        <TituloModal>Nova despesa</TituloModal>

        <div className="mt-5 flex flex-col gap-3">
          <label className="block">
            <span className={classeRotulo}>Categoria</span>
            <input
              autoFocus={!categoriaInicial}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Luz, Água, Aluguel…"
              className={classeCampo}
            />
          </label>
          <label className="block">
            <span className={classeRotulo}>Valor (R$)</span>
            <input
              autoFocus={!!categoriaInicial}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={classeCampo}
            />
          </label>
          <label className="block">
            <span className={classeRotulo}>Descrição (opcional)</span>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={classeCampo}
            />
          </label>
          <label className="block">
            <span className={classeRotulo}>Data</span>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={classeCampo}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Despesa fixa mensal (recorrente)
          </label>
        </div>

        {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

        <div className="mt-5 flex gap-3">
          <Botao variante="primario" tamanho="lg" onClick={enviar} carregando={enviando} className="flex-1">
            {enviando ? "Lançando…" : "Lançar despesa"}
          </Botao>
          <button type="button"
            onClick={onFechar}
            className={classeBotao({ variante: "secundario", tamanho: "lg" })}
          >
            Cancelar
          </button>
        </div>
    </Modal>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold text-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}
