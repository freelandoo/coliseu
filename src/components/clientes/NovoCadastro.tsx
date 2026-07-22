"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { ORIGEM_LABEL, type Endereco, type Origem, type Plano } from "@/lib/types";

const ORIGENS = Object.entries(ORIGEM_LABEL) as [Origem, string][];

const soDigitos = (s: string) => s.replace(/\D/g, "");
const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

interface FormState {
  nome: string;
  origem: Origem;
  telefone: string;
  email: string;
  cpf: string;
  rg: string;
  vendedor: string;
  dataNascimento: string;
  cep: string;
  estado: string;
  cidade: string;
  rua: string;
  numero: string;
}

const VAZIO: FormState = {
  nome: "",
  origem: "whatsapp",
  telefone: "",
  email: "",
  cpf: "",
  rg: "",
  vendedor: "",
  dataNascimento: "",
  cep: "",
  estado: "",
  cidade: "",
  rua: "",
  numero: "",
};

/**
 * Sem `planos`, cria a pessoa como lead do funil (Captação). Com `planos`
 * (Matriculados), já matricula direto no plano escolhido: cria a pessoa e
 * dispara a mesma ação `matricular` do fluxo de matrícula (Asaas + cobrança
 * pendente + provisionamento nas catracas).
 */
export function NovoCadastro({
  planos,
  variante = "primaria",
}: {
  planos?: Plano[];
  /** `secundaria` cede o destaque a outro botão ao lado (ex.: conectar WhatsApp). */
  variante?: "primaria" | "secundaria";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn(
          "rounded-lg px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
          variante === "primaria"
            ? "bg-red text-white hover:bg-red-bright"
            : "border border-border-strong text-muted hover:text-ink",
        )}
      >
        + Novo cadastro
      </button>
      {aberto && (
        <ModalCadastro
          planos={planos}
          onFechar={() => setAberto(false)}
          onCriado={() => {
            setAberto(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ModalCadastro({
  planos,
  onFechar,
  onCriado,
}: {
  planos?: Plano[];
  onFechar: () => void;
  onCriado: () => void;
}) {
  const matriculaDireta = !!planos && planos.length > 0;
  const [form, setForm] = useState<FormState>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof FormState, string>>>({});
  const [planoId, setPlanoId] = useState(planos?.[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erroApi, setErroApi] = useState("");
  const [sucesso, setSucesso] = useState<{ nome: string; planoNome: string; waLink?: string; linkPagamento?: string } | null>(null);

  const set = (campo: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [campo]: v }));

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
      /* offline: preenche manual */
    }
  }

  function validar(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome.trim()) e.nome = "Informe o nome";

    const temEmail = form.email.trim() !== "";
    const temTel = form.telefone.trim() !== "";
    if (temEmail && !emailValido(form.email)) e.email = "E-mail inválido";
    if (temTel && soDigitos(form.telefone).length < 10) e.telefone = "Celular inválido";
    if (!temEmail && !temTel) {
      e.telefone = "Informe telefone ou e-mail";
      e.email = "Informe telefone ou e-mail";
    }
    // Asaas exige CPF para gerar a assinatura/cobrança da matrícula.
    if (matriculaDireta && soDigitos(form.cpf).length !== 11) e.cpf = "CPF deve ter 11 dígitos";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function enviar() {
    setErroApi("");
    if (!validar()) return;
    setEnviando(true);

    const endereco: Endereco | undefined =
      form.cep || form.estado || form.cidade || form.rua || form.numero
        ? {
            cep: form.cep || undefined,
            estado: form.estado || undefined,
            cidade: form.cidade || undefined,
            rua: form.rua || undefined,
            numero: form.numero || undefined,
          }
        : undefined;

    try {
      const r = await fetch("/api/pessoas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          origem: form.origem,
          telefone: form.telefone,
          email: form.email,
          cpf: form.cpf,
          rg: form.rg,
          vendedor: form.vendedor,
          dataNascimento: form.dataNascimento,
          endereco,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErroApi(d?.erro ?? "Não foi possível cadastrar.");
        setEnviando(false);
        return;
      }

      if (!matriculaDireta) {
        onCriado();
        return;
      }

      // Matrícula direta: mesma ação do fluxo de matrícula (lead → aluno +
      // assinatura Asaas + cobrança pendente + provisionamento nas catracas).
      const pessoa = (await r.json()) as { id: string };
      const plano = planos!.find((p) => p.id === planoId) ?? planos![0];
      const rm = await fetch(`/api/pessoas/${pessoa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "matricular", planoId: plano.id }),
      });
      if (!rm.ok) {
        const d = await rm.json().catch(() => ({}));
        setErroApi(
          `${d?.erro ?? "Falha ao matricular"} — o cadastro foi criado como lead; matricule pela Captação.`,
        );
        setEnviando(false);
        return;
      }
      const dm = (await rm.json()) as { waLink?: string; linkPagamento?: string };
      setEnviando(false);
      setSucesso({ nome: form.nome.trim(), planoNome: plano.nome, waLink: dm.waLink, linkPagamento: dm.linkPagamento });
    } catch {
      setErroApi("Falha de conexão.");
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
      >
        {sucesso ? (
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-2xl text-ok">✓</span>
            <h3 className="mt-4 font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Matriculado com sucesso
            </h3>
            <p className="mt-1 text-sm text-muted">
              {sucesso.nome} · {sucesso.planoNome}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              Aguardando pagamento — quando confirmar, o acesso é liberado sozinho.
            </p>
            {(sucesso.waLink || sucesso.linkPagamento) && (
              <a
                href={sucesso.waLink ?? sucesso.linkPagamento}
                target="_blank"
                rel="noreferrer"
                className="mt-5 block rounded-lg bg-red px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
              >
                {sucesso.waLink ? "Enviar link de pagamento no WhatsApp" : "Abrir link de pagamento"}
              </a>
            )}
            <button
              onClick={onCriado}
              className="mt-3 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
            >
              Concluir
            </button>
          </div>
        ) : (
        <>
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Novo cadastro
        </h3>
        <p className="mt-0.5 text-xs text-faint">
          {matriculaDireta ? (
            <>Já entra <strong className="text-muted">matriculado</strong> no plano escolhido, com pagamento pendente.</>
          ) : (
            <>Entra como <strong className="text-muted">lead novo</strong> no funil.</>
          )}
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <Campo
            label="Nome *"
            value={form.nome}
            erro={erros.nome}
            onChange={(v) => set("nome", v)}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Origem *</label>
            <select
              value={form.origem}
              onChange={(e) => set("origem", e.target.value)}
              className={inputCls}
            >
              {ORIGENS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Campo
            label="Celular / WhatsApp"
            value={form.telefone}
            erro={erros.telefone}
            placeholder="(11) 90000-0000"
            onChange={(v) => set("telefone", v)}
          />
          <Campo
            label="E-mail"
            value={form.email}
            erro={erros.email}
            placeholder="nome@email.com"
            onChange={(v) => set("email", v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Campo
              label={matriculaDireta ? "CPF *" : "CPF"}
              value={form.cpf}
              erro={erros.cpf}
              placeholder="000.000.000-00"
              onChange={(v) => set("cpf", v)}
            />
            <Campo
              label="RG"
              value={form.rg}
              placeholder="00.000.000-0"
              onChange={(v) => set("rg", v)}
            />
          </div>
          <Campo
            label="Data de nascimento"
            type="date"
            value={form.dataNascimento}
            onChange={(v) => set("dataNascimento", v)}
          />
          <Campo
            label="Vendedor / consultor"
            value={form.vendedor}
            placeholder="Quem fez a venda"
            onChange={(v) => set("vendedor", v)}
          />

          <span className="mt-1 text-xs font-semibold uppercase tracking-widest text-faint">
            Endereço (opcional)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Campo
              label="CEP"
              value={form.cep}
              placeholder="00000-000"
              onChange={(v) => {
                set("cep", v);
                if (soDigitos(v).length === 8) preencherPorCep(v);
              }}
            />
            <Campo label="Estado" value={form.estado} placeholder="UF" onChange={(v) => set("estado", v)} />
            <Campo label="Cidade" value={form.cidade} onChange={(v) => set("cidade", v)} />
            <Campo label="Número" value={form.numero} onChange={(v) => set("numero", v)} />
          </div>
          <Campo label="Rua" value={form.rua} onChange={(v) => set("rua", v)} />

          {matriculaDireta && (
            <>
              <span className="mt-1 text-xs font-semibold uppercase tracking-widest text-faint">
                Plano *
              </span>
              {planos!.map((p) => {
                const selecionado = p.id === planoId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => !enviando && setPlanoId(p.id)}
                    className={cn(
                      "rounded-lg border px-4 py-2.5 text-left transition-colors",
                      selecionado
                        ? "border-red/50 bg-red-ghost"
                        : "border-border bg-surface hover:border-border-strong",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                        {p.nome}
                      </span>
                      <span className={cn("text-sm", selecionado ? "text-red-bright" : "text-muted")}>
                        {formatBRL(p.valorMensal)}/mês
                      </span>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {erroApi && <p className="mt-3 text-xs text-red-bright">{erroApi}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={enviar}
            disabled={enviando}
            className={cn(
              "flex-1 rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
              enviando
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : "bg-red text-white hover:bg-red-bright",
            )}
          >
            {enviando ? "Salvando…" : matriculaDireta ? "Matricular" : "Cadastrar"}
          </button>
          <button
            onClick={onFechar}
            className="rounded-lg border border-border-strong px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

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
