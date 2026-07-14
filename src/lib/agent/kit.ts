import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

/** Diretório do kit gerado por `npm run make-kit` (access-agent/dist). */
export function kitDir(): string {
  return path.join(process.cwd(), "access-agent", "dist", "coliseu-agent-kit");
}

export function kitDisponivel(): boolean {
  return existsSync(path.join(kitDir(), "coliseu-agent.cjs"));
}

export type KitInfo = { version?: string; commit?: string | null; builtAt: string };

/**
 * Versão/data do kit gerado — lê o kit-version.json gravado pelo make-kit.
 * Kits antigos (sem o json): usa o mtime do bundle como data do build.
 */
export function kitInfo(): KitInfo | null {
  if (!kitDisponivel()) return null;
  try {
    const raw = readFileSync(path.join(kitDir(), "kit-version.json"), "utf8");
    const info = JSON.parse(raw) as KitInfo;
    if (info.builtAt) return info;
  } catch { /* sem json: cai no mtime */ }
  try {
    return { builtAt: statSync(path.join(kitDir(), "coliseu-agent.cjs")).mtime.toISOString() };
  } catch {
    return null;
  }
}

export type ValoresEnvKit = {
  backendUrl: string;
  agentToken: string;
  deviceId: string;
};

/**
 * Preenche BACKEND_URL/AGENT_TOKEN/DEVICE_ID no .env do kit, preservando
 * comentários, as demais chaves e as quebras de linha (CRLF p/ Bloco de Notas).
 */
export function preencherEnvKit(template: string, valores: ValoresEnvKit): string {
  const mapa: Record<string, string> = {
    BACKEND_URL: valores.backendUrl,
    AGENT_TOKEN: valores.agentToken,
    DEVICE_ID: valores.deviceId,
  };
  // `.`/`$` em multiline param antes do \r — o CRLF da linha fica intacto.
  return template.replace(
    /^(BACKEND_URL|AGENT_TOKEN|DEVICE_ID)=.*$/gm,
    (_linha, chave: string) => `${chave}=${mapa[chave]}`,
  );
}

/**
 * Monta o ZIP do kit da recepção com o .env já configurado.
 * Lê os arquivos de access-agent/dist/coliseu-agent-kit (gerado pelo make-kit).
 */
export async function montarZipKit(valores: ValoresEnvKit): Promise<Buffer> {
  const dir = kitDir();
  const zip = new JSZip();
  const raiz = zip.folder("coliseu-agent-kit")!;

  for (const nome of readdirSync(dir)) {
    const arquivo = path.join(dir, nome);
    if (nome === ".env") {
      raiz.file(nome, preencherEnvKit(readFileSync(arquivo, "utf8"), valores));
    } else {
      raiz.file(nome, readFileSync(arquivo));
    }
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
