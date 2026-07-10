"use client";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";

const btnCls =
  "rounded-lg bg-red px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest " +
  "text-white transition-colors hover:bg-red-bright disabled:opacity-60";

const selectCls =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "outline-none transition-colors focus:border-red/60";

export type DeviceOpcao = { id: string; name: string };

export function AgentKitCard({
  kitDisponivel,
  tokenConfigurado,
  devices,
}: {
  kitDisponivel: boolean;
  tokenConfigurado: boolean;
  devices: DeviceOpcao[];
}) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");

  const pronto = kitDisponivel && tokenConfigurado && Boolean(deviceId);

  async function baixar() {
    setErro("");
    setBaixando(true);
    const r = await fetch(`/api/settings/agent-kit?deviceId=${encodeURIComponent(deviceId)}`);
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(d?.erro ?? "Falha ao gerar o download");
      setBaixando(false);
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coliseu-agent-kit.zip";
    a.click();
    URL.revokeObjectURL(url);
    setBaixando(false);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Agente da recepção
        </h3>
        {pronto ? <Badge tone="ok">Pronto para baixar</Badge> : <Badge>Pendências</Badge>}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Programa que roda no computador da recepção e conecta a catraca (iDFace) ao
        CRM. O download já vem com o endereço deste servidor, o token do agente e a
        catraca configurados — na academia só falta preencher o IP e a senha do
        iDFace no arquivo <code className="font-mono text-xs">.env</code> e seguir o{" "}
        <code className="font-mono text-xs">INSTALL.md</code>.
      </p>

      {!kitDisponivel && (
        <p className="mt-3 text-xs text-warn">
          O kit ainda não foi gerado neste servidor — rode{" "}
          <code className="font-mono">npm run make-kit</code> e faça o deploy de novo.
        </p>
      )}
      {!tokenConfigurado && (
        <p className="mt-3 text-xs text-warn">
          A variável <code className="font-mono">AGENT_TOKEN</code> não está configurada
          no servidor — sem ela o agente não consegue autenticar.
        </p>
      )}
      {devices.length === 0 && (
        <p className="mt-3 text-xs text-warn">
          Nenhuma catraca cadastrada — crie o dispositivo no painel de Acesso antes de baixar.
        </p>
      )}

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className={selectCls}
            aria-label="Catraca"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={baixar} disabled={!pronto || baixando} className={btnCls}>
          {baixando ? "Preparando…" : "Download do kit"}
        </button>
      </div>
    </Card>
  );
}
