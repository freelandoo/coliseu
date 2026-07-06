"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { linkPagamentoWhatsApp } from "@/lib/asaas";
import type { Candidato, Plano } from "@/lib/types";

const PASSOS = [
  "Escolher plano",
  "Cadastrar cliente no CRM",
  "Criar/localizar no Asaas",
  "Gerar cobrança",
  "Enviar link (WhatsApp / e-mail)",
  "Webhook confirma pagamento",
  "Status: Pago / Ativo",
  "Aluno matriculado",
] as const;

type CampoOpcional =
  | "email"
  | "whatsapp"
  | "dataNascimento"
  | "endereco";

const LABEL_OPCIONAL: Record<CampoOpcional, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  dataNascimento: "Data de nascimento",
  endereco: "Endereço",
};

/** Registro de uma matrícula feita nesta sessão (vive só na aba). */
interface Matriculado {
  id: string;
  codigo: string;
  nome: string;
  planoNome: string;
  valor: number;
  waLink?: string; // presente se tem WhatsApp
  email?: string; // presente se tem e-mail
  sincronizadoAsaas: boolean;
  faltando: CampoOpcional[];
}

const soDigitos = (s: string) => s.replace(/\D/g, "");
const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const celValido = (s: string) => soDigitos(s).length >= 10;

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

interface FormState {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  dataNascimento: string;
  cep: string;
  estado: string;
  cidade: string;
  rua: string;
  numero: string;
}

const FORM_VAZIO: FormState = {
  nome: "",
  telefone: "",
  email: "",
  cpf: "",
  dataNascimento: "",
  cep: "",
  estado: "",
  cidade: "",
  rua: "",
  numero: "",
};

export function MatriculaFlow({
  planos,
  candidatosIniciais,
  matriculadosIniciais,
  proximoCodigoInicial,
}: {
  planos: Plano[];
  candidatosIniciais: Candidato[];
  matriculadosIniciais: Matriculado[];
  proximoCodigoInicial: string;
}) {
  const router = useRouter();
  const [candidatos, setCandidatos] = useState(candidatosIniciais);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Candidato | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof FormState, string>>>({});
  const [planoId, setPlanoId] = useState(planos[0]?.id ?? "");

  const [ativo, setAtivo] = useState(-1);
  const [rodando, setRodando] = useState(false);

  const [matriculados, setMatriculados] = useState(matriculadosIniciais);
  const [modal, setModal] = useState<Matriculado | null>(null);

  const listaRef = useRef<HTMLOListElement>(null);
  const [codigoSeq, setCodigoSeq] = useState(
    Number(proximoCodigoInicial.replace(/\D/g, "")) || 1,
  );

  const plano = planos.find((p) => p.id === planoId);

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return candidatos;
    const qd = soDigitos(busca);
    return candidatos.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (qd.length > 0 && soDigitos(c.telefone).includes(qd)),
    );
  }, [busca, candidatos]);

  function selecionar(c: Candidato) {
    if (rodando) return;
    setSel(c);
    setErros({});
    setAtivo(-1);
    setPlanoId(c.planoAtualId ?? planos[0]?.id ?? "");
    setForm({
      ...FORM_VAZIO,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email ?? "",
      cpf: c.cpf ?? "",
    });
  }

  function cancelar() {
    if (rodando) return;
    setSel(null);
    setForm(FORM_VAZIO);
    setErros({});
    setAtivo(-1);
  }

  /** Autofill de endereço pelo CEP (roda no navegador; degrada em silêncio se offline). */
  async function preencherPorCep(cepRaw: string) {
    const cep = soDigitos(cepRaw);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.erro) return;
      setForm((f) => ({
        ...f,
        estado: d.uf ?? f.estado,
        cidade: d.localidade ?? f.cidade,
        rua: d.logradouro ?? f.rua,
      }));
    } catch {
      /* sem internet: preenche manualmente */
    }
  }

  function validar(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome.trim()) e.nome = "Informe o nome";
    if (soDigitos(form.cpf).length !== 11) e.cpf = "CPF deve ter 11 dígitos";

    const emailPreenchido = form.email.trim() !== "";
    const celPreenchido = form.telefone.trim() !== "";
    const emailOk = emailPreenchido && emailValido(form.email);
    const celOk = celValido(form.telefone);

    if (emailPreenchido && !emailValido(form.email)) e.email = "E-mail inválido";
    if (celPreenchido && !celOk) e.telefone = "Celular inválido";

    // precisa de ao menos um canal de contato válido
    if (!emailOk && !celOk) {
      if (!e.email) e.email = "Informe e-mail ou WhatsApp";
      if (!e.telefone) e.telefone = "Informe e-mail ou WhatsApp";
    }

    setErros(e);
    return Object.keys(e).length === 0;
  }

  const { contextSafe } = useGSAP({ scope: listaRef });

  const matricular = contextSafe(() => {
    if (rodando || !sel || !plano) return;
    if (!validar()) return;

    setRodando(true);
    setAtivo(-1);

    const itens = gsap.utils.toArray<HTMLElement>("[data-passo]");
    gsap.set(itens, { opacity: 0.35 });

    const tl = gsap.timeline({ onComplete: () => void finalizar() });
    itens.forEach((el, i) => {
      tl.to(
        el,
        {
          opacity: 1,
          duration: 0.25,
          ease: "power2.out",
          onStart: () => setAtivo(i),
        },
        i === 0 ? 0 : "+=0.4",
      ).fromTo(
        el.querySelector("[data-bolinha]"),
        { scale: 0.6 },
        { scale: 1, duration: 0.3, ease: "back.out(2)" },
        "<",
      );
    });
  });

  async function finalizar() {
    if (!sel || !plano) return;

    // a pessoa já tem código desde o cadastro; usa o dela (fallback só por segurança)
    const codigo = sel.codigo ?? `CD${String(codigoSeq).padStart(5, "0")}`;
    setCodigoSeq((n) => n + 1);

    const temCel = celValido(form.telefone);
    const temEmail = form.email.trim() !== "" && emailValido(form.email);
    const email = temEmail ? form.email.trim() : undefined;

    // persiste a transição lead → aluno + cria assinatura no Asaas (via API)
    let waLink: string | undefined;
    try {
      const r = await fetch(`/api/pessoas/${sel.refId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "matricular",
          planoId: plano.id,
          telefone: form.telefone,
          email: form.email,
          cpf: form.cpf,
          dataNascimento: form.dataNascimento || undefined,
          endereco: {
            cep: form.cep || undefined,
            estado: form.estado || undefined,
            cidade: form.cidade || undefined,
            rua: form.rua || undefined,
            numero: form.numero || undefined,
          },
        }),
      });
      const data = (await r.json()) as { waLink?: string; linkPagamento?: string };
      waLink =
        data.waLink ??
        (temCel && data.linkPagamento
          ? linkPagamentoWhatsApp(form.telefone, form.nome, data.linkPagamento)
          : undefined);
      router.refresh();
    } catch {
      /* rede off: segue sem link real; a lista é atualizada no próximo refresh */
    }

    const enderecoCompleto =
      form.cep.trim() &&
      form.estado.trim() &&
      form.cidade.trim() &&
      form.rua.trim() &&
      form.numero.trim();

    const faltando: CampoOpcional[] = [];
    if (!temEmail) faltando.push("email");
    if (!temCel) faltando.push("whatsapp");
    if (!form.dataNascimento) faltando.push("dataNascimento");
    if (!enderecoCompleto) faltando.push("endereco");

    const novo: Matriculado = {
      id: `sess-${sel.refId}-${codigo}`,
      codigo,
      nome: form.nome.trim(),
      planoNome: plano.nome,
      valor: plano.valorMensal,
      waLink,
      email,
      sincronizadoAsaas: true,
      faltando,
    };

    setMatriculados((prev) => [novo, ...prev]);
    setCandidatos((prev) => prev.filter((c) => c.refId !== sel.refId));
    setModal(novo);
    setRodando(false);
    setSel(null);
    setForm(FORM_VAZIO);
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ---------- coluna esquerda: busca OU cadastro ---------- */}
        <div className="flex flex-col gap-4">
          {!sel ? (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-faint">
                1 · Buscar pessoa
              </label>
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou celular…"
                className={inputCls}
              />
              <p className="text-xs text-faint">
                Leads em aberto e alunos que precisam renovar.
              </p>

              <div className="flex flex-col gap-2">
                {resultados.length === 0 ? (
                  <Card className="px-4 py-6 text-center text-sm text-faint">
                    Ninguém encontrado.
                  </Card>
                ) : (
                  resultados.map((c) => (
                    <button
                      key={c.refId}
                      onClick={() => selecionar(c)}
                      className="rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-red/40 hover:bg-surface-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">
                          {c.nome}
                        </span>
                        <Badge tone={c.origem === "renovacao" ? "warn" : "neutral"}>
                          {c.origem === "renovacao" ? "Renovar" : "Lead"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-faint">{c.telefone}</p>
                      <p className="mt-0.5 text-xs text-muted">{c.detalhe}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                  2 · Confirmar cadastro
                </span>
                <button
                  onClick={cancelar}
                  disabled={rodando}
                  className="text-xs text-faint transition-colors hover:text-ink disabled:opacity-40"
                >
                  ← trocar pessoa
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <Campo
                  label="Nome *"
                  value={form.nome}
                  erro={erros.nome}
                  onChange={(v) => setForm((f) => ({ ...f, nome: v }))}
                />
                <Campo
                  label="Celular / WhatsApp"
                  value={form.telefone}
                  erro={erros.telefone}
                  placeholder="(11) 90000-0000"
                  onChange={(v) => setForm((f) => ({ ...f, telefone: v }))}
                />
                <Campo
                  label="E-mail"
                  value={form.email}
                  erro={erros.email}
                  placeholder="nome@email.com"
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                />
                <Campo
                  label="CPF *"
                  value={form.cpf}
                  erro={erros.cpf}
                  placeholder="000.000.000-00"
                  onChange={(v) => setForm((f) => ({ ...f, cpf: v }))}
                />
                <p className="text-xs text-faint">
                  Obrigatório: CPF + pelo menos um contato (WhatsApp ou e-mail).
                </p>
              </div>

              {/* endereço opcional */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                  Endereço (opcional)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Campo
                    label="CEP"
                    value={form.cep}
                    placeholder="00000-000"
                    onChange={(v) => {
                      setForm((f) => ({ ...f, cep: v }));
                      if (soDigitos(v).length === 8) preencherPorCep(v);
                    }}
                  />
                  <Campo
                    label="Estado"
                    value={form.estado}
                    placeholder="UF"
                    onChange={(v) => setForm((f) => ({ ...f, estado: v }))}
                  />
                  <Campo
                    label="Cidade"
                    value={form.cidade}
                    onChange={(v) => setForm((f) => ({ ...f, cidade: v }))}
                  />
                  <Campo
                    label="Número"
                    value={form.numero}
                    onChange={(v) => setForm((f) => ({ ...f, numero: v }))}
                  />
                </div>
                <Campo
                  label="Rua"
                  value={form.rua}
                  onChange={(v) => setForm((f) => ({ ...f, rua: v }))}
                />
                <Campo
                  label="Data de nascimento"
                  type="date"
                  value={form.dataNascimento}
                  onChange={(v) => setForm((f) => ({ ...f, dataNascimento: v }))}
                />
              </div>

              {/* planos */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                  3 · Escolher plano
                </span>
                {planos.map((p) => {
                  const sel2 = p.id === planoId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => !rodando && setPlanoId(p.id)}
                      className={cn(
                        "rounded-lg border px-4 py-2.5 text-left transition-colors",
                        sel2
                          ? "border-red/50 bg-red-ghost"
                          : "border-border bg-surface hover:border-border-strong",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                          {p.nome}
                        </span>
                        <span
                          className={cn(
                            "text-sm",
                            sel2 ? "text-red-bright" : "text-muted",
                          )}
                        >
                          {formatBRL(p.valorMensal)}/mês
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={matricular}
                disabled={rodando}
                className={cn(
                  "rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
                  rodando
                    ? "cursor-not-allowed bg-surface-2 text-faint"
                    : "bg-red text-white hover:bg-red-bright",
                )}
              >
                {rodando ? "Processando…" : "Matricular"}
              </button>
            </div>
          )}
        </div>

        {/* ---------- coluna direita: esteira ---------- */}
        <Card className="p-6">
          <ol ref={listaRef} className="relative flex flex-col gap-0">
            {PASSOS.map((passo, i) => {
              const feito = ativo > i;
              const corrente = ativo === i;
              return (
                <li
                  key={passo}
                  data-passo
                  className="flex items-start gap-4 pb-5 last:pb-0"
                  style={{ opacity: ativo === -1 ? 0.35 : undefined }}
                >
                  <div className="relative flex flex-col items-center">
                    <span
                      data-bolinha
                      className={cn(
                        "z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                        corrente
                          ? "border-red bg-red text-white shadow-[var(--shadow-red)]"
                          : feito
                            ? "border-ok/60 bg-ok/15 text-ok"
                            : "border-border bg-surface text-faint",
                      )}
                    >
                      {feito ? "✓" : i + 1}
                    </span>
                    {i < PASSOS.length - 1 && (
                      <span
                        className={cn(
                          "absolute top-7 h-full w-px",
                          ativo > i ? "bg-ok/40" : "bg-border",
                        )}
                      />
                    )}
                  </div>
                  <p
                    className={cn(
                      "pt-0.5 text-sm font-medium",
                      corrente ? "text-ink" : feito ? "text-muted" : "text-faint",
                    )}
                  >
                    {passo}
                  </p>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {/* ---------- matriculados / aguardando pagamento ---------- */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Aguardando pagamento
        </h2>
        {matriculados.length === 0 ? (
          <Card className="px-5 py-8 text-center text-sm text-faint">
            Nenhuma matrícula pendente.
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {matriculados.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {m.nome}{" "}
                    <span className="text-xs font-normal text-faint">
                      · {m.codigo}
                    </span>
                  </p>
                  <p className="text-xs text-faint">
                    {m.planoNome} · {formatBRL(m.valor)}
                    {m.faltando.length > 0 && (
                      <span className="text-warn"> · cadastro incompleto</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={m.sincronizadoAsaas ? "ok" : "warn"}>
                    {m.sincronizadoAsaas ? "Sincronizado Asaas" : "Aguardando Asaas"}
                  </Badge>
                  <ContatoLink waLink={m.waLink} email={m.email} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ---------- modal de sucesso ---------- */}
      {modal && <ModalSucesso dados={modal} onFechar={() => setModal(null)} />}
    </>
  );
}

/* ---------- link de contato (WhatsApp ou e-mail) ---------- */
function ContatoLink({
  waLink,
  email,
}: {
  waLink?: string;
  email?: string;
}) {
  const cls =
    "rounded-md bg-red px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-bright";
  if (waLink) {
    return (
      <a href={waLink} target="_blank" rel="noreferrer" className={cls}>
        Reenviar (WhatsApp)
      </a>
    );
  }
  if (email) {
    return (
      <a href={`mailto:${email}`} className={cls}>
        Reenviar (e-mail)
      </a>
    );
  }
  return null;
}

/* ---------- campo de formulário ---------- */
function Campo({
  label,
  value,
  onChange,
  erro,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputCls, erro && "border-red/70")}
      />
      {erro && <p className="mt-1 text-xs text-red-bright">{erro}</p>}
    </div>
  );
}

/* ---------- modal de sucesso ---------- */
function ModalSucesso({
  dados,
  onFechar,
}: {
  dados: Matriculado;
  onFechar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ok/15 text-lg text-ok">
            ✓
          </span>
          <div>
            <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Matriculado com sucesso
            </h3>
            <p className="text-xs text-faint">Código {dados.codigo}</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm">
          <Linha rotulo="Aluno" valor={dados.nome} />
          <Linha rotulo="Plano" valor={dados.planoNome} />
          <Linha rotulo="Valor" valor={`${formatBRL(dados.valor)}/mês`} />
        </div>

        {(dados.waLink || dados.email) && (
          <a
            href={dados.waLink ?? `mailto:${dados.email}`}
            target={dados.waLink ? "_blank" : undefined}
            rel="noreferrer"
            className="mt-4 block rounded-lg bg-red px-4 py-3 text-center font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
          >
            {dados.waLink
              ? "Enviar link de pagamento no WhatsApp"
              : "Enviar link de pagamento por e-mail"}
          </a>
        )}

        <button
          onClick={onFechar}
          className="mt-3 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
        >
          Confirmar
        </button>

        {dados.faltando.length > 0 && (
          <div className="mt-5 rounded-lg border border-warn/30 bg-warn/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-warn">
              Obs · cadastro incompleto
            </p>
            <p className="mt-1 text-xs text-muted">
              A matrícula foi concluída, mas ainda faltam:
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {dados.faltando.map((campo) => (
                <li
                  key={campo}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-ink"
                >
                  {LABEL_OPCIONAL[campo]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-faint">{rotulo}</span>
      <span className="font-medium text-ink">{valor}</span>
    </div>
  );
}
