"use client";

import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { Modal, TituloModal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { classeBotao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo, classeRotulo } from "@/components/ui/Campo";

export type Papel = "ADMIN" | "RECEPCAO" | "TECNICO";

export interface AcessoDaPessoa {
  id: string;
  login: string;
  role: Papel;
  ativo: boolean;
  senhaProvisoria: boolean;
}

const PAPEL_LABEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  RECEPCAO: "Colaborador",
  TECNICO: "Técnico",
};

const PAPEIS = Object.entries(PAPEL_LABEL) as [Papel, string][];

function senhaSugerida(): string {
  return `coliseu${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Transforma um cadastro da academia em colaborador do sistema, e vice-versa.
 * O vínculo é 1:1 com a pessoa, então o nome de quem atendeu/matriculou aponta
 * para o mesmo cadastro que aparece na lista de matriculados.
 */
export function AcessoDoCadastro({
  personId,
  nome,
  acessoInicial,
}: {
  personId: string;
  nome: string;
  acessoInicial?: AcessoDaPessoa;
}) {
  const [acesso, setAcesso] = useState<AcessoDaPessoa | undefined>(acessoInicial);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [credencial, setCredencial] = useState<{ login: string; senha: string } | null>(null);

  async function patch(body: Record<string, unknown>) {
    if (!acesso) return;
    setErro("");
    const r = await fetch(`/api/colaboradores/${acesso.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d?.erro ?? "Não foi possível atualizar.");
      return;
    }
    setAcesso(d.colaborador);
  }

  async function resetar() {
    const senha = senhaSugerida();
    await patch({ senha });
    if (acesso) setCredencial({ login: acesso.login, senha });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold text-faint">
          Acesso ao sistema
        </h3>
        {acesso && <Badge tone={acesso.ativo ? "ok" : "neutral"}>{PAPEL_LABEL[acesso.role]}</Badge>}
      </div>

      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

      {!acesso ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Esta pessoa ainda não entra no sistema. Crie um acesso para ela atender e matricular.
          </p>
          <button type="button"
            onClick={() => setCriando(true)}
            className={cn(classeBotao({ variante: "contorno", bloco: true }), "mt-4")}
          >
            Dar acesso ao sistema
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            login: <span className="text-ink">{acesso.login}</span>
          </p>
          {acesso.senhaProvisoria && acesso.ativo && (
            <p className="mt-1 text-xs text-warn">Ainda não trocou a senha provisória.</p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <select
              value={acesso.role}
              onChange={(e) => patch({ role: e.target.value })}
              className="w-full rounded-lg border border-control bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            >
              {PAPEIS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button"
                onClick={resetar}
                className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-faint transition-colors hover:text-ink"
              >
                Nova senha
              </button>
              <button type="button"
                onClick={() => patch({ ativo: !acesso.ativo })}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                  acesso.ativo
                    ? "border-border text-faint hover:border-danger/ hover:text-danger"
                    : "border-ok/40 text-ok hover:bg-ok/10",
                )}
              >
                {acesso.ativo ? "Desativar" : "Reativar"}
              </button>
            </div>
          </div>
        </>
      )}

      {criando && (
        <ModalNovoAcesso
          personId={personId}
          nome={nome}
          onFechar={() => setCriando(false)}
          onCriado={(a, senha) => {
            setAcesso(a);
            setCriando(false);
            setCredencial({ login: a.login, senha });
          }}
        />
      )}

      {credencial && (
        <Modal onFechar={() => setCredencial(null)} className="text-center">
          <TituloModal>
            Acesso de {nome}
          </TituloModal>
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-left text-sm">
            <p className="flex justify-between py-1">
              <span className="text-faint">Login</span>
              <span className="font-medium text-ink">{credencial.login}</span>
            </p>
            <p className="flex justify-between py-1">
              <span className="text-faint">Senha</span>
              <span className="font-medium text-ink">{credencial.senha}</span>
            </p>
          </div>
          <p className="mt-3 text-xs text-warn">
            Anote agora: a senha não pode ser consultada depois, só redefinida. A pessoa troca no
            primeiro acesso.
          </p>
          <button type="button"
            onClick={() => setCredencial(null)}
            className={cn(classeBotao({ variante: "primario", tamanho: "lg", bloco: true }), "mt-5")}
          >
            Anotei
          </button>
        </Modal>
      )}
    </Card>
  );
}

function ModalNovoAcesso({
  personId,
  nome,
  onFechar,
  onCriado,
}: {
  personId: string;
  nome: string;
  onFechar: () => void;
  onCriado: (a: AcessoDaPessoa, senha: string) => void;
}) {
  const [role, setRole] = useState<Papel>("RECEPCAO");
  const [senha, setSenha] = useState(senhaSugerida());
  const [login, setLogin] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    setSalvando(true);
    const r = await fetch("/api/colaboradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, login: login || undefined, senha, role, personId }),
    });
    const d = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) {
      setErro(d?.erro ?? "Não foi possível criar o acesso.");
      return;
    }
    onCriado(d.colaborador, senha);
  }

  const cls = classeCampo;

  return (
    <Modal onFechar={onFechar}>
      <TituloModal>
        Dar acesso a {nome}
      </TituloModal>
      <p className="mt-0.5 text-xs text-faint">
        A pessoa passa a entrar no sistema com login e senha. A senha é provisória.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <label className="block">
          <span className={classeRotulo}>Login</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="deixe vazio para gerar a partir do nome"
            className={cls}
          />
        </label>
        <label className="block">
          <span className={classeRotulo}>Senha provisória *</span>
          <input value={senha} onChange={(e) => setSenha(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={classeRotulo}>Papel</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Papel)} className={cls}>
            {PAPEIS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}

      <div className="mt-5 flex gap-3">
        <button type="button"
          onClick={salvar}
          disabled={salvando || senha.length < 8}
          className={cn(
            "flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
            salvando || senha.length < 8
              ? "cursor-not-allowed bg-surface-2 text-faint"
              : "bg-red text-white hover:bg-red-bright",
          )}
        >
          {salvando ? "Criando…" : "Criar acesso"}
        </button>
        <button type="button"
          onClick={onFechar}
          className={classeBotao({ variante: "secundario", tamanho: "lg" })}
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
