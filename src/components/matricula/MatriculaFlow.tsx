"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { concluirSeReduzido } from "@/lib/movimento";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { Campo as CampoBase, classeCampo } from "@/components/ui/Campo";
import { linkPagamentoWhatsApp } from "@/lib/asaas";
import { CheckoutBalcao, type MetodoBalcao } from "@/components/matricula/CheckoutBalcao";
import type { Candidato, Plano } from "@/lib/types";

const METODO_LABEL: Record<MetodoBalcao, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão débito",
  credito: "Cartão crédito",
};

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
  personId: string; // id da pessoa (para o checkout de balcão)
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
  const [checkout, setCheckout] = useState<Matriculado | null>(null);
  const [pagoInfo, setPagoInfo] = useState<{ nome: string; metodo: MetodoBalcao } | null>(null);

  function aoPagar(m: Matriculado, metodo: MetodoBalcao) {
    setMatriculados((prev) => prev.filter((x) => x.id !== m.id));
    setCheckout(null);
    setPagoInfo({ nome: m.nome, metodo });
    router.refresh();
  }

  const listaRef = useRef<HTMLOListElement>(null);
  const buscaId = useId();
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
    // Movimento reduzido: a esteira vai direto ao fim e o `onComplete` chama
    // `finalizar()` uma única vez, no mesmo clique — nunca pular com `return`.
    concluirSeReduzido(tl);
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
      personId: sel.refId,
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
              <label htmlFor={buscaId} className="text-sm font-semibold text-ink">
                1 · Buscar pessoa
              </label>
              <input
                id={buscaId}
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou celular…"
                autoComplete="off"
                className={classeCampo}
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
                      type="button"
                      key={c.refId}
                      onClick={() => selecionar(c)}
                      className="rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-brand/40 hover:bg-surface-2"
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
                <span className="text-sm font-semibold text-ink">
                  2 · Confirmar cadastro
                </span>
                <Botao variante="discreto" tamanho="sm" onClick={cancelar} disabled={rodando}>
                  ← trocar pessoa
                </Botao>
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
                  inputMode="tel"
                  autoComplete="off"
                  value={form.telefone}
                  erro={erros.telefone}
                  placeholder="(11) 90000-0000"
                  onChange={(v) => setForm((f) => ({ ...f, telefone: v }))}
                />
                <Campo
                  label="E-mail"
                  inputMode="email"
                  autoComplete="off"
                  value={form.email}
                  erro={erros.email}
                  placeholder="nome@email.com"
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                />
                <Campo
                  label="CPF *"
                  inputMode="numeric"
                  autoComplete="off"
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
                <span className="text-sm font-semibold text-ink">
                  Endereço (opcional)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Campo
                    label="CEP"
                    inputMode="numeric"
                    autoComplete="off"
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
                <span className="text-sm font-semibold text-ink">
                  3 · Escolher plano
                </span>
                {planos.map((p) => {
                  const sel2 = p.id === planoId;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => !rodando && setPlanoId(p.id)}
                      aria-pressed={sel2}
                      className={cn(
                        "rounded-lg border px-4 py-2.5 text-left transition-colors",
                        sel2
                          ? "border-brand bg-brand-soft"
                          : "border-border-strong bg-surface hover:border-control",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-ink">
                          {p.nome}
                        </span>
                        <span
                          className={cn(
                            "text-sm tabular-nums",
                            sel2 ? "font-semibold text-brand" : "text-muted",
                          )}
                        >
                          {formatBRL(p.valorMensal)}/mês
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Botao variante="primario" tamanho="lg" onClick={matricular} carregando={rodando}>
                {rodando ? "Processando…" : "Matricular"}
              </Botao>
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
                          ? "border-brand bg-brand text-white shadow-[var(--shadow-red)]"
                          : feito
                            ? "border-success/60 bg-success-soft text-success"
                            : "border-border bg-surface text-faint",
                      )}
                    >
                      {feito ? "✓" : i + 1}
                    </span>
                    {i < PASSOS.length - 1 && (
                      <span
                        className={cn(
                          "absolute top-7 h-full w-px",
                          ativo > i ? "bg-success/40" : "bg-border",
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
        <h2 className="mb-4 text-base font-semibold text-ink">
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
                      <span className="text-warning"> · cadastro incompleto</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <Badge tone={m.sincronizadoAsaas ? "ok" : "warn"}>
                    {m.sincronizadoAsaas ? "Sincronizado Asaas" : "Aguardando Asaas"}
                  </Badge>
                  <div className="flex flex-col gap-1.5">
                    <ContatoLink waLink={m.waLink} email={m.email} />
                    <Botao variante="contorno" tamanho="sm" onClick={() => setCheckout(m)}>
                      Venda de balcão
                    </Botao>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ---------- modal de sucesso ---------- */}
      {modal && (
        <ModalSucesso
          dados={modal}
          onFechar={() => setModal(null)}
          onBalcao={() => {
            const m = modal;
            setModal(null);
            setCheckout(m);
          }}
        />
      )}

      {/* ---------- checkout de balcão ---------- */}
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

      {/* ---------- confirmação de pagamento (balcão) ---------- */}
      {pagoInfo && (
        // Aviso sem dado digitado: fecha também no clique do fundo (como antes).
        <Modal onFechar={() => setPagoInfo(null)} fecharAoClicarFora className="max-w-sm text-center">
          <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
            ✓
          </span>
          <TituloModal className="mt-4">Pagamento confirmado</TituloModal>
          <p className="mt-1 text-sm text-muted">
            {pagoInfo.nome} · {METODO_LABEL[pagoInfo.metodo]}
          </p>
          <p className="mt-0.5 text-xs text-faint">Matrícula ativa e acesso liberado.</p>
          <Botao variante="primario" bloco onClick={() => setPagoInfo(null)} className="mt-5">
            Concluir
          </Botao>
        </Modal>
      )}
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
  const cls = classeBotao({ variante: "primario", tamanho: "sm" });
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
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
}) {
  return (
    <CampoBase rotulo={label} erro={erro}>
      {(a) => (
        <input
          {...a}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          className={classeCampo}
        />
      )}
    </CampoBase>
  );
}

/* ---------- modal de sucesso ---------- */
function ModalSucesso({
  dados,
  onFechar,
  onBalcao,
}: {
  dados: Matriculado;
  onFechar: () => void;
  onBalcao: () => void;
}) {
  return (
    // Clique no fundo não fecha: o aviso do que fazer a seguir só sai no botão.
    // Esc equivale ao "Fechar", que está sempre disponível aqui.
    <Modal onFechar={onFechar}>
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-lg text-success">
            ✓
          </span>
          <div>
            <TituloModal>Matriculado com sucesso</TituloModal>
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
            className={cn(classeBotao({ variante: "primario", tamanho: "lg", bloco: true }), "mt-4")}
          >
            {dados.waLink
              ? "Enviar link de pagamento no WhatsApp"
              : "Enviar link de pagamento por e-mail"}
          </a>
        )}

        {/* venda de balcão — sempre abaixo do link de pagamento */}
        <Botao variante="contorno" tamanho="lg" bloco onClick={onBalcao} className="mt-3">
          Venda de balcão →
        </Botao>

        <Botao bloco onClick={onFechar} className="mt-3">
          Fechar
        </Botao>

        {dados.faltando.length > 0 && (
          <div className="mt-5 rounded-lg border border-warning/30 bg-warning-soft p-4">
            <p className="text-sm font-semibold text-warning">
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
    </Modal>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-faint">{rotulo}</span>
      <span className="font-medium text-ink tabular-nums">{valor}</span>
    </div>
  );
}
