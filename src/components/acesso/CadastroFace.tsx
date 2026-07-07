"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui/primitives";

export interface AlunoFaceOpcao {
  id: string;
  nome: string;
  temFace: boolean;
}

export interface CatracaOpcao {
  id: string;
  name: string;
  status: string;
}

export function CadastroFace({ alunos, devices }: { alunos: AlunoFaceOpcao[]; devices: CatracaOpcao[] }) {
  const router = useRouter();
  const semFace = alunos.filter((a) => !a.temFace);
  const [personId, setPersonId] = useState(semFace[0]?.id ?? alunos[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState(devices.find((d) => d.status === "ONLINE")?.id ?? devices[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function cadastrar() {
    if (!personId || !deviceId) return;
    setErro("");
    setOkMsg("");
    setEnviando(true);
    try {
      const r = await fetch("/api/acesso/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, deviceId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(d?.erro ?? "Falha ao iniciar o cadastro de face");
        return;
      }
      const nome = alunos.find((a) => a.id === personId)?.nome ?? "aluno";
      setOkMsg(`Captura enviada para a catraca — posicione ${nome} em frente ao leitor facial.`);
      router.refresh(); // atualiza "Comandos pendentes" e o contador de biometria
    } catch {
      setErro("Sem conexão com o servidor");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
        Cadastro de face
      </h2>
      <Card className="p-5">
        <p className="mb-4 text-sm text-muted">
          Envia o comando de captura para a catraca escolhida. Quando o leitor confirmar a
          face, a credencial fica <span className="text-ok">cadastrada</span> e o acesso do
          aluno é reavaliado automaticamente (quem está em dia é liberado na hora).
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-faint">Aluno</span>
            <select
              value={personId}
              onChange={(e) => { setPersonId(e.target.value); setErro(""); setOkMsg(""); }}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
            >
              {alunos.length === 0 && <option value="">Nenhum aluno</option>}
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}{a.temFace ? " — face ok (recadastro)" : " — sem face"}
                </option>
              ))}
            </select>
          </label>

          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-faint">Catraca</span>
            <select
              value={deviceId}
              onChange={(e) => { setDeviceId(e.target.value); setErro(""); setOkMsg(""); }}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-border-strong"
            >
              {devices.length === 0 && <option value="">Nenhuma catraca</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.status !== "ONLINE" ? ` — ${d.status.toLowerCase()}` : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={cadastrar}
            disabled={enviando || !personId || !deviceId}
            className="rounded-lg bg-red px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60"
          >
            {enviando ? "Enviando…" : "Cadastrar face"}
          </button>
        </div>

        {erro && <p className="mt-4 text-xs text-red-bright">{erro}</p>}
        {okMsg && (
          <div className="mt-4 flex items-center gap-2">
            <Badge tone="ok">ENROLL enviado</Badge>
            <p className="text-xs text-muted">{okMsg}</p>
          </div>
        )}
      </Card>
    </section>
  );
}
