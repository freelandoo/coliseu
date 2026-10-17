"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { classeBotao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { situacaoDe } from "@/components/clientes/ClientesView";
import { formatData } from "@/lib/mock-data";
import { ORIGEM_LABEL, type Pessoa, type Plano } from "@/lib/types";
import { cn } from "@/lib/cn";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; pessoa: Pessoa; plano: Plano | null };

function ehPessoa(v: unknown): v is Pessoa {
  return typeof v === "object" && v !== null && typeof (v as Pessoa).id === "string";
}

/**
 * O mínimo da pessoa para atender sem sair da conversa: quem é, como falar,
 * em que ponto está (estágio do lead ou situação do aluno), plano e vencimento,
 * e a próxima ação que já existe no sistema.
 *
 * Só leitura, pelas mesmas rotas que a ficha usa (sessão exigida). Não mostra
 * documento nem dado de pagamento, e não repete formulário: editar é na ficha
 * completa, que volta para esta conversa.
 */
export function ContextoPessoa({
  personId,
  conversaId,
  className,
}: {
  personId: string;
  conversaId: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pessoas/${encodeURIComponent(personId)}`, { cache: "no-store" });
        const d: unknown = await r.json().catch(() => null);
        if (!ativo) return;
        if (!r.ok || !ehPessoa(d)) {
          setEstado({ tipo: "erro", mensagem: r.status === 404 ? "Cadastro não encontrado." : "Não foi possível carregar o cadastro." });
          return;
        }
        let plano: Plano | null = null;
        if (d.planoId) {
          const rp = await fetch("/api/planos", { cache: "no-store" }).catch(() => null);
          const planos: unknown = rp?.ok ? await rp.json().catch(() => null) : null;
          if (Array.isArray(planos)) plano = (planos as Plano[]).find((p) => p.id === d.planoId) ?? null;
        }
        if (ativo) setEstado({ tipo: "pronto", pessoa: d, plano });
      } catch {
        if (ativo) setEstado({ tipo: "erro", mensagem: "Sem conexão para carregar o cadastro." });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [personId, tentativa]);

  const ficha = `/matriculados/${encodeURIComponent(personId)}?de=atendimento&c=${encodeURIComponent(conversaId)}`;

  if (estado.tipo === "carregando") {
    return <p className={cn("text-sm text-faint", className)}>Carregando cadastro…</p>;
  }
  if (estado.tipo === "erro") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <MensagemErro>{estado.mensagem}</MensagemErro>
        <button
          type="button"
          onClick={() => {
            setEstado({ tipo: "carregando" });
            setTentativa((n) => n + 1);
          }}
          className={classeBotao({ variante: "secundario", tamanho: "sm" })}
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { pessoa, plano } = estado;
  const s = situacaoDe(pessoa);
  const ehLead = pessoa.fase === "lead";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div>
        <p className="text-xs text-faint">{pessoa.codigo}</p>
        <p className="mt-0.5 text-base font-semibold text-ink">{pessoa.nome}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={s.tone}>{s.rotulo}</Badge>
          <Badge>{ORIGEM_LABEL[pessoa.origem]}</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-y-2.5 text-sm">
        <Item rotulo="Telefone" valor={pessoa.telefone} />
        <Item rotulo="E-mail" valor={pessoa.email} />
        {!ehLead && (
          <>
            <Item rotulo="Plano" valor={plano?.nome ?? (pessoa.planoId ? "Plano não localizado" : undefined)} />
            <Item
              rotulo="Vencimento do plano"
              valor={pessoa.vencimentoPlano ? formatData(pessoa.vencimentoPlano) : undefined}
            />
          </>
        )}
        {ehLead && pessoa.motivoPerdido && <Item rotulo="Motivo da perda" valor={pessoa.motivoPerdido} />}
      </dl>

      <div className="flex flex-col gap-2">
        {ehLead && (
          // Só abre a revisão: nada é cobrado até o botão de confirmação lá.
          <Link
            href={`/matriculados/renovar?pessoa=${encodeURIComponent(pessoa.id)}`}
            className={classeBotao({ variante: "primario", tamanho: "sm", bloco: true })}
          >
            Iniciar matrícula
          </Link>
        )}
        <Link href={ficha} className={classeBotao({ variante: "secundario", tamanho: "sm", bloco: true })}>
          Abrir ficha completa
        </Link>
      </div>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor?: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-ink">{valor || "—"}</dd>
    </div>
  );
}
