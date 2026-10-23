' Coliseu Agent - inicia o agente escondido (sem janela) na sessao do usuario.
' Fica na Inicializacao do Windows; nao abre um segundo agente se ja houver um rodando.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
Set wmi = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='cmd.exe' AND CommandLine LIKE '%rodar-agente.bat%'")
If procs.Count > 0 Then WScript.Quit 0
CreateObject("WScript.Shell").Run "cmd /c """ & pasta & "\rodar-agente.bat""", 0, False
