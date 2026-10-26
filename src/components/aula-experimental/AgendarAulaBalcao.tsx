"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  formatarDataCompleta,
  formatarHora,
  hojeNaAcademia,
  HORAS,
  MODALIDADES,
  OBSERVACAO_MAX,
  type Modalidade,
} from "@/lib/aula-experimental";
import { lerResultado, sinalDeTempo } from "@/lib/operacao";
import type { AulaExperimentalItem } from "@/lib/types";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao, classeBotao, type VarianteBotao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";
import { IconeSetaDireita } from "@/components/ui/editorial";

type Achado = { personId: string | null; nome: string | null; fase: string | null; conversaId: string | null };
type Agendada = { aula: AulaExperimentalItem; leadCriado: boolean; mensagem: string; waLink: string };

function ehAgendada(v: unknown): v is Agendada {
  return typeof v === "object" && v !== null && typeof (v as Agendada).aula?.id === "string";
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

const FASE: Record<string, string> = { lead: "lead", aluno: "aluno", exaluno: "ex-aluno" };

/**
 * Botão + diálogo para marcar aula experimental no balcão, sem passar pelo
 * Atendimento. O outro caminho (a conversa no Atendimento) continua: lá a
 * confirmação sai pela conversa; aqui a aula entra na agenda e a recepção
 * manda a confirmação pelo WhatsApp dela, com o texto pronto.
 *
 * Telefone de alguém que já existe liga a aula ao cadastro (e à conversa, se
 * houver) — a tela mostra quem é antes de gravar. Número novo vira lead.
 */
export function AgendarAulaBalcao({
  dia,
  rotulo = "Agendar aula",
  variante = "primario",
  tamanho = "lg",
  className,
}: {
  /** Dia que o formulário abre preenchido (o selecionado no calendário). */
  dia?: string;
  rotulo?: string;
  variante?: VarianteBotao;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  // Remonta o formulário a cada abertura: nada de dados do agendamento anterior.
  const [chave, setChave] = useState(0);
  return (
    <>
      <Botao
        variante={variante}
        tamanho={tamanho}
        className={className}
        onClick={() => {
          setChave((k) => k + 1);
          setAberto(true);
        }}
      >
        {rotulo}
        <IconeSetaDireita />
      </Botao>
      {aberto && <Formulario key={chave} dia={dia} onFechar={() => setAberto(false)} />}
    </>
  );
}

function Formulario({ dia, onFechar }: { dia?: string; onFechar: () => void }) {
  const router = useRouter();
  const hoje = hojeNaAcademia();
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [achado, setAchado] = useState<Achado | null>(null);
  const [modalidade, setModalidade] = useState<Modalidade | null>(null);
  const [data, setData] = useState(dia && dia >= hoje ? dia : hoje);
  const [hora, setHora] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<Agendada | null>(null);
  const [incerto, setIncerto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const emVoo = useRef(false);
  const ultimaBusca = useRef("");

  async function procurar() {
    const d = soDigitos(telefone);
    if (d.length < 10 || d === ultimaBusca.current) return;
    ultimaBusca.current = d;
    try {
      const r = await fetch(`/api/aulas-experimentais?telefone=${d}`, { cache: "no-store" });
      const a = (await r.json()) as Achado;
      if (soDigitos(telefone) !== d) return; // digitou outro número no meio
      setAchado(a);
      if (a.nome && !nome.trim()) setNome(a.nome);
    } catch {
      // Sem a busca, grava igual — o servidor procura de novo.
    }
  }

  const telefoneOk = soDigitos(telefone).length >= 10;
  const pronto = telefoneOk && nome.trim() && modalidade && data >= hoje && hora !== null;

  async function agendar() {
    if (!pronto || emVoo.current) return;
    emVoo.current = true;
    setEnviando(true);
    setErro("");
    const r = await lerResultado(
      fetch("/api/aulas-experimentais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, modalidade, data, hora, observacao }),
        signal: sinalDeTempo(),
      }),
      ehAgendada,
      "Não foi possível marcar a aula.",
    );
    emVoo.current = false;
    setEnviando(false);
    if (r.tipo === "ok") {
      setFeito(r.dados);
      router.refresh();
    } else if (r.tipo === "falha") setErro(r.erro);
    else setIncerto(true);
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      window.prompt("Copie a mensagem:", texto);
    }
  }

  if (feito) {
    return (
      <Modal onFechar={onFechar} className="max-w-lg">
        <TituloModal>Aula marcada</TituloModal>
        <DescricaoModal className="mt-0.5">
          {feito.aula.nome} · {feito.aula.modalidade} · {formatarDataCompleta(feito.aula.data)} às{" "}
          {formatarHora(feito.aula.hora)}
        </DescricaoModal>
        <ul className="mt-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-3 text-sm text-ink">
          <li>✓ Entrou na agenda</li>
          <li>{feito.leadCriado ? "✓ Cadastrada como lead novo (origem balcão)" : "✓ Ligada ao cadastro que já existia"}</li>
          <li className="text-muted">A confirmação ainda não foi enviada — mande pelo WhatsApp abaixo.</li>
        </ul>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 font-sans text-xs text-ink">
          {feito.mensagem}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={feito.waLink} target="_blank" rel="noreferrer" className={classeBotao({ variante: "primario", tamanho: "md" })}>
            Abrir WhatsApp com a mensagem
          </a>
          <Botao tamanho="md" onClick={() => void copiar(feito.mensagem)}>
            {copiado ? "Mensagem copiada" : "Copiar mensagem"}
          </Botao>
        </div>
        <p className="mt-2 text-xs text-faint">Abrir o WhatsApp não confirma que a mensagem foi enviada.</p>
        <Botao variante="contorno" bloco onClick={onFechar} className="mt-5">
          Concluir
        </Botao>
      </Modal>
    );
  }

  return (
    <Modal onFechar={onFechar} fecharComEsc={!enviando} className="max-w-lg">
      <TituloModal>Agendar aula experimental</TituloModal>
      <DescricaoModal className="mt-0.5">
        Marca na agenda. A confirmação você manda depois, pelo WhatsApp, com o texto pronto.
      </DescricaoModal>

      <div className="mt-5 grid gap-4">
        <Campo rotulo="Celular (com DDD)">
          {(a) => (
            <input
              {...a}
              inputMode="tel"
              autoComplete="off"
              value={telefone}
              onChange={(e) => {
                setTelefone(e.target.value);
                setAchado(null);
              }}
              onBlur={() => void procurar()}
              placeholder="(11) 98765-4321"
              className={classeCampo}
              disabled={enviando}
            />
          )}
        </Campo>
        {achado?.personId && (
          <p role="status" className="-mt-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-xs text-ink">
            Já cadastrado: <strong>{achado.nome}</strong> ({FASE[achado.fase ?? ""] ?? achado.fase})
            {achado.conversaId ? " · tem conversa no Atendimento" : ""}. A aula fica ligada a esse cadastro.
          </p>
        )}
        {achado && !achado.personId && telefoneOk && (
          <p role="status" className="-mt-2 text-xs text-muted">Número novo — vira lead ao agendar.</p>
        )}

        <Campo rotulo="Nome">
          {(a) => (
            <input
              {...a}
              autoComplete="off"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={classeCampo}
              disabled={enviando}
            />
          )}
        </Campo>

        <fieldset disabled={enviando}>
          <legend className="mb-2 text-sm font-medium text-ink">Modalidade</legend>
          <div className="flex flex-wrap gap-1.5">
            {MODALIDADES.map((m) => (
              <button
                type="button"
                key={m}
                aria-pressed={modalidade === m}
                onClick={() => setModalidade(m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  modalidade === m ? "border-brand bg-brand-soft font-semibold text-ink" : "border-border-strong text-ink hover:border-control",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Dia">
            {(a) => (
              <input
                {...a}
                type="date"
                min={hoje}
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={classeCampo}
                disabled={enviando}
              />
            )}
          </Campo>
          <Campo rotulo="Horário">
            {(a) => (
              <select
                {...a}
                value={hora ?? ""}
                onChange={(e) => setHora(e.target.value === "" ? null : Number(e.target.value))}
                className={classeCampo}
                disabled={enviando}
              >
                <option value="">Escolha…</option>
                {HORAS.map((h) => (
                  <option key={h} value={h}>
                    {formatarHora(h)}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </div>

        <Campo rotulo="Observação (opcional)">
          {(a) => (
            <textarea
              {...a}
              rows={2}
              maxLength={OBSERVACAO_MAX}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: vem com a mãe"
              className={classeCampo}
              disabled={enviando}
            />
          )}
        </Campo>
      </div>

      {erro && <MensagemErro className="mt-4">{erro}</MensagemErro>}
      {incerto && (
        <MensagemErro className="mt-4">
          Sem confirmação do servidor. A aula pode ter sido marcada — feche e confira a agenda antes de tentar de novo.
        </MensagemErro>
      )}

      <div className="mt-5 flex gap-3">
        <Botao
          variante="primario"
          tamanho="lg"
          className="flex-1"
          onClick={() => void agendar()}
          carregando={enviando}
          disabled={!pronto || incerto}
        >
          {enviando ? "Marcando…" : "Marcar aula"}
        </Botao>
        <Botao tamanho="lg" onClick={onFechar} disabled={enviando}>
          Cancelar
        </Botao>
      </div>
    </Modal>
  );
}
