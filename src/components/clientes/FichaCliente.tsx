"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { situacaoDe } from "@/components/clientes/ClientesView";
import { AcessoDoCadastro, type AcessoDaPessoa } from "@/components/clientes/AcessoDoCadastro";
import { PagamentosDoAluno } from "@/components/clientes/PagamentosDoAluno";
import { CatracaDoAluno } from "@/components/clientes/CatracaDoAluno";
import { FreelandooDoAluno } from "@/components/clientes/FreelandooDoAluno";
import { CamposCadastro } from "@/components/clientes/CamposCadastro";
import { RemoverPessoa } from "@/components/clientes/RemoverPessoa";
import { RenovarModal } from "@/components/matriculados/RenovarModal";
import { cn } from "@/lib/cn";
import { formatBRL, formatData } from "@/lib/mock-data";
import {
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type LeadEstagio,
  type Pessoa,
  type Plano,
} from "@/lib/types";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";
import { LinkRetornoFicha } from "@/components/clientes/LinkRetornoFicha";
import type { OrigemFicha } from "@/lib/navegacao";
import {
  alteracoesCadastro,
  formDaPessoa,
  semAlteracoes,
  validarCadastro,
  type CampoCadastro,
  type ErrosCadastro,
  type FormCadastro,
} from "@/lib/cadastro";
import { lerResultado, sinalDeTempo, temId } from "@/lib/operacao";

const ESTAGIOS: LeadEstagio[] = ["novo", "qualificado", "interesse", "perdido"];

type Edicao = { form: FormCadastro; vendedor: string; base: FormCadastro; vendedorBase: string };

export function FichaCliente({
  pessoa,
  plano,
  planos = [],
  podeGerirAcesso = false,
  acesso,
  retorno = { href: "/matriculados", rotulo: "Alunos", origem: "alunos" },
}: {
  pessoa: Pessoa;
  plano?: Plano;
  /** Planos ativos — as opções de "Alterar plano". */
  planos?: Plano[];
  /** Só ADMIN cria/edita acesso ao sistema. */
  podeGerirAcesso?: boolean;
  /** Acesso já existente desta pessoa, quando ela é colaboradora. */
  acesso?: AcessoDaPessoa;
  /** Para onde o "voltar" leva — validado no servidor (`retornoDaFicha`). */
  retorno?: { href: string; rotulo: string; origem: OrigemFicha };
}) {
  const router = useRouter();
  // A edição nasce da ficha no momento em que se clica em Editar, e morre no
  // Cancelar: o rascunho cancelado não reaparece na próxima edição.
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erros, setErros] = useState<ErrosCadastro>({});
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");
  const [estagioSalvando, setEstagioSalvando] = useState(false);
  const [erroEstagio, setErroEstagio] = useState("");
  const [renovando, setRenovando] = useState<"renovar" | "alterar" | null>(null);
  const emVoo = useRef(false);

  const s = situacaoDe(pessoa);
  const ehLead = pessoa.fase === "lead";

  function editar() {
    const f = formDaPessoa(pessoa);
    setEdicao({ form: f, base: f, vendedor: pessoa.vendedor ?? "", vendedorBase: pessoa.vendedor ?? "" });
    setErros({});
    setErroSalvar("");
  }

  function cancelar() {
    if (salvando) return;
    setEdicao(null);
    setErros({});
    setErroSalvar("");
  }

  function setCampo(campo: CampoCadastro, valor: string) {
    setEdicao((e) => (e ? { ...e, form: { ...e.form, [campo]: valor } } : e));
    setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  }

  async function salvar() {
    if (!edicao || emVoo.current) return;
    // Na ficha, contato não é obrigatório (há cadastros importados sem nenhum);
    // nome e formato do que foi preenchido, sim.
    const e = validarCadastro(edicao.form, { exigeCpf: false });
    if (e.telefone?.startsWith("Informe")) delete e.telefone;
    if (e.email?.startsWith("Informe")) delete e.email;
    setErros(e);
    if (Object.keys(e).length) return;

    const patch: Record<string, unknown> = { ...alteracoesCadastro(edicao.base, edicao.form) };
    if (edicao.vendedor.trim() !== edicao.vendedorBase.trim()) patch.vendedor = edicao.vendedor.trim();
    if (semAlteracoes(patch)) {
      setEdicao(null);
      return;
    }

    emVoo.current = true;
    setSalvando(true);
    setErroSalvar("");
    const res = await lerResultado(
      fetch(`/api/pessoas/${pessoa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        signal: sinalDeTempo(),
      }),
      temId,
      "Não foi possível salvar.",
    );
    emVoo.current = false;
    setSalvando(false);
    if (res.tipo === "ok") {
      setEdicao(null);
      router.refresh();
      return;
    }
    // A edição continua aberta, com tudo que foi digitado.
    setErroSalvar(
      res.tipo === "falha"
        ? res.erro
        : "Sem confirmação do servidor. As alterações podem ter sido salvas — recarregue a ficha para conferir antes de salvar de novo.",
    );
  }

  async function mudarEstagio(estagio: string) {
    if (estagioSalvando || estagio === pessoa.estagio) return;
    setEstagioSalvando(true);
    setErroEstagio("");
    const res = await lerResultado(
      fetch(`/api/pessoas/${pessoa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estagio }),
      }),
      temId,
      "Não foi possível mudar o estágio.",
    );
    setEstagioSalvando(false);
    if (res.tipo === "ok") router.refresh();
    else setErroEstagio(res.tipo === "falha" ? res.erro : "Sem confirmação do servidor. Recarregue para ver o estágio atual.");
  }

  return (
    <div className="flex flex-col gap-6">
      <LinkRetornoFicha {...retorno} />

      {/* Quem é e em que pé está — o que se lê primeiro. */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{pessoa.codigo}</p>
            <h1 className="mt-1 break-words font-display text-2xl font-semibold text-ink">{pessoa.nome}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={s.tone}>{s.rotulo}</Badge>
              <Badge>{ORIGEM_LABEL[pessoa.origem]}</Badge>
              {!ehLead && plano && <Badge>{plano.nome}</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ehLead ? (
              // Leva só o id: a tela de matrícula abre a revisão desta pessoa —
              // nada é gerado no caminho.
              <Link
                href={`/matriculados/renovar?pessoa=${encodeURIComponent(pessoa.id)}`}
                className={classeBotao({ variante: "primario" })}
              >
                Iniciar matrícula →
              </Link>
            ) : (
              plano && (
                <>
                  {/* Vale também com pagamento pendente: é como se corrige um plano escolhido errado. */}
                  <Botao variante="contorno" onClick={() => setRenovando("alterar")}>
                    Alterar plano
                  </Botao>
                  {pessoa.status !== "pendente" && (
                    <Botao variante="contorno" onClick={() => setRenovando("renovar")}>
                      Revisar renovação
                    </Botao>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-ink">Dados pessoais</h2>
            {edicao ? (
              <div className="flex gap-2">
                <Botao variante="primario" tamanho="sm" onClick={() => void salvar()} carregando={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </Botao>
                <Botao tamanho="sm" onClick={cancelar} disabled={salvando}>
                  Cancelar
                </Botao>
              </div>
            ) : (
              <Botao tamanho="sm" onClick={editar}>
                Editar
              </Botao>
            )}
          </div>

          {edicao ? (
            <div className="flex flex-col gap-4">
              <CamposCadastro
                form={edicao.form}
                setCampo={setCampo}
                erros={erros}
                exigeCpf={false}
                mostrarOrigem={false}
                desabilitado={salvando}
              />
              <Campo rotulo="Vendedor / consultor">
                {(a) => (
                  <input
                    {...a}
                    value={edicao.vendedor}
                    onChange={(e) => setEdicao((x) => (x ? { ...x, vendedor: e.target.value } : x))}
                    disabled={salvando}
                    className={classeCampo}
                  />
                )}
              </Campo>
              {erroSalvar && <MensagemErro>{erroSalvar}</MensagemErro>}
              <p className="text-xs text-muted">Só os campos que você mudar são enviados.</p>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <Info rotulo="Telefone" valor={pessoa.telefone} />
              <Info rotulo="E-mail" valor={pessoa.email} />
              <Info rotulo="CPF" valor={pessoa.cpf} />
              <Info rotulo="RG" valor={pessoa.rg} />
              <Info rotulo="Nascimento" valor={pessoa.dataNascimento ? formatData(pessoa.dataNascimento) : undefined} />
              <Info rotulo="Vendedor" valor={pessoa.vendedor} />
              <Info rotulo="Endereço" valor={enderecoResumo(pessoa)} span />
            </dl>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5 sm:p-6">
            {ehLead ? (
              <>
                <h2 className="font-display text-sm font-semibold text-ink">Funil</h2>
                <Campo rotulo="Estágio do lead" className="mt-4">
                  {(a) => (
                    <select
                      {...a}
                      value={pessoa.estagio ?? "novo"}
                      onChange={(e) => void mudarEstagio(e.target.value)}
                      disabled={estagioSalvando}
                      className={classeCampo}
                    >
                      {ESTAGIOS.map((e) => (
                        <option key={e} value={e}>
                          {LEAD_ESTAGIO_LABEL[e]}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
                {estagioSalvando && <p role="status" className="mt-2 text-xs text-muted">Salvando estágio…</p>}
                {erroEstagio && <MensagemErro className="mt-2">{erroEstagio}</MensagemErro>}
                {pessoa.motivoPerdido && (
                  <p className="mt-3 text-sm text-muted">Motivo da perda: {pessoa.motivoPerdido}</p>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display text-sm font-semibold text-ink">Plano e datas</h2>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Info rotulo="Plano" valor={plano ? `${plano.nome}${plano.ativo === false ? " (arquivado)" : ""}` : undefined} />
                  <Info rotulo="Valor" valor={plano ? `${formatBRL(plano.valorMensal)}/mês` : undefined} />
                  <Info rotulo="Matriculado em" valor={pessoa.matriculadoEm ? formatData(pessoa.matriculadoEm) : undefined} />
                  <Info rotulo="Vence em" valor={pessoa.vencimentoPlano ? formatData(pessoa.vencimentoPlano) : undefined} />
                  <Info rotulo="Matriculado por" valor={pessoa.matriculadoPor} span />
                </dl>
                {pessoa.status === "pendente" && (
                  <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink">
                    Pagamento pendente. Receber no balcão é pela lista de alunos ou em Matrículas e renovações.
                  </p>
                )}
              </>
            )}
          </Card>

          {podeGerirAcesso && (
            <AcessoDoCadastro personId={pessoa.id} nome={pessoa.nome} acessoInicial={acesso} />
          )}
        </div>
      </div>

      {!ehLead && <CatracaDoAluno personId={pessoa.id} />}

      {!ehLead && <FreelandooDoAluno personId={pessoa.id} nome={pessoa.nome} />}

      {!ehLead && <PagamentosDoAluno personId={pessoa.id} podeGerir={podeGerirAcesso} />}

      {/* Exclusão é a última coisa da ficha, longe das ações do dia a dia. */}
      <section aria-labelledby="zona-exclusao" className={cn("rounded-xl border border-danger/30 p-4 sm:p-5")}>
        <h2 id="zona-exclusao" className="text-sm font-semibold text-ink">
          Excluir cadastro
        </h2>
        <p className="mt-1 text-sm text-muted">
          Apaga a ficha e remove a pessoa das catracas. Não dá para desfazer.
        </p>
        <div className="mt-3">
          <RemoverPessoa
            id={pessoa.id}
            nome={pessoa.nome}
            rotulo="Excluir cadastro"
            aoRemover={() => {
              router.push(retorno.href.startsWith("/matriculados/") ? "/matriculados" : retorno.href);
              router.refresh();
            }}
          />
        </div>
      </section>

      {renovando && plano && (
        <RenovarModal
          pessoa={pessoa}
          plano={plano}
          planos={renovando === "alterar" ? planos : undefined}
          onFechar={() => {
            setRenovando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function enderecoResumo(p: Pessoa): string | undefined {
  const e = p.endereco;
  if (!e) return undefined;
  const partes = [[e.rua, e.numero].filter(Boolean).join(", "), e.cidade, e.estado, e.cep].filter(Boolean);
  return partes.length ? partes.join(" · ") : undefined;
}

function Info({ rotulo, valor, span }: { rotulo: string; valor?: string; span?: boolean }) {
  return (
    <div className={cn(span && "col-span-full")}>
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-ink">{valor || "—"}</dd>
    </div>
  );
}
