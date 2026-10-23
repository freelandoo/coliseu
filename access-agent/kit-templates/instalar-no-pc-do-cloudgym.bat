@echo off
setlocal
cd /d "%~dp0"
title Coliseu Agent - Instalacao no computador do CloudGym

echo ==========================================================
echo  Coliseu Agent - instalacao no computador do CloudGym
echo  O botao "Liberar catraca" do Coliseu passa a apertar o
echo  "Liberar Acesso" do CloudGym. O agente liga sozinho quando
echo  o Windows entra, escondido, sem janela.
echo ==========================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Execute como ADMINISTRADOR: botao direito ^> "Executar como administrador".
  pause & exit /b 1
)
if not exist "%~dp0.env" (
  echo [ERRO] Arquivo .env nao encontrado nesta pasta.
  pause & exit /b 1
)

set "NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%NODE%" (
  echo [1/5] Node.js ja instalado.
) else (
  echo [1/5] Instalando Node.js ^(1-2 min^)...
  msiexec /i "%~dp0node-lts.msi" /qn /norestart
)
if not exist "%NODE%" (
  echo [ERRO] Node.js nao encontrado apos a instalacao.
  pause & exit /b 1
)

echo [2/5] Configurando liberacao pelo CloudGym no .env...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~dp0.env'; $l=Get-Content $f | Where-Object { $_ -notmatch '^\s*IDFACE_OPEN_ACTION\s*=' }; $l += 'IDFACE_OPEN_ACTION=cloudgym'; Set-Content -Path $f -Value $l -Encoding ascii"
"%NODE%" --env-file="%~dp0.env" "%~dp0coliseu-agent.cjs" --check
if errorlevel 1 (
  echo [ERRO] Corrija os campos acima no .env e rode de novo.
  pause & exit /b 1
)

echo [3/5] Removendo a versao antiga como servico ^(se existir^)...
"%~dp0nssm.exe" stop ColiseuAgent >nul 2>&1
"%~dp0nssm.exe" remove ColiseuAgent confirm >nul 2>&1
rem reinstalacao: derruba um agente em loop que ja esteja rodando
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*rodar-agente.bat*' -or $_.CommandLine -like '*coliseu-agent.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo [4/5] Colocando na inicializacao do Windows...
set "STARTUP=%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp"
> "%STARTUP%\Coliseu Agent.vbs" echo CreateObject("WScript.Shell").Run "wscript.exe ""%~dp0iniciar-oculto.vbs""", 0, False
if not exist "%STARTUP%\Coliseu Agent.vbs" (
  echo [ERRO] Nao consegui gravar na pasta de inicializacao.
  pause & exit /b 1
)

echo [5/5] Iniciando agora...
if not exist "%~dp0logs" mkdir "%~dp0logs"
rem explorer abre como o usuario normal (sem administrador), igual ao boot
explorer.exe "%~dp0iniciar-oculto.vbs"
timeout /t 8 /nobreak >nul
echo.
echo ----- ultimas linhas do log -----
powershell -NoProfile -Command "Get-Content '%~dp0logs\agent.log' -Tail 8" 2>nul
echo ---------------------------------
echo.
echo Pronto. Deixe o CloudGym aberto. O botao "Liberar catraca" do Coliseu
echo vai apertar o "Liberar Acesso" do CloudGym.
echo IMPORTANTE: desinstale o agente do OUTRO computador (uninstall.bat), para
echo nao ficarem dois agentes na mesma catraca.
pause
