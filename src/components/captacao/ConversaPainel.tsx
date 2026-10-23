"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RespostasProntas } from "@/components/captacao/RespostasProntas";
import { AulaExperimentalPainel } from "@/components/captacao/AulaExperimentalPainel";
import { BarraAcoes } from "@/components/captacao/conversa/BarraAcoes";
import { Bolha } from "@/components/captacao/conversa/Bolha";
import { CaixaResposta } from "@/components/captacao/conversa/CaixaResposta";
import { ConfirmarExclusao } from "@/components/captacao/conversa/ConfirmarExclusao";
import { ehPagina, useHistorico, type RespostaPagina } from "@/components/captacao/conversa/useHistorico";
import { prefixoAssinatura } from "@/lib/whatsapp/assinatura";
import {
  confirmarOtimista,
  marcarOtimista,
  mesclarMensagens,
  novoIdOtimista,
  type MensagemTela,
} from "@/lib/whatsapp/historico";
import {
  apagarRascunho,
  conviteTratado,
  guardarRascunho,
  lerRascunho,
  marcarConviteTratado,
} from "@/lib/whatsapp/rascunhos";
import { lerResultado, sinalDeTempo, temOk } from "@/lib/operacao";
import type { CitacaoItem, ConversaInteresse, ConversaResumo, MensagemItem } from "@/lib/types";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";

/** Quanto tempo a mensagem fica acesa depois de pular até ela. */
const DESTAQUE_MS = 1_600;

function agoraISO() {
  return new Date().toISOString();
}

type RespostaEnvio = RespostaPagina & { mensagem?: MensagemItem | null };

function mensagemDoCorpo(corpo: Record<string, unknown>): MensagemItem | null {
  const m = corpo.mensagem as MensagemItem | null | undefined;
  return m && typeof m.id === "string" ? m : null;
}

/** Histórico da conversa + resposta manual + classificação do atendimento. */
export function ConversaPainel({
  conversa,
  assinatura,
  enterEnvia,
  convite,
  podeResponder,
  podeApagar,
  onConversaAtualizada,
  onConversaRemovida,
  onRascunhoMudou,
}: {
  conversa: ConversaResumo;
  /**
   * Convite de remarcação pedido pela agenda. É intenção de preparar texto,
   * nunca de enviar: cai na caixa (ou, havendo rascunho, pergunta antes).
   */
  convite?: { data: string; texto: string };
  /**
   * Login de quem atende. A assinatura de verdade é colada no servidor; aqui
   * ela serve só para a bolha otimista já nascer igual ao que vai sair.
   */
  assinatura: string;
  /** Preferência de teclado da conta: Enter envia, ou quebra linha. */
  enterEnvia: boolean;
  podeResponder: boolean;
  /** Limpar/remover apagam trilha de atendimento — só ADMIN. */
  podeApagar: boolean;
  onConversaAtualizada: (c: ConversaResumo) => void;
  onConversaRemovida: (id: string) => void;
  /** Avisa a lista quando o rascunho desta conversa aparece ou some. */
  onRascunhoMudou?: () => void;
}) {
  const prefixo = prefixoAssinatura(assinatura);
  const conversaId = conversa.id;
  const {
    mensagens,
    alterar,
    esvaziar,
    carregando,
    erroAbertura,
    temAnteriores,
    carregandoAnteriores,
    erroAnteriores,
    carregarAnteriores,
    buscarNovidades,
    rolagem,
    aoRolar,
    novasAbaixo,
    irParaFim,
  } = useHistorico(conversaId);

  // O rascunho desta conversa (se houver) volta para a caixa — nunca é enviado
  // ao voltar. O convite pedido pela agenda só entra sozinho com a caixa vazia.
  const [inicio] = useState(() => {
    const r = lerRascunho(conversaId);
    const conviteNovo = convite && !conviteTratado(conversaId, convite.data) ? convite : null;
    const temTexto = !!r?.texto.trim();
    return {
      texto: !temTexto && conviteNovo ? conviteNovo.texto : (r?.texto ?? ""),
      citando: r?.citando ?? null,
      // Rascunho diferente do convite: a escolha é de quem atende.
      conviteEmEspera: temTexto && conviteNovo && r?.texto !== conviteNovo.texto ? conviteNovo : null,
      conviteCarregado: !temTexto && conviteNovo ? conviteNovo : null,
    };
  });

  const [texto, setTextoEstado] = useState(inicio.texto);
  const [conviteEmEspera, setConviteEmEspera] = useState(inicio.conviteEmEspera);
  const [anexando, setAnexando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState<"limpar" | "remover" | null>(null);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState("");
  const [classificando, setClassificando] = useState(false);
  const [mostrandoRespostas, setMostrandoRespostas] = useState(false);
  const [mostrandoAula, setMostrandoAula] = useState(false);
  const [aberturasAula, setAberturasAula] = useState(0);
  const [citando, setCitandoEstado] = useState<MensagemItem | null>(inicio.citando);
  const [destacada, setDestacada] = useState<string | null>(null);

  const caixa = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const enviandoBinario = useRef(false);

  // O convite carregado sozinho conta como tratado: voltar a esta conversa não
  // o escreve de novo por cima do que a pessoa editou.
  useEffect(() => {
    if (inicio.conviteCarregado) marcarConviteTratado(conversaId, inicio.conviteCarregado.data);
  }, [conversaId, inicio.conviteCarregado]);

  const temConteudo = texto.trim().length > 0;
  const temRascunhoAgora = temConteudo || !!citando;
  const avisouRascunho = useRef(temRascunhoAgora);
  useEffect(() => {
    if (avisouRascunho.current !== temRascunhoAgora) {
      avisouRascunho.current = temRascunhoAgora;
      onRascunhoMudou?.();
    }
  }, [temRascunhoAgora, onRascunhoMudou]);

  function setTexto(t: string) {
    setTextoEstado(t);
    guardarRascunho(conversaId, { texto: t, citando });
  }
  function setCitando(m: MensagemItem | null) {
    setCitandoEstado(m);
    guardarRascunho(conversaId, { texto, citando: m });
  }

  /* ---------- citação ---------- */

  function autorDe(m: MensagemItem): string | null {
    if (m.direcao === "OUT") return m.autorNome ?? "Você";
    return m.remetente ?? conversa.nome;
  }

  function citar(m: MensagemItem) {
    setCitando(m);
    caixa.current?.focus();
  }

  function irPara(id: string) {
    const alvo = document.getElementById(`msg-${id}`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    setDestacada(id);
    setTimeout(() => setDestacada((a) => (a === id ? null : a)), DESTAQUE_MS);
  }

  function citacaoOtimista(): CitacaoItem | null {
    if (!citando) return null;
    return { id: citando.id, texto: citando.texto, autor: autorDe(citando) };
  }

  /* ---------- envio ---------- */

  async function responder() {
    const conteudo = texto.trim();
    if (!conteudo) return;
    setErro("");
    const citada = citacaoOtimista();
    const citarId = citando?.id;
    // Libera a caixa na hora; o que for digitado daqui em diante é outra
    // mensagem, e a resposta deste envio nunca mexe nela.
    setTextoEstado("");
    setCitandoEstado(null);
    apagarRascunho(conversaId);

    const tempId = novoIdOtimista();
    const otimista: MensagemTela = {
      id: tempId,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorNome: null,
      remetente: null,
      texto: conteudo.startsWith(prefixo.trimEnd()) ? conteudo : prefixo + conteudo,
      tipoMidia: "texto",
      enviadaEm: agoraISO(),
      erro: null,
      citavel: false, // ainda não existe no WhatsApp: citar não teria a quem apontar
      citada,
      envio: "enviando",
    };
    alterar((antigas) => [...antigas, otimista], { fim: true });

    const res = await lerResultado(
      fetch(`/api/whatsapp/conversas/${conversaId}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: conteudo, ...(citarId ? { citarId } : {}) }),
        signal: sinalDeTempo(),
      }),
      (v): v is RespostaEnvio => ehPagina(v),
      "Não foi possível enviar.",
    );

    if (res.tipo === "ok") {
      alterar((a) => confirmarOtimista(a, tempId, res.dados.mensagem ?? null, res.dados.mensagens));
      return;
    }
    if (res.tipo === "falha") {
      // A bolha de erro que o servidor gravou toma o lugar da otimista.
      const gravada = mensagemDoCorpo(res.corpo);
      alterar((a) =>
        gravada ? confirmarOtimista(a, tempId, gravada) : marcarOtimista(a, tempId, "falhou", res.erro),
      );
      setErro(res.erro);
      return;
    }
    alterar((a) => marcarOtimista(a, tempId, "incerto", null));
    setErro("Sem confirmação do servidor. A mensagem pode ter saído — confira a conversa antes de enviar de novo.");
  }

  /**
   * Texto de uma bolha que falhou de volta à caixa — só com a caixa vazia: o
   * que já foi digitado depois nunca é apagado para dar lugar ao antigo.
   */
  function recolocar(m: MensagemTela) {
    if (temConteudo) return;
    const semAssinatura = m.texto.startsWith(prefixo) ? m.texto.slice(prefixo.length) : m.texto;
    setTexto(semAssinatura);
    caixa.current?.focus();
  }

  /**
   * Anexo (imagem/PDF, com o texto digitado de legenda) e áudio gravado (sem
   * legenda). O resultado entra no histórico carregado — não o substitui.
   */
  async function enviarBinario(arquivo: File, { comLegenda }: { comLegenda: boolean }) {
    if (enviandoBinario.current) return;
    enviandoBinario.current = true;
    setAnexando(true);
    setErro("");
    const legenda = comLegenda && temConteudo ? texto.trim() : "";
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      if (legenda) form.append("texto", legenda);
      if (citando) form.append("citarId", citando.id);
      const res = await lerResultado(
        fetch(`/api/whatsapp/conversas/${conversaId}/mensagens`, {
          method: "POST",
          body: form,
          signal: sinalDeTempo(),
        }),
        (v): v is RespostaEnvio => ehPagina(v),
        "Não foi possível enviar.",
      );
      if (res.tipo === "ok") {
        alterar(
          (a) =>
            mesclarMensagens(a, res.dados.mensagem ? [...res.dados.mensagens, res.dados.mensagem] : res.dados.mensagens),
          { fim: true },
        );
        setCitando(null);
        // A legenda só sai da caixa se foi junto — e se a caixa não mudou.
        if (legenda && texto.trim() === legenda) setTexto("");
      } else if (res.tipo === "falha") {
        setErro(res.erro);
        void buscarNovidades(); // a falha fica registrada na conversa
      } else {
        setErro(
          "Sem confirmação do servidor. O arquivo pode ter sido enviado — confira a conversa antes de enviar de novo.",
        );
        void buscarNovidades();
      }
    } finally {
      enviandoBinario.current = false;
      setAnexando(false);
    }
  }

  /* ---------- administração ---------- */

  async function apagar() {
    const tipo = confirmando;
    if (!tipo || apagando) return;
    setApagando(true);
    setErroApagar("");
    const url =
      tipo === "limpar"
        ? `/api/whatsapp/conversas/${conversaId}/mensagens`
        : `/api/whatsapp/conversas/${conversaId}`;
    const res = await lerResultado(fetch(url, { method: "DELETE" }), temOk, "Não foi possível concluir.");
    setApagando(false);
    if (res.tipo === "ok") {
      setConfirmando(null);
      if (tipo === "limpar") esvaziar();
      else onConversaRemovida(conversaId);
      return;
    }
    setErroApagar(res.tipo === "falha" ? res.erro : "Sem confirmação do servidor. Recarregue a conversa para ver o estado atual.");
  }

  /** Um toque na bandeira classifica e move o lead no funil na hora. */
  async function classificar(interesse: ConversaInteresse) {
    if (classificando || interesse === conversa.interesse) return;
    setClassificando(true);
    setErro("");
    const res = await lerResultado(
      fetch(`/api/whatsapp/conversas/${conversaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interesse }),
      }),
      (v): v is { conversa: ConversaResumo } =>
        typeof v === "object" && v !== null && typeof (v as { conversa?: { id?: unknown } }).conversa?.id === "string",
      "Não foi possível classificar.",
    );
    setClassificando(false);
    if (res.tipo === "ok") {
      onConversaAtualizada(res.dados.conversa);
      router.refresh(); // a Captação lê o estágio do servidor
    } else {
      setErro(res.tipo === "falha" ? res.erro : "Sem confirmação da classificação. Confira a bandeira antes de tocar de novo.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <BarraAcoes
        conversa={conversa}
        podeResponder={podeResponder}
        podeApagar={podeApagar}
        classificando={classificando}
        onClassificar={(i) => void classificar(i)}
        mostrandoRespostas={mostrandoRespostas}
        onAlternarRespostas={() => {
          setMostrandoRespostas((a) => !a);
          setMostrandoAula(false);
        }}
        mostrandoAula={mostrandoAula}
        onAlternarAula={() => {
          const abrindo = !mostrandoAula;
          setMostrandoAula(abrindo);
          if (abrindo) setAberturasAula((n) => n + 1);
          setMostrandoRespostas(false);
        }}
        onConfirmar={setConfirmando}
      />

      {confirmando && (
        <ConfirmarExclusao
          tipo={confirmando}
          nome={conversa.nome}
          apagando={apagando}
          erro={erroApagar}
          onCancelar={() => {
            if (apagando) return;
            setConfirmando(null);
            setErroApagar("");
          }}
          onConfirmar={() => void apagar()}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={rolagem} onScroll={aoRolar} className="h-full overflow-y-auto px-3 py-3 sm:px-4">
          {carregando ? (
            <p className="py-10 text-center text-sm text-muted">Carregando conversa…</p>
          ) : erroAbertura ? (
            <MensagemErro className="justify-center py-10">{erroAbertura}</MensagemErro>
          ) : mensagens.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nenhuma mensagem ainda.</p>
          ) : (
            <>
              {temAnteriores ? (
                <div className="mb-3 flex flex-col items-center gap-1.5">
                  <Botao
                    tamanho="sm"
                    onClick={() => void carregarAnteriores()}
                    carregando={carregandoAnteriores}
                  >
                    {carregandoAnteriores ? "Carregando…" : "Carregar mensagens anteriores"}
                  </Botao>
                  {erroAnteriores && (
                    <MensagemErro className="text-xs">{erroAnteriores}</MensagemErro>
                  )}
                </div>
              ) : (
                <p className="mb-3 text-center text-xs text-faint">Início da conversa</p>
              )}
              <div className="flex flex-col gap-2">
                {mensagens.map((m) => (
                  <Bolha
                    key={m.id}
                    mensagem={m}
                    destacada={destacada === m.id}
                    onCitar={podeResponder ? () => citar(m) : undefined}
                    onIrPara={irPara}
                    onRecolocar={podeResponder && !temConteudo ? () => recolocar(m) : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        {/* Novidade enquanto se lê acima: avisa, não puxa a tela nem o foco. */}
        <div role="status" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          {novasAbaixo > 0 && (
            <button
              type="button"
              onClick={irParaFim}
              className="pointer-events-auto rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow-overlay)] hover:bg-brand-hover"
            >
              {novasAbaixo === 1 ? "1 mensagem nova" : `${novasAbaixo} mensagens novas`} ↓
            </button>
          )}
        </div>
      </div>

      {podeResponder && (
        <RespostasProntas
          aberto={mostrandoRespostas}
          onEscolher={(t) => {
            // Escolher nunca envia, e nunca apaga o que já estava escrito.
            setTexto(temConteudo ? `${texto.trimEnd()}\n\n${t}` : t);
            setMostrandoRespostas(false);
            caixa.current?.focus();
          }}
        />
      )}

      {podeResponder && !conversa.ehGrupo && (
        <AulaExperimentalPainel
          key={aberturasAula}
          aberto={mostrandoAula}
          conversaId={conversaId}
          nome={conversa.nome}
          telefone={conversa.telefone}
          onMensagens={(novas) => alterar((a) => mesclarMensagens(a, novas), { fim: true })}
          // Fica aberto com a confirmação à vista; quem fecha é a recepção.
          onAgendada={() => undefined}
          onFechar={() => setMostrandoAula(false)}
        />
      )}

      <div className="border-t border-border px-3 py-3 sm:px-4">
        {podeResponder ? (
          <CaixaResposta
            nome={conversa.nome}
            caixaRef={caixa}
            texto={texto}
            onTexto={setTexto}
            citando={citando ? { autor: autorDe(citando), texto: citando.texto } : null}
            onCancelarCitacao={() => setCitando(null)}
            conviteEmEspera={!!conviteEmEspera}
            onTrocarPeloConvite={() => {
              if (!conviteEmEspera) return;
              setTexto(conviteEmEspera.texto);
              marcarConviteTratado(conversaId, conviteEmEspera.data);
              setConviteEmEspera(null);
              caixa.current?.focus();
            }}
            onManterRascunho={() => {
              if (!conviteEmEspera) return;
              marcarConviteTratado(conversaId, conviteEmEspera.data);
              setConviteEmEspera(null);
            }}
            enterEnvia={enterEnvia}
            anexando={anexando}
            erro={erro}
            onErro={setErro}
            onResponder={() => void responder()}
            onArquivo={(arquivo) => void enviarBinario(arquivo, { comLegenda: true })}
            onAudio={(audio) => void enviarBinario(audio, { comLegenda: false })}
          />
        ) : (
          <p className="text-center text-xs text-muted">Seu perfil pode ler o histórico, mas não responder.</p>
        )}
      </div>
    </div>
  );
}
