"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatarDataCompleta, formatarHora, HORAS, MODALIDADES } from "@/lib/aula-experimental";
import { lerResultado, sinalDeTempo } from "@/lib/operacao";
import type { AulaExperimentalItem } from "@/lib/types";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";

type Editada = { aula: AulaExperimentalItem; mudouHorario: boolean; mensagem: string; waLink: string };

function ehEditada(v: unknown): v is Editada {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.aula === "object" && o.aula !== null && typeof o.mensagem === "string" && typeof o.waLink === "string";
}

/**
 * Botão "Editar" + modal para corrigir uma aula já marcada (dia, horário,
 * modalidade, nome, celular). Se o horário mudou, oferece a confirmação
 * corrigida para mandar pelo WhatsApp — nada sai sozinho daqui.
 */
export function EditarAula({ aula, className }: { aula: AulaExperimentalItem; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn("text-xs font-medium text-muted transition-colors hover:text-ink hover:underline", className)}
      >
        Editar
      </button>
      {aberto && <Formulario aula={aula} onFechar={() => setAberto(false)} />}
    </>
  );
}

function Formulario({ aula, onFechar }: { aula: AulaExperimentalItem; onFechar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(aula.nome);
  const [telefone, setTelefone] = useState(aula.telefone);
  const [modalidade, setModalidade] = useState(aula.modalidade);
  const [data, setData] = useState(aula.data);
  const [hora, setHora] = useState(aula.hora);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [incerto, setIncerto] = useState(false);
  const [feito, setFeito] = useState<Editada | null>(null);
  const [copiado, setCopiado] = useState(false);
  const emVoo = useRef(false);

  const modalidades: string[] = (MODALIDADES as readonly string[]).includes(aula.modalidade)
    ? [...MODALIDADES]
    : [...MODALIDADES, aula.modalidade];
  const pronto = nome.trim() && telefone.replace(/\D/g, "").length >= 10 && data;

  async function salvar() {
    if (!pronto || emVoo.current) return;
    emVoo.current = true;
    setEnviando(true);
    setErro("");
    const r = await lerResultado(
      fetch(`/api/captacao/aulas/${aula.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, modalidade, data, hora }),
        signal: sinalDeTempo(),
      }),
      ehEditada,
      "Não foi possível salvar a aula.",
    );
    emVoo.current = false;
    setEnviando(false);
    if (r.tipo === "ok") {
      router.refresh();
      if (r.dados.mudouHorario) setFeito(r.dados);
      else onFechar();
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
        <TituloModal>Aula corrigida</TituloModal>
        <DescricaoModal className="mt-0.5">
          {feito.aula.nome} · {feito.aula.modalidade} · {formatarDataCompleta(feito.aula.data)} às{" "}
          {formatarHora(feito.aula.hora)}
        </DescricaoModal>
        <p className="mt-4 text-sm text-ink">
          O horário mudou. Se a pessoa já recebeu a confirmação antiga, mande a corrigida:
        </p>
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
        <p className="mt-2 text-xs text-faint">O lembrete da véspera sai sozinho com o horário novo.</p>
        <Botao variante="contorno" bloco onClick={onFechar} className="mt-5">
          Concluir
        </Botao>
      </Modal>
    );
  }

  return (
    <Modal onFechar={onFechar} fecharComEsc={!enviando} className="max-w-lg">
      <TituloModal>Editar aula experimental</TituloModal>
      <DescricaoModal className="mt-0.5">Corrija o que foi marcado errado. Nada é enviado para a pessoa ao salvar.</DescricaoModal>

      <div className="mt-4 grid gap-4">
        <Campo rotulo="Nome">
          {(a) => (
            <input {...a} autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} className={classeCampo} disabled={enviando} />
          )}
        </Campo>
        <Campo rotulo="Celular (com DDD)">
          {(a) => (
            <input
              {...a}
              inputMode="tel"
              autoComplete="off"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className={classeCampo}
              disabled={enviando}
            />
          )}
        </Campo>

        <fieldset disabled={enviando}>
          <legend className="mb-2 text-sm font-medium text-ink">Modalidade</legend>
          <div className="flex flex-wrap gap-1.5">
            {modalidades.map((m) => (
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
              <input {...a} type="date" value={data} onChange={(e) => setData(e.target.value)} className={classeCampo} disabled={enviando} />
            )}
          </Campo>
          <Campo rotulo="Horário">
            {(a) => (
              <select {...a} value={hora} onChange={(e) => setHora(Number(e.target.value))} className={classeCampo} disabled={enviando}>
                {HORAS.map((h) => (
                  <option key={h} value={h}>
                    {formatarHora(h)}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </div>
      </div>

      {erro && <MensagemErro className="mt-4">{erro}</MensagemErro>}
      {incerto && (
        <MensagemErro className="mt-4">
          Sem confirmação do servidor. A alteração pode ter sido salva — feche e confira a agenda.
        </MensagemErro>
      )}

      <div className="mt-5 flex gap-3">
        <Botao variante="primario" tamanho="lg" className="flex-1" onClick={() => void salvar()} carregando={enviando} disabled={!pronto || incerto}>
          {enviando ? "Salvando…" : "Salvar"}
        </Botao>
        <Botao tamanho="lg" onClick={onFechar} disabled={enviando}>
          Cancelar
        </Botao>
      </div>
    </Modal>
  );
}
