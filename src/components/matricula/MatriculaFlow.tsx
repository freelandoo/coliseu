"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { CheckoutBalcao, type MetodoBalcao } from "@/components/matricula/CheckoutBalcao";
import { ResultadoMatricula } from "@/components/matricula/ResultadoMatricula";
import {
  ESCOLHA_PADRAO,
  FormaCobrancaCampo,
  descreverForma,
  formaDaEscolha,
  type EscolhaCobranca,
} from "@/components/matricula/FormaCobrancaCampo";
import { CamposCadastro } from "@/components/clientes/CamposCadastro";
import {
  FORM_VAZIO,
  alteracoesCadastro,
  formDaPessoa,
  validarCadastro,
  type CampoCadastro,
  type ErrosCadastro,
  type FormCadastro,
} from "@/lib/cadastro";
import { executarMatricula, type MatriculaRegistrada } from "@/lib/matricula-cliente";
import { casaPessoa } from "@/lib/busca-pessoa";
import { BuscaTodosCadastros } from "@/components/clientes/BuscaTodosCadastros";
import type { Candidato, Pessoa, Plano } from "@/lib/types";

const METODO_LABEL: Record<MetodoBalcao, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão débito",
  credito: "Cartão crédito",
};

/** Matrícula pendente de pagamento (desta sessão ou já existente). */
interface Matriculado {
  id: string;
  personId: string;
  codigo: string;
  nome: string;
  planoNome: string;
  valor: number;
  linkPagamento?: string;
  waLink?: string;
  email?: string;
}


type Carga = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "pronta" };

type Operacao =
  | { tipo: "editando" }
  | { tipo: "revisando" }
  | { tipo: "registrando" }
  | { tipo: "falhou"; erro: string }
  | { tipo: "desconhecido" };

function ehPessoa(v: unknown): v is Pessoa {
  return typeof v === "object" && v !== null && typeof (v as Pessoa).id === "string";
}

/**
 * Matrícula de lead e renovação, por etapas reais:
 * pessoa → cadastro (ficha completa) → plano → revisão → confirmação → o que o
 * servidor confirmou. Selecionar alguém, revisar ou trocar de plano não gera
 * nada; só "Confirmar matrícula" chama o servidor.
 */
export function MatriculaFlow({
  planos,
  candidatosIniciais,
  matriculadosIniciais,
  preSelecionadoId = null,
}: {
  planos: Plano[];
  candidatosIniciais: Candidato[];
  matriculadosIniciais: Matriculado[];
  /**
   * Atalho da ficha (`?pessoa=`). Só abre a revisão de quem JÁ está entre os
   * candidatos — o mesmo que o clique na lista. Não grava nada.
   */
  preSelecionadoId?: string | null;
}) {
  const router = useRouter();
  const [candidatos, setCandidatos] = useState(candidatosIniciais);
  const [busca, setBusca] = useState("");
  const [preSelecionado] = useState(() =>
    preSelecionadoId ? (candidatosIniciais.find((c) => c.refId === preSelecionadoId) ?? null) : null,
  );
  const preNaoEncontrado = preSelecionadoId !== null && preSelecionado === null;
  const [sel, setSel] = useState<Candidato | null>(preSelecionado);
  const [carga, setCarga] = useState<Carga>(preSelecionado ? { tipo: "carregando" } : { tipo: "pronta" });
  const [base, setBase] = useState<FormCadastro>(FORM_VAZIO);
  const [form, setForm] = useState<FormCadastro>(FORM_VAZIO);
  const [erros, setErros] = useState<ErrosCadastro>({});
  const planoInicial = (c: Candidato | null) =>
    c?.planoAtualId && planos.some((p) => p.id === c.planoAtualId) ? c.planoAtualId : (planos[0]?.id ?? "");
  const [planoId, setPlanoId] = useState(() => planoInicial(preSelecionado));
  const [cobranca, setCobranca] = useState<EscolhaCobranca>(ESCOLHA_PADRAO);
  const [op, setOp] = useState<Operacao>({ tipo: "editando" });
  const emVoo = useRef(false);

  const [matriculados, setMatriculados] = useState(matriculadosIniciais);
  const [resultado, setResultado] = useState<{ m: Matriculado; dados: MatriculaRegistrada } | null>(null);
  const [checkout, setCheckout] = useState<Matriculado | null>(null);
  const [pagoInfo, setPagoInfo] = useState<{ nome: string; metodo: MetodoBalcao } | null>(null);
  const buscaId = useId();

  const plano = planos.find((p) => p.id === planoId);
  // Quem renova num plano que não é mais oferecido escolhe um ativo — antes, o
  // plano arquivado ficava "escolhido" fora da lista e o clique não fazia nada.
  const planoAtualForaDaLista = !!sel?.planoAtualId && !planos.some((p) => p.id === sel.planoAtualId);
  const registrando = op.tipo === "registrando";
  const travado = registrando || op.tipo === "desconhecido";

  // Ficha completa de quem foi escolhido. Resposta de uma seleção anterior é
  // descartada — ela não pode preencher o formulário de outra pessoa.
  const selId = sel?.refId ?? null;
  useEffect(() => {
    if (!selId) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pessoas/${encodeURIComponent(selId)}`, { cache: "no-store" });
        const d: unknown = await r.json().catch(() => null);
        if (!ativo) return;
        if (!r.ok || !ehPessoa(d)) {
          setCarga({ tipo: "erro", mensagem: "Não foi possível carregar a ficha desta pessoa." });
          return;
        }
        const f = formDaPessoa(d);
        setBase(f);
        setForm(f);
        setCarga({ tipo: "pronta" });
      } catch {
        if (ativo) setCarga({ tipo: "erro", mensagem: "Sem conexão para carregar a ficha." });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [selId]);

  // Nome sem acento, CPF, telefone ou código — ver `casaPessoa`.
  const resultados = useMemo(
    () => (busca.trim() ? candidatos.filter((c) => casaPessoa(c, busca)) : candidatos),
    [busca, candidatos],
  );

  function selecionar(c: Candidato) {
    if (travado) return;
    setSel(c);
    setCarga({ tipo: "carregando" });
    setBase(FORM_VAZIO);
    setForm(FORM_VAZIO);
    setErros({});
    setOp({ tipo: "editando" });
    setPlanoId(planoInicial(c));
    setCobranca(ESCOLHA_PADRAO);
  }

  function trocarPessoa() {
    if (travado) return;
    setSel(null);
    setCarga({ tipo: "pronta" });
    setForm(FORM_VAZIO);
    setErros({});
    setOp({ tipo: "editando" });
  }

  function setCampo(campo: CampoCadastro, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  }

  function revisar() {
    const e = validarCadastro(form, { exigeCpf: true });
    setErros(e);
    if (Object.keys(e).length || !plano) return;
    setOp({ tipo: "revisando" });
  }

  async function confirmar() {
    if (emVoo.current || !sel || !plano || travado) return;
    emVoo.current = true;
    setOp({ tipo: "registrando" });
    const alvo = sel;
    const planoEscolhido = plano;
    const d = await executarMatricula({
      pessoaId: alvo.refId,
      alteracoes: alteracoesCadastro(base, form),
      planoId: planoEscolhido.id,
      formaCobranca: formaDaEscolha(cobranca, planoEscolhido),
    });
    emVoo.current = false;

    if (d.tipo === "registrada") {
      const m: Matriculado = {
        id: `sess-${alvo.refId}`,
        personId: alvo.refId,
        codigo: alvo.codigo ?? "",
        nome: form.nome.trim(),
        planoNome: planoEscolhido.nome,
        valor: d.dados.valorParcela ?? planoEscolhido.valorMensal,
        linkPagamento: d.dados.linkPagamento,
        waLink: d.dados.waLink,
        email: form.email.trim() || undefined,
      };
      // Plano gratuito já nasce ativo: não entra em "Aguardando pagamento".
      setMatriculados((prev) => [...(d.dados.gratuito ? [] : [m]), ...prev.filter((x) => x.personId !== m.personId)]);
      setCandidatos((prev) => prev.filter((c) => c.refId !== alvo.refId));
      setResultado({ m, dados: d.dados });
      setSel(null);
      setForm(FORM_VAZIO);
      setOp({ tipo: "editando" });
      router.refresh();
      return;
    }
    if (d.tipo === "falha-matricula" || d.tipo === "falha-cadastro") {
      // Formulário e pessoa continuam aqui para corrigir e tentar de novo.
      setOp({ tipo: "falhou", erro: d.erro });
      return;
    }
    setOp({ tipo: "desconhecido" });
  }

  function aoPagar(m: Matriculado, metodo: MetodoBalcao) {
    setMatriculados((prev) => prev.filter((x) => x.id !== m.id));
    setCheckout(null);
    setPagoInfo({ nome: m.nome, metodo });
    router.refresh();
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {!sel ? (
            <div className="flex flex-col gap-3">
              <label htmlFor={buscaId} className="text-sm font-semibold text-ink">
                1 · Escolher pessoa
              </label>
              <input
                id={buscaId}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, CPF ou celular…"
                autoComplete="off"
                className={classeCampo}
              />
              <p className="text-xs text-muted">Leads em aberto e alunos que precisam renovar.</p>
              {preNaoEncontrado && (
                <p role="status" className="rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-ink">
                  A pessoa da ficha não está entre os candidatos agora (já matriculada, lead fechado ou fora da janela
                  de renovação). Busque pelo nome se precisar.
                </p>
              )}
              {planos.length === 0 && (
                <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink">
                  Nenhum plano ativo para matrícula. Um administrador precisa cadastrar ou reativar um plano em Cobrança →
                  Planos.
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {resultados.length === 0 ? (
                  <Card className="px-4 py-6 text-center text-sm text-muted">
                    {candidatos.length === 0
                      ? "Ninguém aguardando matrícula ou renovação."
                      : "Ninguém encontrado entre leads em aberto e renovações."}
                  </Card>
                ) : (
                  resultados.map((c) => (
                    <li key={c.refId}>
                      <button
                        type="button"
                        onClick={() => selecionar(c)}
                        className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brand/40 hover:bg-surface-2"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{c.nome}</span>
                          <Badge tone={c.origem === "renovacao" ? "warn" : "neutral"}>
                            {c.origem === "renovacao" ? "Renovar" : "Lead"}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{c.telefone}</span>
                        <span className="mt-0.5 block text-xs text-muted">{c.detalhe}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {/* Lead antigo, ex-aluno, cadastro do CloudGym: abre a ficha (de lá, "Iniciar matrícula"). */}
              <BuscaTodosCadastros termo={busca} ocultarIds={resultados.map((c) => c.refId)} />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink">
                  {op.tipo === "revisando" || registrando || op.tipo === "desconhecido" ? "3 · Revisar e confirmar" : "2 · Cadastro e plano"}
                </span>
                <Botao variante="discreto" tamanho="sm" onClick={trocarPessoa} disabled={travado}>
                  ← Trocar pessoa
                </Botao>
              </div>

              {carga.tipo === "carregando" && <p className="text-sm text-muted">Carregando a ficha de {sel.nome}…</p>}
              {carga.tipo === "erro" && (
                <div className="flex flex-col gap-3">
                  <MensagemErro>{carga.mensagem} Sem a ficha completa, editar poderia apagar dados.</MensagemErro>
                  <Botao onClick={() => selecionar(sel)} className="self-start">
                    Tentar de novo
                  </Botao>
                </div>
              )}

              {carga.tipo === "pronta" && (op.tipo === "editando" || op.tipo === "falhou") && (
                <>
                  <CamposCadastro
                    form={form}
                    setCampo={setCampo}
                    erros={erros}
                    exigeCpf
                    mostrarOrigem={false}
                    conferirCpf={{ ignorarId: sel.refId }}
                  />

                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-semibold text-ink">Plano *</legend>
                    {planos.length === 0 && (
                      <p className="text-sm text-muted">Nenhum plano ativo — não dá para matricular agora.</p>
                    )}
                    {planoAtualForaDaLista && planos.length > 0 && (
                      <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink">
                        O plano atual desta pessoa não é mais oferecido. Escolha um plano ativo para a renovação.
                      </p>
                    )}
                    {planos.map((p) => {
                      const escolhido = p.id === planoId;
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => {
                            setPlanoId(p.id);
                            setCobranca((c) => ({ ...c, parcelas: null }));
                          }}
                          aria-pressed={escolhido}
                          className={cn(
                            "rounded-lg border px-4 py-2.5 text-left transition-colors",
                            escolhido ? "border-brand bg-brand-soft" : "border-border-strong bg-surface hover:border-control",
                          )}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-ink">
                              {p.nome}
                              {p.id === sel.planoAtualId && <span className="ml-1.5 text-xs font-normal text-muted">(plano atual)</span>}
                            </span>
                            <span className={cn("text-sm tabular-nums", escolhido ? "font-semibold text-destaque" : "text-muted")}>
                              {formatBRL(p.valorMensal)}/mês
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </fieldset>

                  {plano && <FormaCobrancaCampo plano={plano} escolha={cobranca} onChange={setCobranca} />}

                  {op.tipo === "falhou" && <MensagemErro>A matrícula não foi registrada: {op.erro}</MensagemErro>}

                  <Botao variante="primario" tamanho="lg" onClick={revisar} disabled={!plano}>
                    Revisar matrícula
                  </Botao>
                </>
              )}

              {carga.tipo === "pronta" && (op.tipo === "revisando" || registrando || op.tipo === "desconhecido") && plano && (
                <div className="flex flex-col gap-4">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-2 p-4 text-sm sm:grid-cols-2">
                    <Linha rotulo="Pessoa" valor={`${form.nome.trim()}${sel.codigo ? ` · ${sel.codigo}` : ""}`} />
                    <Linha rotulo="CPF" valor={form.cpf.trim()} />
                    <Linha rotulo="Contato" valor={[form.telefone.trim(), form.email.trim()].filter(Boolean).join(" · ")} />
                    <Linha rotulo="Tipo" valor={sel.origem === "renovacao" ? "Renovação" : "Matrícula de lead"} />
                    <Linha rotulo="Plano" valor={`${plano.nome} · ${formatBRL(plano.valorMensal)}/mês`} />
                    <Linha rotulo="Vigência" valor={`${plano.duracaoDias} dias a partir da confirmação`} />
                    <Linha rotulo="Cobrança" valor={descreverForma(formaDaEscolha(cobranca, plano), plano)} />
                  </dl>
                  <p className="text-xs text-muted">
                    Ao confirmar: as alterações do cadastro são salvas, a matrícula é registrada com pagamento pendente e
                    a cobrança é gerada no Asaas. Assinaturas e boletos em aberto de cobranças anteriores desta pessoa
                    são cancelados para não cobrar em dobro.
                  </p>
                  {op.tipo === "desconhecido" && (
                    <MensagemErro>
                      Sem confirmação do servidor. A matrícula e a cobrança podem ter sido criadas — atualize a lista e
                      confira em “Aguardando pagamento” antes de tentar de novo.
                    </MensagemErro>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {op.tipo === "desconhecido" ? (
                      <Botao variante="primario" onClick={() => window.location.reload()}>
                        Atualizar a página
                      </Botao>
                    ) : (
                      <Botao variante="primario" tamanho="lg" onClick={() => void confirmar()} carregando={registrando} className="flex-1">
                        {registrando ? "Registrando…" : "Confirmar matrícula"}
                      </Botao>
                    )}
                    <Botao tamanho="lg" onClick={() => setOp({ tipo: "editando" })} disabled={travado}>
                      Voltar e editar
                    </Botao>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* O que acontece, dito antes — e o estado real da operação em curso. */}
        <Card className="h-fit p-5">
          <h2 className="text-sm font-semibold text-ink">Como funciona</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm text-muted">
            <Passo n={1} feito={!!sel}>Escolher a pessoa</Passo>
            <Passo n={2} feito={!!sel && carga.tipo === "pronta" && op.tipo !== "editando" && op.tipo !== "falhou"}>
              Conferir cadastro e plano
            </Passo>
            <Passo n={3} corrente={registrando}>Confirmar — registra a matrícula e gera a cobrança</Passo>
            <Passo n={4}>Mandar o link ou receber no balcão</Passo>
            <Passo n={5}>Pagamento confirmado (Asaas ou balcão) ativa a matrícula</Passo>
          </ol>
          <p className="mt-3 text-xs text-faint">Nada é cobrado antes do passo 3.</p>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-base font-semibold text-ink">Aguardando pagamento</h2>
        {matriculados.length === 0 ? (
          <Card className="px-5 py-8 text-center text-sm text-muted">Nenhuma matrícula com pagamento pendente.</Card>
        ) : (
          <Card className="divide-y divide-border">
            {matriculados.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {m.nome} {m.codigo && <span className="text-xs font-normal text-muted">· {m.codigo}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {m.planoNome} · {formatBRL(m.valor)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">Pagamento pendente</Badge>
                  {m.waLink && (
                    <a href={m.waLink} target="_blank" rel="noreferrer" className={classeBotao({ variante: "secundario", tamanho: "sm" })}>
                      Abrir WhatsApp
                    </a>
                  )}
                  {!m.waLink && m.email && (
                    <a href={`mailto:${m.email}`} className={classeBotao({ variante: "secundario", tamanho: "sm" })}>
                      Abrir e-mail
                    </a>
                  )}
                  <Botao variante="contorno" tamanho="sm" onClick={() => setCheckout(m)}>
                    Receber no balcão
                  </Botao>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {resultado && (
        <Modal onFechar={() => setResultado(null)}>
          <TituloModal className="sr-only">Matrícula registrada</TituloModal>
          <ResultadoMatricula
            titulo="Matrícula registrada"
            nome={resultado.m.nome}
            planoNome={resultado.m.planoNome}
            valor={resultado.m.valor}
            linkPagamento={resultado.dados.linkPagamento}
            waLink={resultado.dados.waLink}
            email={resultado.m.email}
            parcelas={resultado.dados.parcelas}
            gratuito={resultado.dados.gratuito}
            carneUrl={resultado.dados.parcelas ? `/api/pessoas/${resultado.m.personId}/carne` : undefined}
            onBalcao={() => {
              const m = resultado.m;
              setResultado(null);
              setCheckout(m);
            }}
            onConcluir={() => setResultado(null)}
          />
        </Modal>
      )}

      {checkout && (
        <CheckoutBalcao
          personId={checkout.personId}
          nome={checkout.nome}
          planoNome={checkout.planoNome}
          valor={checkout.valor}
          onPago={(metodo) => aoPagar(checkout, metodo)}
          onFechar={() => setCheckout(null)}
        />
      )}

      {pagoInfo && (
        <Modal onFechar={() => setPagoInfo(null)} fecharAoClicarFora className="max-w-sm text-center">
          <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
            ✓
          </span>
          <TituloModal className="mt-4">Pagamento registrado no balcão</TituloModal>
          <p className="mt-1 text-sm text-muted">
            {pagoInfo.nome} · {METODO_LABEL[pagoInfo.metodo]}
          </p>
          <p className="mt-2 text-xs text-muted">
            O pagamento entra pelo mesmo processamento do Asaas, que ativa a matrícula. A liberação na catraca segue o
            controle de acesso — confira na ficha.
          </p>
          <Botao variante="primario" bloco onClick={() => setPagoInfo(null)} className="mt-5">
            Concluir
          </Botao>
        </Modal>
      )}
    </>
  );
}

function Passo({ n, feito, corrente, children }: { n: number; feito?: boolean; corrente?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          corrente ? "border-brand bg-brand text-white" : feito ? "border-success/60 bg-success-soft text-success" : "border-border text-faint",
        )}
      >
        {feito ? "✓" : n}
      </span>
      <span className={cn("pt-0.5", (feito || corrente) && "text-ink")}>
        {children}
        {corrente && <span className="sr-only"> (em andamento)</span>}
      </span>
    </li>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{rotulo}</dt>
      <dd className="mt-0.5 font-medium text-ink">{valor || "—"}</dd>
    </div>
  );
}
