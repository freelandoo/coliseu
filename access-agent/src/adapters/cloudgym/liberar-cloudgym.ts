import { execFile } from "node:child_process";

/**
 * Ponte temporária até o corte do CloudGym: aperta o botão "Liberar Acesso" da
 * janela do CloudGym no PC onde ele roda. Em campo (23/10/2026) o mesmo
 * remote_user_authorization enviado por nós chega byte a byte igual ao do
 * CloudGym e não gira a catraca; o clique no programa dele gira.
 *
 * Precisa rodar na sessão do usuário logado (janela visível para o Windows) —
 * por isso, neste modo, o agente é instalado como tarefa de logon, não serviço.
 */
export type ModoCliqueCloudGym = "clique" | "post";

export interface LiberarCloudGymOptions {
  modo?: ModoCliqueCloudGym;
  /** título exato da janela do CloudGym */
  titulo?: string;
  /** posição do botão a partir do canto inferior direito da área da janela */
  daDireita?: number;
  deBaixo?: number;
}

/** Script PowerShell (sem acentos: vai codificado em -EncodedCommand). Sai com 2 se não achar a janela. */
export function scriptCliqueCloudGym(opts: LiberarCloudGymOptions = {}): string {
  const modo = opts.modo ?? "clique";
  const titulo = (opts.titulo ?? "Cloud Gym - Access Control").replace(/'/g, "''");
  const daDireita = opts.daDireita ?? 70;
  const deBaixo = opts.deBaixo ?? 9;
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class U32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, IntPtr e);
}
"@
$h = [U32]::FindWindow([NullString]::Value, '${titulo}')
if ($h -eq [IntPtr]::Zero) { [Console]::Error.WriteLine('janela do CloudGym nao encontrada'); exit 2 }
$r = New-Object U32+RECT
[void][U32]::GetClientRect($h, [ref]$r)
$x = $r.R - ${daDireita}
$y = $r.B - ${deBaixo}
if ('${modo}' -eq 'post') {
  $lp = [IntPtr](($y -shl 16) -bor ($x -band 0xFFFF))
  [void][U32]::PostMessage($h, 0x0200, [IntPtr]0, $lp)
  [void][U32]::PostMessage($h, 0x0201, [IntPtr]1, $lp)
  Start-Sleep -Milliseconds 80
  [void][U32]::PostMessage($h, 0x0202, [IntPtr]0, $lp)
} else {
  $anterior = [U32]::GetForegroundWindow()
  if ([U32]::IsIconic($h)) { [void][U32]::ShowWindow($h, 9) }
  # ALT solto antes: o Windows so deixa trazer janela para frente depois de uma tecla
  [U32]::keybd_event(0x12, 0, 0, [IntPtr]::Zero); [U32]::keybd_event(0x12, 0, 2, [IntPtr]::Zero)
  [void][U32]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 250
  $p = New-Object U32+POINT; $p.X = $x; $p.Y = $y
  [void][U32]::ClientToScreen($h, [ref]$p)
  $antes = New-Object U32+POINT; [void][U32]::GetCursorPos([ref]$antes)
  [void][U32]::SetCursorPos($p.X, $p.Y)
  [U32]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [U32]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
  [void][U32]::SetCursorPos($antes.X, $antes.Y)
  if ($anterior -ne [IntPtr]::Zero -and $anterior -ne $h) { [void][U32]::SetForegroundWindow($anterior) }
}
exit 0
`;
}

/** Codifica para powershell -EncodedCommand (UTF-16LE em base64). */
export function encodarComando(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function liberarPeloCloudGym(opts: LiberarCloudGymOptions = {}): Promise<void> {
  const encoded = encodarComando(scriptCliqueCloudGym(opts));
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { timeout: 15_000, windowsHide: true },
      (erro, _stdout, stderr) => {
        if (!erro) return resolve();
        // stderr do PowerShell pode vir em CLIXML (progresso); fica só a linha legível
        const motivo = String(stderr || "")
          .split(/\r?\n/)
          .filter((l) => l.trim() && !l.startsWith("#< CLIXML") && !l.startsWith("<Objs"))
          .join(" ")
          .trim() || erro.message;
        reject(new Error(`liberar pelo CloudGym falhou: ${motivo}`));
      },
    );
  });
}
