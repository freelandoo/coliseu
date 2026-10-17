"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { Botao } from "@/components/ui/Botao";
import { classeCampoEmLinha } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import { formatMeses } from "@/lib/fidelidade";
import { normalizar } from "@/lib/whatsapp/busca";

export interface LinhaAtivo {
  id: string;
  codigo: string;
  nome: string;
  planoNome: string;
  matriculadoEm: string; // já formatada (dd/mm/aaaa)
  meses: number;
  faixa: { rotulo: string; tone: "neutral" | "ok" | "warn" };
}

export interface LinhaCancelado {
  id: string;
  codigo: string;
  nome: string;
  ultimaPresenca: string; // já formatada (dd/mm/aaaa)
  meses: number;
}

/** Nome ou código; as duas listas usam a mesma busca. */
function casa(l: { nome: string; codigo: string }, termo: string): boolean {
  if (!termo) return true;
  return normalizar(l.nome).includes(termo) || normalizar(l.codigo).includes(termo);
}

const hrefFicha = (id: string) => `/matriculados/${id}?de=fidelidade`;

/**
 * Listas da Fidelidade (ativos por tempo de casa, cancelados por tempo desde a
 * saída) com busca local e o nome abrindo a ficha, que volta para cá.
 */
export function FidelidadeListas({ ativos, cancelados }: { ativos: LinhaAtivo[]; cancelados: LinhaCancelado[] }) {
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca);
  const ativosVisiveis = ativos.filter((a) => casa(a, termo));
  const canceladosVisiveis = cancelados.filter((a) => casa(a, termo));
  const vazioBusca = `Ninguém encontrado para “${busca.trim()}”.`;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar aluno por nome ou código"
          placeholder="Buscar por nome ou código…"
          className={cn(classeCampoEmLinha, "w-full max-w-sm")}
        />
        {termo && (
          <Botao variante="discreto" tamanho="sm" onClick={() => setBusca("")}>
            Limpar busca
          </Botao>
        )}
      </div>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold text-muted">
          Ativos — tempo de casa{termo && ` (${ativosVisiveis.length} de ${ativos.length})`}
        </h2>
        <Card className="overflow-hidden">
          {ativosVisiveis.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              {ativos.length === 0 ? "Nenhum aluno ativo." : vazioBusca}
            </p>
          ) : (
            <>
              {/* mobile: cards empilhados, sem scroll horizontal */}
              <ul className="divide-y divide-border sm:hidden">
                {ativosVisiveis.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <NomeFicha id={a.id} nome={a.nome} className="block truncate text-sm" />
                      <p className="text-xs text-muted">
                        {a.planoNome}
                        <span className="ml-2 font-mono text-faint">{a.codigo}</span>
                      </p>
                      <p className="text-xs text-faint">Matrícula atual em {a.matriculadoEm}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <Badge tone={a.faixa.tone}>{a.faixa.rotulo}</Badge>
                      <span className="ml-auto text-sm font-medium text-ink">{formatMeses(a.meses)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* desktop: tabela */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <Th>Código</Th>
                      <Th>Nome</Th>
                      <Th>Plano</Th>
                      <Th>Matrícula atual em</Th>
                      <Th>Tempo de casa</Th>
                      <Th>Fidelidade</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativosVisiveis.map((a) => (
                      <tr key={a.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-3 font-mono text-xs text-faint">{a.codigo}</td>
                        <td className="px-4 py-3">
                          <NomeFicha id={a.id} nome={a.nome} />
                        </td>
                        <td className="px-4 py-3 text-muted">{a.planoNome}</td>
                        <td className="px-4 py-3 text-muted">{a.matriculadoEm}</td>
                        <td className="px-4 py-3 font-medium text-ink">{formatMeses(a.meses)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={a.faixa.tone}>{a.faixa.rotulo}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold text-muted">
          Cancelados — há quanto tempo saíram (estimado)
          {termo && ` (${canceladosVisiveis.length} de ${cancelados.length})`}
        </h2>
        <Card className="overflow-hidden">
          {canceladosVisiveis.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              {cancelados.length === 0 ? "Nenhum matriculado cancelado." : vazioBusca}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border sm:hidden">
                {canceladosVisiveis.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <NomeFicha id={a.id} nome={a.nome} className="block truncate text-sm" />
                      <p className="text-xs text-muted">
                        Último registro {a.ultimaPresenca}
                        <span className="ml-2 font-mono text-faint">{a.codigo}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-red-bright">{formatMeses(a.meses)}</span>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <Th>Código</Th>
                      <Th>Nome</Th>
                      <Th>Último registro de presença</Th>
                      <Th>Saída estimada há</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {canceladosVisiveis.map((a) => (
                      <tr key={a.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-3 font-mono text-xs text-faint">{a.codigo}</td>
                        <td className="px-4 py-3">
                          <NomeFicha id={a.id} nome={a.nome} />
                        </td>
                        <td className="px-4 py-3 text-muted">{a.ultimaPresenca}</td>
                        <td className="px-4 py-3 font-medium text-red-bright">{formatMeses(a.meses)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}

function NomeFicha({ id, nome, className }: { id: string; nome: string; className?: string }) {
  return (
    <Link
      href={hrefFicha(id)}
      className={cn("font-medium text-ink underline-offset-2 hover:text-brand hover:underline", className)}
    >
      {nome}
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-semibold text-muted">{children}</th>;
}
