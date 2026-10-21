"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { BarraTreino, FotoAluno } from "@/components/clientes/FreelandooAluno";
import { formatData } from "@/lib/mock-data";
import {
  ESTADO_FREELANDOO_LABEL,
  ESTADO_FREELANDOO_TOM,
  motivoFreelandoo,
  type EstadoFreelandoo,
} from "@/lib/freelandoo/rotulos";
import { lerResultado, sinalDeTempo } from "@/lib/operacao";

type Tarefa = {
  tipo: "CRIAR_ACESSO" | "ENVIAR_FOTO" | "ENVIAR_BOAS_VINDAS" | "REENVIAR_LINK";
  status: "PENDENTE" | "EM_ANDAMENTO" | "OK" | "FALHOU";
  tentativas: number;
  ultimoErro: string | null;
  proximaEm: string;
};

type Conta = {
  configurado: boolean;
  estado: EstadoFreelandoo;
  motivo: string | null;
  vinculado: boolean;
  fotoUrl: string | null;
  treino: { nome: string | null; venceEm: string | null; validadeDias: number | null } | null;
  sincronizadoEm: string | null;
  acessoEnviadoEm: string | null;
  emAndamento: Tarefa[];
  falha: Tarefa | null;
};

type Acao = "criar" | "reenviar" | "tentar_de_novo";

const TAREFA: Record<Tarefa["tipo"], string> = {
  CRIAR_ACESSO: "Criando a conta",
  ENVIAR_BOAS_VINDAS: "Enviando o acesso no WhatsApp",
  REENVIAR_LINK: "Gerando um link novo",
  ENVIAR_FOTO: "Enviando a foto do cadastro de face",
};

const TAREFA_FALHOU: Record<Tarefa["tipo"], string> = {
  CRIAR_ACESSO: "Não deu para criar a conta",
  ENVIAR_BOAS_VINDAS: "Não deu para enviar o acesso no WhatsApp",
  REENVIAR_LINK: "Não deu para gerar um link novo",
  ENVIAR_FOTO: "Não deu para enviar a foto",
};

function ehConta(v: unknown): v is Conta {
  return typeof v === "object" && v !== null && "estado" in v && "configurado" in v;
}

function ehRespostaAcao(v: unknown): v is { ok: true; mensagem: string; conta: Conta } {
  return typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === true && ehConta((v as { conta?: unknown }).conta);
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Seção "Freelandoo" da ficha (Q15): situação da conta no app de treinos, o
 * que falta, o que está na fila e os botões. Os botões só enfileiram — a
 * criação e a mensagem saem em até um minuto, pela fila do servidor.
 */
export function FreelandooDoAluno({ personId, nome }: { personId: string; nome: string }) {
  const [conta, setConta] = useState<Conta | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState<Acao | null>(null);
  const emVoo = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/pessoas/${personId}/freelandoo`, { cache: "no-store" });
      if (r.status === 403) return; // papel sem acesso: a seção some
      if (!r.ok) throw new Error();
      const j: unknown = await r.json();
      if (ehConta(j)) {
        setConta(j);
        setErro("");
      }
    } catch {
      setErro("Não foi possível carregar a situação na Freelandoo.");
    }
  }, [personId]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function agir(acao: Acao) {
    if (emVoo.current) return;
    emVoo.current = true;
    setEnviando(acao);
    setErro("");
    setAviso("");
    const res = await lerResultado(
      fetch(`/api/pessoas/${personId}/freelandoo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
        signal: sinalDeTempo(),
      }),
      ehRespostaAcao,
      "Não foi possível concluir.",
    );
    emVoo.current = false;
    setEnviando(null);
    if (res.tipo === "ok") {
      setConta(res.dados.conta);
      setAviso(res.dados.mensagem);
    } else if (res.tipo === "falha") {
      setErro(res.erro);
    } else {
      setErro("Sem confirmação do servidor. Clique em Atualizar antes de tentar de novo.");
    }
  }

  if (!conta) return erro ? <Card className="p-6 text-sm text-danger">{erro}</Card> : null;

  // A foto que espera a conta existir não trava os botões (ela pode esperar dias).
  const naFila = conta.emAndamento.some((t) => t.tipo !== "ENVIAR_FOTO");
  const motivo =
    conta.estado === "falta_dado" || conta.estado === "menor" || conta.estado === "conflito_email"
      ? motivoFreelandoo(conta.motivo)
      : null;
  const naoEnviado = conta.vinculado && conta.estado === "aguardando_aceite" && !conta.acessoEnviadoEm;
  const podeCriar = !conta.vinculado && conta.estado !== "falhou";
  const podeReenviar = conta.vinculado && conta.estado === "aguardando_aceite";
  // Sem conta, quem refaz é o "Criar acesso"; "Tentar de novo" é para o que parou depois.
  const podeTentar = conta.estado === "falhou" || (conta.vinculado && Boolean(conta.falha));

  return (
    <Card className="p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">Freelandoo</h2>
          <Badge tone={ESTADO_FREELANDOO_TOM[conta.estado]}>{ESTADO_FREELANDOO_LABEL[conta.estado]}</Badge>
          {naFila && <Badge tone="info">Na fila</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" tamanho="sm" onClick={() => void carregar()} disabled={Boolean(enviando)}>
            Atualizar
          </Botao>
          {conta.configurado && podeCriar && (
            <Botao
              variante="primario"
              tamanho="sm"
              onClick={() => void agir("criar")}
              carregando={enviando === "criar"}
              disabled={Boolean(enviando) || naFila}
            >
              {enviando === "criar" ? "Enviando…" : "Criar acesso"}
            </Botao>
          )}
          {conta.configurado && podeReenviar && (
            <Botao
              variante={naoEnviado ? "primario" : "contorno"}
              tamanho="sm"
              onClick={() => void agir("reenviar")}
              carregando={enviando === "reenviar"}
              disabled={Boolean(enviando) || naFila}
            >
              {enviando === "reenviar" ? "Enviando…" : "Reenviar acesso"}
            </Botao>
          )}
          {conta.configurado && podeTentar && (
            <Botao
              variante="contorno"
              tamanho="sm"
              onClick={() => void agir("tentar_de_novo")}
              carregando={enviando === "tentar_de_novo"}
              disabled={Boolean(enviando) || naFila}
            >
              {enviando === "tentar_de_novo" ? "Enviando…" : "Tentar de novo"}
            </Botao>
          )}
        </div>
      </div>

      {!conta.configurado && (
        <p className="text-sm text-muted">
          Integração não configurada. Sem a chave de parceiro (FREELANDOO_PARTNER_KEY) nenhuma conta é criada.
        </p>
      )}

      {conta.configurado && conta.estado === "sem_conta" && !naFila && (
        <p className="text-sm text-muted">
          Ainda sem conta no app de treinos. Ela é criada sozinha na próxima passagem pela catraca, ou agora pelo botão.
        </p>
      )}

      {motivo && <p className="text-sm text-ink">{motivo}</p>}
      {conta.estado === "falta_dado" && (
        <p className="mt-1 text-xs text-muted">Complete o cadastro em Dados pessoais: a conta sai na próxima passagem.</p>
      )}

      {naoEnviado && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink">
          Acesso não enviado. A conta existe, mas a mensagem com o link não saiu (telefone ausente ou inválido, ou
          WhatsApp fora do ar). Confira o telefone e use Reenviar acesso.
        </p>
      )}
      {conta.vinculado && conta.estado === "aguardando_aceite" && conta.acessoEnviadoEm && (
        <p className="text-sm text-muted">
          Link de primeiro acesso enviado em {quando(conta.acessoEnviadoEm)}. Vale por 7 dias; até o aluno criar a senha
          e aceitar os termos, a conta fica aguardando aceite.
        </p>
      )}

      {conta.estado === "ativa" && (
        <div className="mt-1 flex items-start gap-4">
          <FotoAluno nome={nome} url={conta.fotoUrl ?? undefined} tamanho={64} />
          <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div className="col-span-full">
              <dt className="text-xs text-muted">Treino ativo</dt>
              <dd className="mt-0.5 break-words text-ink">{conta.treino?.nome || (conta.treino ? "Treino sem nome" : "Sem treino")}</dd>
            </div>
            {conta.treino && (
              <>
                <div>
                  <dt className="text-xs text-muted">Validade</dt>
                  <dd className="mt-0.5 text-ink">{conta.treino.validadeDias ? `${conta.treino.validadeDias} dias` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Vence em</dt>
                  <dd className="mt-0.5 text-ink">{conta.treino.venceEm ? formatData(conta.treino.venceEm) : "—"}</dd>
                </div>
              </>
            )}
            <div className="col-span-full">
              <BarraTreino
                venceEm={conta.treino?.venceEm ?? undefined}
                validadeDias={conta.treino?.validadeDias ?? undefined}
              />
            </div>
          </dl>
        </div>
      )}

      {conta.emAndamento.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-xs">
          {conta.emAndamento.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-ink">
                {t.tipo === "ENVIAR_FOTO" && !conta.vinculado ? "Foto do cadastro de face esperando a conta" : TAREFA[t.tipo]}
              </span>
              <span className="text-muted">
                {t.tentativas > 0 ? `tentativa ${t.tentativas + 1} de 10 · ` : ""}
                {t.status === "EM_ANDAMENTO" ? "agora" : `a partir de ${quando(t.proximaEm)}`}
              </span>
              {t.ultimoErro && <span className="w-full text-danger">Último erro: {t.ultimoErro}</span>}
            </li>
          ))}
        </ul>
      )}

      {conta.falha && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-ink">
          <p className="font-medium">
            {TAREFA_FALHOU[conta.falha.tipo]} ({conta.falha.tentativas} tentativa{conta.falha.tentativas === 1 ? "" : "s"}).
          </p>
          {conta.falha.ultimoErro && <p className="mt-0.5 text-muted">Erro: {conta.falha.ultimoErro}</p>}
        </div>
      )}

      {aviso && <p role="status" className="mt-2 text-xs text-ok">{aviso}</p>}
      {erro && <MensagemErro className="mt-2">{erro}</MensagemErro>}
      {conta.sincronizadoEm && (
        <p className="mt-3 text-xs text-faint">Atualizado da Freelandoo em {quando(conta.sincronizadoEm)}.</p>
      )}
    </Card>
  );
}
