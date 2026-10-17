"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { PlanoComContagem } from "@/components/cobranca/GestaoPlanos";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";

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
    // Sem fechar no fundo (formulário). Esc = Cancelar, fora do envio.
    <Modal onFechar={onFechar} fecharComEsc={!enviando} className="max-w-lg">
        <TituloModal>Mesclar {planos.length} planos</TituloModal>
        <DescricaoModal>
          Escolha o plano base. Todos os {totalAlunos} aluno(s) passam para ele.
        </DescricaoModal>

        <fieldset className="mt-4">
        <legend className="sr-only">Plano base</legend>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {planos.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  name="base"
                  checked={destinoId === p.id}
                  onChange={() => escolherBase(p)}
                  className="h-4 w-4 accent-brand"
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
                <span className="text-xs text-muted tabular-nums">{formatBRL(p.valorMensal)}</span>
              </label>
            </li>
          ))}
        </ul>
        </fieldset>

        <div className="mt-4 flex flex-col gap-3">
          <Campo rotulo="Nome do plano">
            {(a) => <input {...a} value={nome} onChange={(e) => setNome(e.target.value)} className={classeCampo} />}
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor/mês (R$)">
              {(a) => (
                <input {...a} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={classeCampo} />
              )}
            </Campo>
            <Campo rotulo="Duração (dias)">
              {(a) => (
                <input {...a} inputMode="numeric" value={duracao} onChange={(e) => setDuracao(e.target.value)} className={classeCampo} />
              )}
            </Campo>
          </div>
          <p className="text-xs text-faint">
            O novo valor vale para matrículas e renovações. Assinaturas já ativas no Asaas continuam
            cobrando o valor de hoje.
          </p>
        </div>

        {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

        <div className="mt-5 flex justify-end gap-2">
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={mesclar} disabled={!nome.trim()} carregando={enviando}>
            {enviando ? "Mesclando…" : "Mesclar"}
          </Botao>
        </div>
    </Modal>
  );
}
