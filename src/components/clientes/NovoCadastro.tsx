"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { Pessoa, Plano } from "@/lib/types";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { CamposCadastro } from "@/components/clientes/CamposCadastro";
import { ResultadoMatricula } from "@/components/matricula/ResultadoMatricula";
import { CheckoutBalcao } from "@/components/matricula/CheckoutBalcao";
import {
  FORM_VAZIO,
  alteracoesCadastro,
  formDaPessoa,
  novaPessoaDoForm,
  validarCadastro,
  type CampoCadastro,
  type ErrosCadastro,
  type FormCadastro,
} from "@/lib/cadastro";
import { criarPessoa, executarMatricula, type MatriculaRegistrada } from "@/lib/matricula-cliente";
import { textoDesconhecido } from "@/lib/operacao";

/** Lead já cadastrado que vai ser matriculado. */
export interface LeadParaMatricular {
  id: string;
  nome: string;
  telefone: string;
}

/**
 * Dois modos, escolhidos por quem usa — nunca deduzidos de haver planos:
 *
 * - `lead`: cria o cadastro como lead novo no funil. Não gera matrícula nem
 *   cobrança.
 * - `matricula`: cadastro + plano + revisão + confirmação. Só a confirmação
 *   registra a matrícula (pendente) e gera a cobrança pelo caminho existente
 *   (Asaas + provisionamento de acesso). Com `lead`, completa a ficha de quem
 *   já existe: a ficha inteira é carregada antes, e só o que mudou é enviado.
 */
export function NovoCadastro({
  modo,
  planos = [],
  lead,
  compacto = false,
}: {
  modo: "lead" | "matricula";
  /** Planos contratáveis (ativos). Vazio em `matricula` = explica e não deixa seguir. */
  planos?: Plano[];
  lead?: LeadParaMatricular;
  /** Botão de linha de tabela em vez de ação de cabeçalho. */
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const rotulo = lead ? "Matricular" : modo === "lead" ? "+ Novo lead" : "+ Nova matrícula";

  return (
    <>
      <Botao
        variante={compacto ? "contorno" : "primario"}
        tamanho={compacto ? "sm" : "md"}
        onClick={() => setAberto(true)}
      >
        {rotulo}
      </Botao>
      {aberto && <ModalCadastro modo={modo} planos={planos} lead={lead} onFechar={() => setAberto(false)} />}
    </>
  );
}

type Fase = "formulario" | "revisao" | "resultado";

type CargaFicha = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "pronta" };

type Desfecho =
  | { tipo: "lead-criado"; nome: string }
  | { tipo: "matriculado"; nome: string; plano: Plano; dados: MatriculaRegistrada; personId: string; email?: string };

function ehPessoa(v: unknown): v is Pessoa {
  return typeof v === "object" && v !== null && typeof (v as Pessoa).id === "string";
}

function ModalCadastro({
  modo,
  planos,
  lead,
  onFechar,
}: {
  modo: "lead" | "matricula";
  planos: Plano[];
  lead?: LeadParaMatricular;
  onFechar: () => void;
}) {
  const router = useRouter();
  const matricula = modo === "matricula";
  const [carga, setCarga] = useState<CargaFicha>(lead ? { tipo: "carregando" } : { tipo: "pronta" });
  const [tentativaCarga, setTentativaCarga] = useState(0);
  // `base` é o que o servidor tem; o PATCH leva só a diferença para ela.
  const [base, setBase] = useState<FormCadastro>(FORM_VAZIO);
  const [form, setForm] = useState<FormCadastro>(FORM_VAZIO);
  const [erros, setErros] = useState<ErrosCadastro>({});
  const [planoId, setPlanoId] = useState(planos[0]?.id ?? "");
  const [fase, setFase] = useState<Fase>("formulario");
  const [enviando, setEnviando] = useState(false);
  const [erroApi, setErroApi] = useState("");
  // Resultado desconhecido trava o botão: repetir pode duplicar pessoa ou cobrança.
  const [incerto, setIncerto] = useState("");
  const [desfecho, setDesfecho] = useState<Desfecho | null>(null);
  const [balcao, setBalcao] = useState(false);
  // Pessoa que esta tela já criou: o próximo clique matricula ela, não outra.
  const [idConfirmado, setIdConfirmado] = useState<string | null>(null);
  const emVoo = useRef(false);
  const mudouServidor = useRef(false);

  // Lead existente: a ficha completa chega antes de qualquer edição.
  // Depende só do id: o objeto `lead` nasce de novo a cada render da lista, e
  // recarregar a ficha por cima da edição apagaria o que foi digitado.
  const leadId = lead?.id;
  useEffect(() => {
    if (!leadId) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pessoas/${encodeURIComponent(leadId)}`, { cache: "no-store" });
        const d: unknown = await r.json().catch(() => null);
        if (!ativo) return;
        if (!r.ok || !ehPessoa(d)) {
          setCarga({ tipo: "erro", mensagem: r.status === 404 ? "Cadastro não encontrado." : "Não foi possível carregar a ficha." });
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
  }, [leadId, tentativaCarga]);

  const plano = planos.find((p) => p.id === planoId);
  const semPlano = matricula && planos.length === 0;
  const travado = enviando || !!incerto;

  function setCampo(campo: CampoCadastro, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  }

  function fechar() {
    if (enviando) return;
    // Algo mudou no servidor (pessoa criada, matrícula feita): a lista precisa saber.
    if (mudouServidor.current) router.refresh();
    onFechar();
  }

  function validar(): boolean {
    const e = validarCadastro(form, { exigeCpf: matricula });
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function cadastrarLead() {
    if (emVoo.current || travado || !validar()) return;
    emVoo.current = true;
    setEnviando(true);
    setErroApi("");
    const r = await criarPessoa(novaPessoaDoForm(form));
    emVoo.current = false;
    setEnviando(false);
    if (r.tipo === "ok") {
      mudouServidor.current = true;
      setDesfecho({ tipo: "lead-criado", nome: form.nome.trim() });
      setFase("resultado");
    } else if (r.tipo === "falha") {
      setErroApi(r.erro);
    } else {
      mudouServidor.current = true;
      setIncerto(textoDesconhecido("O cadastro") + " Procure o nome na Captação.");
    }
  }

  function revisar() {
    if (!validar() || !plano) return;
    setErroApi("");
    setFase("revisao");
  }

  async function confirmarMatricula() {
    if (emVoo.current || travado || !plano) return;
    emVoo.current = true;
    setEnviando(true);
    setErroApi("");
    const existente = lead?.id;
    // Pessoa criada numa tentativa anterior: a base passa a ser o que foi enviado no POST.
    const d = await executarMatricula({
      pessoaId: existente,
      idConfirmado,
      nova: existente || idConfirmado ? undefined : novaPessoaDoForm(form),
      alteracoes: existente || idConfirmado ? alteracoesCadastro(base, form) : {},
      planoId: plano.id,
    });
    emVoo.current = false;
    setEnviando(false);

    if (d.tipo === "registrada") {
      mudouServidor.current = true;
      setDesfecho({
        tipo: "matriculado",
        nome: form.nome.trim(),
        plano,
        dados: d.dados,
        personId: d.personId,
        email: form.email.trim() || undefined,
      });
      setFase("resultado");
      return;
    }
    if (d.tipo === "falha-cadastro") {
      setErroApi(`${d.erro} Nada foi registrado.`);
      setFase("formulario");
      return;
    }
    if (d.tipo === "desconhecido-cadastro") {
      mudouServidor.current = true;
      setIncerto(textoDesconhecido("O cadastro") + " Procure o nome na Captação antes de cadastrar de novo.");
      return;
    }
    // Daqui para baixo a pessoa existe (criada agora ou antes).
    if (!existente && !idConfirmado) {
      setIdConfirmado(d.personId);
      setBase(form); // o POST gravou exatamente este formulário
      mudouServidor.current = true;
    }
    if (d.tipo === "falha-matricula") {
      setErroApi(
        d.pessoaCriadaAgora
          ? `O cadastro foi salvo como lead, mas a matrícula não foi registrada: ${d.erro} Você pode revisar e confirmar de novo — a mesma pessoa será usada.`
          : `A matrícula não foi registrada: ${d.erro}`,
      );
      return;
    }
    setIncerto(
      "Sem confirmação do servidor. A matrícula e a cobrança podem ter sido criadas — confira em Alunos → Matrículas e renovações antes de tentar de novo.",
    );
    mudouServidor.current = true;
  }

  if (balcao && desfecho?.tipo === "matriculado") {
    return (
      <CheckoutBalcao
        personId={desfecho.personId}
        nome={desfecho.nome}
        planoNome={desfecho.plano.nome}
        valor={desfecho.plano.valorMensal}
        onPago={() => {
          setBalcao(false);
          fechar();
        }}
        onFechar={() => setBalcao(false)}
      />
    );
  }

  const titulo = lead ? "Matricular lead" : matricula ? "Nova matrícula" : "Novo lead";

  return (
    <Modal onFechar={fechar} fecharComEsc={!enviando} className="max-w-xl">
      {fase === "resultado" && desfecho?.tipo === "lead-criado" && (
        <div>
          <TituloModal>Lead cadastrado</TituloModal>
          <DescricaoModal className="mt-1">
            {desfecho.nome} entrou no funil como lead novo. Nenhuma matrícula ou cobrança foi gerada.
          </DescricaoModal>
          <Botao variante="primario" bloco onClick={fechar} className="mt-5">
            Concluir
          </Botao>
        </div>
      )}

      {fase === "resultado" && desfecho?.tipo === "matriculado" && (
        <>
          <TituloModal className="sr-only">Matrícula registrada</TituloModal>
          <ResultadoMatricula
            titulo="Matrícula registrada"
            nome={desfecho.nome}
            planoNome={desfecho.plano.nome}
            valor={desfecho.plano.valorMensal}
            linkPagamento={desfecho.dados.linkPagamento}
            waLink={desfecho.dados.waLink}
            email={desfecho.email}
            onBalcao={() => setBalcao(true)}
            onConcluir={fechar}
          />
        </>
      )}

      {fase !== "resultado" && (
        <>
          <TituloModal>{titulo}</TituloModal>
          <DescricaoModal className="mt-0.5">
            {matricula ? (
              <>
                Revise os dados e o plano. Nada é cobrado até você confirmar na revisão — a matrícula nasce com{" "}
                <strong className="text-ink">pagamento pendente</strong>.
              </>
            ) : (
              <>
                Entra como <strong className="text-ink">lead novo</strong> no funil. Não gera matrícula nem cobrança.
              </>
            )}
          </DescricaoModal>

          {carga.tipo === "carregando" && <p className="mt-5 text-sm text-muted">Carregando a ficha de {lead?.nome}…</p>}
          {carga.tipo === "erro" && (
            <div className="mt-5 flex flex-col gap-3">
              <MensagemErro>{carga.mensagem} Sem a ficha completa, editar poderia apagar dados.</MensagemErro>
              <div className="flex gap-2">
                <Botao
                  onClick={() => {
                    setCarga({ tipo: "carregando" });
                    setTentativaCarga((n) => n + 1);
                  }}
                >
                  Tentar de novo
                </Botao>
                <Botao variante="discreto" onClick={fechar}>
                  Fechar
                </Botao>
              </div>
            </div>
          )}

          {carga.tipo === "pronta" && fase === "formulario" && (
            <>
              {semPlano && (
                <p role="status" className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink">
                  Nenhum plano ativo para matrícula. Um administrador precisa cadastrar ou reativar um plano em
                  Cobrança → Planos.
                </p>
              )}
              {idConfirmado && (
                <p role="status" className="mt-4 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-ink">
                  Cadastro já salvo. Ao confirmar de novo, a matrícula usa esta mesma pessoa.
                </p>
              )}
              <div className="mt-5">
                <CamposCadastro
                  form={form}
                  setCampo={setCampo}
                  erros={erros}
                  exigeCpf={matricula}
                  mostrarOrigem={!lead && !idConfirmado}
                  desabilitado={travado}
                />
              </div>
              {!lead && <p className="mt-3 text-xs text-muted">Vendedor: registrado automaticamente como quem está logado.</p>}

              {matricula && !semPlano && (
                <fieldset className="mt-5" disabled={travado}>
                  <legend className="mb-2 text-sm font-semibold text-ink">Plano *</legend>
                  <div className="flex flex-col gap-2">
                    {planos.map((p) => {
                      const selecionado = p.id === planoId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPlanoId(p.id)}
                          aria-pressed={selecionado}
                          className={cn(
                            "rounded-lg border px-4 py-2.5 text-left transition-colors",
                            selecionado ? "border-brand bg-brand-soft" : "border-border-strong bg-surface hover:border-control",
                          )}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-ink">{p.nome}</span>
                            <span className={cn("text-sm tabular-nums", selecionado ? "font-semibold text-destaque" : "text-muted")}>
                              {formatBRL(p.valorMensal)}/mês
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {erroApi && <MensagemErro className="mt-4">{erroApi}</MensagemErro>}
              {incerto && <MensagemErro className="mt-4">{incerto}</MensagemErro>}

              <div className="mt-5 flex gap-3">
                {matricula ? (
                  <Botao variante="primario" tamanho="lg" onClick={revisar} disabled={semPlano || travado} className="flex-1">
                    Revisar matrícula
                  </Botao>
                ) : (
                  <Botao variante="primario" tamanho="lg" onClick={() => void cadastrarLead()} carregando={enviando} disabled={travado} className="flex-1">
                    {enviando ? "Cadastrando…" : "Cadastrar lead"}
                  </Botao>
                )}
                <Botao tamanho="lg" onClick={fechar} disabled={enviando}>
                  {incerto ? "Fechar" : "Cancelar"}
                </Botao>
              </div>
            </>
          )}

          {carga.tipo === "pronta" && fase === "revisao" && plano && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink">Revisão</h3>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-2 p-4 text-sm sm:grid-cols-2">
                <Linha rotulo="Pessoa" valor={form.nome.trim()} />
                <Linha rotulo="CPF" valor={form.cpf.trim()} />
                <Linha rotulo="Contato" valor={[form.telefone.trim(), form.email.trim()].filter(Boolean).join(" · ")} />
                <Linha rotulo="Plano" valor={`${plano.nome} · ${formatBRL(plano.valorMensal)}/mês`} />
                <Linha rotulo="Vigência" valor={`${plano.duracaoDias} dias a partir de hoje`} />
                <Linha rotulo="Situação ao confirmar" valor="Matrícula registrada · pagamento pendente" />
              </dl>
              <p className="mt-3 text-xs text-muted">
                Ao confirmar, a cobrança é gerada pelo caminho de sempre (Asaas). Assinaturas anteriores desta pessoa são
                canceladas para não cobrar em dobro.
              </p>

              {erroApi && <MensagemErro className="mt-4">{erroApi}</MensagemErro>}
              {incerto && <MensagemErro className="mt-4">{incerto}</MensagemErro>}

              <div className="mt-5 flex flex-wrap gap-3">
                <Botao variante="primario" tamanho="lg" onClick={() => void confirmarMatricula()} carregando={enviando} disabled={!!incerto} className="flex-1">
                  {enviando ? "Registrando…" : "Confirmar matrícula"}
                </Botao>
                <Botao tamanho="lg" onClick={() => setFase("formulario")} disabled={travado}>
                  Voltar e editar
                </Botao>
                {incerto && (
                  <Botao tamanho="lg" variante="discreto" onClick={fechar}>
                    Fechar
                  </Botao>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
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
