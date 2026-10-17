"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { situacaoDe } from "@/components/clientes/ClientesView";
import { AcessoDoCadastro, type AcessoDaPessoa } from "@/components/clientes/AcessoDoCadastro";
import { PagamentosDoAluno } from "@/components/clientes/PagamentosDoAluno";
import { CatracaDoAluno } from "@/components/clientes/CatracaDoAluno";
import { cn } from "@/lib/cn";
import { formatBRL, formatData } from "@/lib/mock-data";
import {
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type LeadEstagio,
  type Pessoa,
  type Plano,
} from "@/lib/types";
import { classeBotao } from "@/components/ui/Botao";
import { classeCampo, classeRotulo } from "@/components/ui/Campo";
import { LinkRetornoFicha } from "@/components/clientes/LinkRetornoFicha";
import type { OrigemFicha } from "@/lib/navegacao";

const ESTAGIOS: LeadEstagio[] = ["novo", "qualificado", "interesse", "perdido"];

export function FichaCliente({
  pessoa,
  plano,
  podeGerirAcesso = false,
  acesso,
  retorno = { href: "/matriculados", rotulo: "Alunos", origem: "alunos" },
}: {
  pessoa: Pessoa;
  plano?: Plano;
  /** Só ADMIN cria/edita acesso ao sistema. */
  podeGerirAcesso?: boolean;
  /** Acesso já existente desta pessoa, quando ela é colaboradora. */
  acesso?: AcessoDaPessoa;
  /** Para onde o "voltar" leva — validado no servidor (`retornoDaFicha`). */
  retorno?: { href: string; rotulo: string; origem: OrigemFicha };
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [form, setForm] = useState({
    nome: pessoa.nome,
    telefone: pessoa.telefone ?? "",
    email: pessoa.email ?? "",
    cpf: pessoa.cpf ?? "",
    rg: pessoa.rg ?? "",
    vendedor: pessoa.vendedor ?? "",
    dataNascimento: pessoa.dataNascimento ?? "",
    cep: pessoa.endereco?.cep ?? "",
    estado: pessoa.endereco?.estado ?? "",
    cidade: pessoa.endereco?.cidade ?? "",
    rua: pessoa.endereco?.rua ?? "",
    numero: pessoa.endereco?.numero ?? "",
  });

  const s = situacaoDe(pessoa);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/pessoas/${pessoa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function excluir() {
    if (!confirm(`Excluir ${pessoa.nome} definitivamente? Esta ação não pode ser desfeita.`))
      return;
    setExcluindo(true);
    await fetch(`/api/pessoas/${pessoa.id}`, { method: "DELETE" });
    router.push("/matriculados");
    router.refresh();
  }

  async function salvar() {
    setSalvando(true);
    await patch({
      nome: form.nome,
      telefone: form.telefone,
      email: form.email,
      cpf: form.cpf,
      rg: form.rg,
      vendedor: form.vendedor,
      dataNascimento: form.dataNascimento,
      endereco: {
        cep: form.cep,
        estado: form.estado,
        cidade: form.cidade,
        rua: form.rua,
        numero: form.numero,
      },
    });
    setSalvando(false);
    setEditando(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <LinkRetornoFicha {...retorno} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* dados pessoais */}
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-ink">
              Dados pessoais
            </h2>
            {editando ? (
              <div className="flex gap-2">
                <button type="button"
                  onClick={salvar}
                  disabled={salvando}
                  className={classeBotao({ variante: "primario", tamanho: "sm" })}
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                <button type="button"
                  onClick={() => setEditando(false)}
                  className={classeBotao({ variante: "secundario", tamanho: "sm" })}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button type="button"
                onClick={() => setEditando(true)}
                className={classeBotao({ variante: "secundario", tamanho: "sm" })}
              >
                Editar
              </button>
            )}
          </div>

          {editando ? (
            <div className="flex flex-col gap-3">
              <Campo label="Nome" value={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Celular" value={form.telefone} onChange={(v) => setForm((f) => ({ ...f, telefone: v }))} />
                <Campo label="CPF" value={form.cpf} onChange={(v) => setForm((f) => ({ ...f, cpf: v }))} />
                <Campo label="RG" value={form.rg} onChange={(v) => setForm((f) => ({ ...f, rg: v }))} />
                <Campo label="Nascimento" type="date" value={form.dataNascimento} onChange={(v) => setForm((f) => ({ ...f, dataNascimento: v }))} />
              </div>
              <Campo label="E-mail" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Campo label="Vendedor / consultor" value={form.vendedor} onChange={(v) => setForm((f) => ({ ...f, vendedor: v }))} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="CEP" value={form.cep} onChange={(v) => setForm((f) => ({ ...f, cep: v }))} />
                <Campo label="Estado" value={form.estado} onChange={(v) => setForm((f) => ({ ...f, estado: v }))} />
                <Campo label="Cidade" value={form.cidade} onChange={(v) => setForm((f) => ({ ...f, cidade: v }))} />
                <Campo label="Número" value={form.numero} onChange={(v) => setForm((f) => ({ ...f, numero: v }))} />
              </div>
              <Campo label="Rua" value={form.rua} onChange={(v) => setForm((f) => ({ ...f, rua: v }))} />
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Info rotulo="Telefone" valor={pessoa.telefone} />
              <Info rotulo="E-mail" valor={pessoa.email} />
              <Info rotulo="CPF" valor={pessoa.cpf} />
              <Info rotulo="RG" valor={pessoa.rg} />
              <Info rotulo="Nascimento" valor={pessoa.dataNascimento ? formatData(pessoa.dataNascimento) : undefined} />
              <Info rotulo="Vendedor" valor={pessoa.vendedor} />
              <Info
                rotulo="Endereço"
                valor={enderecoResumo(pessoa)}
                span
              />
            </dl>
          )}
        </Card>

        {/* situação + ações */}
        <div className="flex flex-col gap-4">
          <Card className="p-6">
            <p className="text-xs font-medium text-faint">
              {pessoa.codigo}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
              {pessoa.nome}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={s.tone}>{s.rotulo}</Badge>
              <Badge>{ORIGEM_LABEL[pessoa.origem]}</Badge>
            </div>

            {pessoa.fase === "lead" ? (
              <div className="mt-5">
                <label className="mb-1 block text-xs font-medium text-muted">
                  Estágio do lead
                </label>
                <select
                  value={pessoa.estagio ?? "novo"}
                  onChange={(e) => patch({ estagio: e.target.value })}
                  className={classeCampo}
                >
                  {ESTAGIOS.map((e) => (
                    <option key={e} value={e}>
                      {LEAD_ESTAGIO_LABEL[e]}
                    </option>
                  ))}
                </select>
                {/* Leva só o id: a tela de matrícula abre a revisão desta pessoa
                    se ela estiver entre os candidatos — nada é gerado no caminho. */}
                <Link
                  href={`/matriculados/renovar?pessoa=${encodeURIComponent(pessoa.id)}`}
                  className={cn(classeBotao({ variante: "primario" }), "mt-3")}
                >
                  Matricular →
                </Link>
              </div>
            ) : (
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Info rotulo="Plano" valor={plano?.nome} />
                <Info rotulo="Valor" valor={plano ? `${formatBRL(plano.valorMensal)}/mês` : undefined} />
                <Info rotulo="Matriculado" valor={pessoa.matriculadoEm ? formatData(pessoa.matriculadoEm) : undefined} />
                <Info rotulo="Vence" valor={pessoa.vencimentoPlano ? formatData(pessoa.vencimentoPlano) : undefined} />
                <Info rotulo="Matriculado por" valor={pessoa.matriculadoPor} span />
              </dl>
            )}
          </Card>

          {podeGerirAcesso && (
            <AcessoDoCadastro
              personId={pessoa.id}
              nome={pessoa.nome}
              acessoInicial={acesso}
            />
          )}
        </div>
      </div>

      {pessoa.fase !== "lead" && <CatracaDoAluno personId={pessoa.id} />}

      {pessoa.fase !== "lead" && (
        <PagamentosDoAluno personId={pessoa.id} podeGerir={podeGerirAcesso} />
      )}

      <div className="flex justify-end">
        <button type="button"
          onClick={excluir}
          disabled={excluindo}
          className={classeBotao({ variante: "perigo-contorno" })}
        >
          {excluindo ? "Excluindo…" : "Excluir cliente"}
        </button>
      </div>
    </div>
  );
}

function enderecoResumo(p: Pessoa): string | undefined {
  const e = p.endereco;
  if (!e) return undefined;
  const partes = [
    [e.rua, e.numero].filter(Boolean).join(", "),
    e.cidade,
    e.estado,
    e.cep,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : undefined;
}

function Info({
  rotulo,
  valor,
  span,
}: {
  rotulo: string;
  valor?: string;
  span?: boolean;
}) {
  return (
    <div className={cn(span && "col-span-2")}>
      <dt className="text-xs text-faint">{rotulo}</dt>
      <dd className="mt-0.5 text-ink">{valor || "—"}</dd>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className={classeRotulo}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={classeCampo}
      />
    </label>
  );
}
