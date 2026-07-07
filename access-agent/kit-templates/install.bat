@echo off
setlocal
cd /d "%~dp0"
title Coliseu Agent - Instalacao

echo ============================================
echo  Coliseu Agent - Instalacao (servico Windows)
echo ============================================
echo.

rem -- precisa de administrador (servico + msiexec)
net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Execute como ADMINISTRADOR: botao direito ^> "Executar como administrador".
  pause & exit /b 1
)

if not exist "%~dp0.env" (
  echo [ERRO] Arquivo .env nao encontrado nesta pasta. Preencha o .env e rode de novo.
  pause & exit /b 1
)

set "NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%NODE%" (
  echo [1/4] Node.js ja instalado.
) else (
  echo [1/4] Instalando Node.js LTS ^(1-2 min^)...
  msiexec /i "%~dp0node-lts.msi" /qn /norestart
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar o Node.js. Instale manualmente o node-lts.msi e rode de novo.
    pause & exit /b 1
  )
)
if not exist "%NODE%" (
  echo [ERRO] Node.js nao encontrado em "%NODE%" apos a instalacao.
  pause & exit /b 1
)

echo [2/4] Validando configuracao do .env...
"%NODE%" --env-file="%~dp0.env" "%~dp0coliseu-agent.cjs" --check
if errorlevel 1 (
  echo [ERRO] Corrija os campos acima no .env e rode install.bat de novo.
  pause & exit /b 1
)

echo [3/4] Registrando servico ColiseuAgent...
if not exist "%~dp0logs" mkdir "%~dp0logs"
"%~dp0nssm.exe" stop ColiseuAgent >nul 2>&1
"%~dp0nssm.exe" remove ColiseuAgent confirm >nul 2>&1
"%~dp0nssm.exe" install ColiseuAgent "%NODE%" --env-file=.env coliseu-agent.cjs
if errorlevel 1 (
  echo [ERRO] Falha ao registrar o servico.
  pause & exit /b 1
)
"%~dp0nssm.exe" set ColiseuAgent AppDirectory "%~dp0."
"%~dp0nssm.exe" set ColiseuAgent AppStdout "%~dp0logs\agent.log"
"%~dp0nssm.exe" set ColiseuAgent AppStderr "%~dp0logs\agent.log"
"%~dp0nssm.exe" set ColiseuAgent AppRotateFiles 1
"%~dp0nssm.exe" set ColiseuAgent AppRotateOnline 1
"%~dp0nssm.exe" set ColiseuAgent AppRotateBytes 1048576
"%~dp0nssm.exe" set ColiseuAgent AppRestartDelay 10000
"%~dp0nssm.exe" set ColiseuAgent Start SERVICE_AUTO_START
"%~dp0nssm.exe" set ColiseuAgent Description "Conecta a catraca Control iD ao CRM Coliseu"

echo [4/4] Iniciando servico...
"%~dp0nssm.exe" start ColiseuAgent
timeout /t 6 /nobreak >nul
echo.
echo ----- primeiras linhas do log -----
if exist "%~dp0logs\agent.log" type "%~dp0logs\agent.log"
echo -----------------------------------
echo.
echo Instalado. Agora abra o CRM (dashboard /acesso) e confira se a catraca esta ONLINE.
echo Se aparecer DEVICE FALHOU no log, confira o IDFACE_HOST no .env.
pause
