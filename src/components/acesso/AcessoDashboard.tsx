"use client";
import { Card, Badge, Stat } from "@/components/ui/primitives";
import { SimuladorAcesso, type AlunoOpcao } from "@/components/acesso/SimuladorAcesso";
import { CadastroFace } from "@/components/acesso/CadastroFace";
import { NovaCatraca } from "@/components/acesso/NovaCatraca";
import { PararAgente } from "@/components/acesso/PararAgente";

interface Dados {
  devices: { id: string; name: string; status: string; firmware: string; lastHeartbeatAt: string | null }[];
  pendentesBio: number; pendentesSync: number;
  comandos: { id: string; type: string; status: string; createdAt: string }[];
  eventos: { id: string; nome: string; decision: string; reason: string; deviceTime: string; physicallyPassed: boolean }[];
  alunos: (AlunoOpcao & { temFace: boolean })[];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export function AcessoDashboard({ dados, podeCriar }: { dados: Dados; podeCriar: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Catracas" value={dados.devices.length} hint="dispositivos" />
        <Stat label="Online" value={dados.devices.filter((d) => d.status === "ONLINE").length} tone="ok" />
        <Stat label="Pend. biometria" value={dados.pendentesBio} tone="warn" hint="alunos sem face" />
        <Stat label="Pend. sync" value={dados.pendentesSync} tone="warn" hint="mapeamentos" />
      </section>

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">Catracas</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {dados.devices.map((d) => (
            <Card key={d.id} className="flex items-center justify-between p-5">
              <div>
                <p className="font-medium text-ink">{d.name}</p>
                <p className="text-xs text-faint">firmware {d.firmware} · heartbeat {fmt(d.lastHeartbeatAt)}</p>
                <p className="mt-1 font-mono text-[11px] text-faint" title="DEVICE_ID do .env do agente">
                  {d.id}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={d.status === "ONLINE" ? "ok" : d.status === "MAINTENANCE" ? "warn" : "red"}>{d.status}</Badge>
                {podeCriar && d.status === "ONLINE" && <PararAgente deviceId={d.id} />}
              </div>
            </Card>
          ))}
          {podeCriar && <NovaCatraca />}
        </div>
      </section>

      <CadastroFace alunos={dados.alunos} devices={dados.devices} />

      <SimuladorAcesso alunos={dados.alunos} />

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">Comandos pendentes</h2>
        <Card className="overflow-hidden">
          {dados.comandos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-faint">Nenhum comando pendente.</p>
          ) : (
            <div className="divide-y divide-border">
              {dados.comandos.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-ink">{c.type}</span>
                  <Badge tone={c.status === "DEAD_LETTER" ? "red" : "neutral"}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">Acessos recentes</h2>
        <Card className="overflow-hidden">
          {dados.eventos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-faint">Nenhum acesso registrado ainda.</p>
          ) : (
            <div className="divide-y divide-border">
              {dados.eventos.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-ink">{e.nome}</p>
                    <p className="text-xs text-faint">{fmt(e.deviceTime)} · {e.reason}</p>
                  </div>
                  <Badge tone={e.decision === "ALLOWED" ? "ok" : "red"}>{e.decision}{e.physicallyPassed ? " ✓" : ""}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
