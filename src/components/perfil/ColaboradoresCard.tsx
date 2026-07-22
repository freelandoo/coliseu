"use client";

import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";

export type Papel = "ADMIN" | "RECEPCAO" | "TECNICO";

export interface Colaborador {
  id: string;
  nome: string;
  login: string;
  email: string | null;
  role: Papel;
  ativo: boolean;
  senhaProvisoria: boolean;
  personId: string | null;
}

const PAPEL_LABEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  RECEPCAO: "Colaborador",
  TECNICO: "Técnico",
};

const PAPEIS = Object.entries(PAPEL_LABEL) as [Papel, string][];

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

/** Senha inicial legível: o admin dita para a pessoa e ela troca no 1º acesso. */
function senhaProvisoria(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `coliseu${n}`;
}

export function ColaboradoresCard({
  iniciais,
  meuId,
}: {
  iniciais: Colaborador[];
  meuId: string;
}) {
  const [lista, setLista] = useState(iniciais);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState("");
  const [credencial, setCredencial] = useState<{ nome: string; login: string; senha: string } | null>(
    null,
  );

  async function patch(id: string, body: Record<string, unknown>) {
    setErro("");
    const r = await fetch(`/api/colaboradores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d?.erro ?? "Não foi possível atualizar.");
      return;
    }
    setLista((l) => l.map((c) => (c.id === id ? d.colaborador : c)));
  }

  async function resetarSenha(c: Colaborador) {
    const senha = senhaProvisoria();
    setErro("");
    const r = await fetch(`/api/colaboradores/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d?.erro ?? "Não foi possível redefinir a senha.");
      return;
    }
    setLista((l) => l.map((x) => (x.id === c.id ? d.colaborador : x)));
    setCredencial({ nome: c.nome, login: c.login, senha });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
            Colaboradores
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            Quem tem acesso ao sistema. A senha que você define é provisória — a pessoa troca no
            primeiro acesso.
          </p>
        </div>
        <button
          onClick={() => setNovo(true)}
          className="rounded-lg bg-red px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
        >
          + Colaborador
        </button>
      </div>

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {lista.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className="truncate">{c.nome}</span>
                {c.id === meuId && <span className="text-xs font-normal text-faint">(você)</span>}
                {!c.ativo && <Badge>Desativado</Badge>}
                {c.senhaProvisoria && c.ativo && <Badge tone="warn">Senha provisória</Badge>}
              </p>
              <p className="text-xs text-faint">
                login: <span className="text-muted">{c.login}</span>
                {c.email && ` · ${c.email}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={c.role}
                onChange={(e) => patch(c.id, { role: e.target.value })}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-red/60"
              >
                {PAPEIS.map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => resetarSenha(c)}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-faint transition-colors hover:text-ink"
              >
                Nova senha
              </button>
              <button
                onClick={() => patch(c.id, { ativo: !c.ativo })}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  c.ativo
                    ? "border-border text-faint hover:border-red/60 hover:text-red-bright"
                    : "border-ok/40 text-ok hover:bg-ok/10",
                )}
              >
                {c.ativo ? "Desativar" : "Reativar"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {novo && (
        <ModalNovoColaborador
          onFechar={() => setNovo(false)}
          onCriado={(c, senha) => {
            setLista((l) => [...l, c]);
            setNovo(false);
            setCredencial({ nome: c.nome, login: c.login, senha });
          }}
        />
      )}

      {credencial && (
        <ModalCredencial dados={credencial} onFechar={() => setCredencial(null)} />
      )}
    </Card>
  );
}

function ModalNovoColaborador({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (c: Colaborador, senha: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<Papel>("RECEPCAO");
  const [senha, setSenha] = useState(senhaProvisoria());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    setSalvando(true);
    const r = await fetch("/api/colaboradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, login: login || undefined, senha, role }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) {
      setErro(d?.erro ?? "Não foi possível criar o acesso.");
      return;
    }
    onCriado(d.colaborador, senha);
  }

  return (
    <Modal onFechar={onFechar}>
      <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        Novo colaborador
      </h3>
      <p className="mt-0.5 text-xs text-faint">
        Sem e-mail: o acesso é por nome de login e senha.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Nome *</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Login</label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="deixe vazio para gerar a partir do nome"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Senha provisória *</label>
          <input value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Papel</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Papel)}
            className={inputCls}
          >
            {PAPEIS.map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={salvar}
          disabled={salvando || !nome.trim() || senha.length < 8}
          className={cn(
            "flex-1 rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
            salvando || !nome.trim() || senha.length < 8
              ? "cursor-not-allowed bg-surface-2 text-faint"
              : "bg-red text-white hover:bg-red-bright",
          )}
        >
          {salvando ? "Criando…" : "Criar acesso"}
        </button>
        <button
          onClick={onFechar}
          className="rounded-lg border border-border-strong px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

/** A senha só aparece aqui: no banco fica o hash, não dá para consultar depois. */
function ModalCredencial({
  dados,
  onFechar,
}: {
  dados: { nome: string; login: string; senha: string };
  onFechar: () => void;
}) {
  return (
    <Modal onFechar={onFechar} className="text-center">
      <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        Acesso de {dados.nome}
      </h3>
      <p className="mt-2 text-sm text-muted">
        Passe estes dados para a pessoa. Ela troca a senha no primeiro acesso.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-left text-sm">
        <p className="flex justify-between py-1">
          <span className="text-faint">Login</span>
          <span className="font-medium text-ink">{dados.login}</span>
        </p>
        <p className="flex justify-between py-1">
          <span className="text-faint">Senha</span>
          <span className="font-medium text-ink">{dados.senha}</span>
        </p>
      </div>
      <p className="mt-3 text-xs text-warn">
        Anote agora: a senha não pode ser consultada depois, só redefinida.
      </p>
      <button
        onClick={onFechar}
        className="mt-5 w-full rounded-lg bg-red px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
      >
        Anotei
      </button>
    </Modal>
  );
}
