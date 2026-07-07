@echo off
setlocal
cd /d "%~dp0"
title Coliseu Agent - Atualizacao

rem Uso: cole a versao nova como coliseu-agent.new.cjs nesta pasta e rode este script.
net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Execute como ADMINISTRADOR.
  pause & exit /b 1
)
if not exist "%~dp0coliseu-agent.new.cjs" (
  echo [ERRO] Nao achei coliseu-agent.new.cjs nesta pasta.
  echo Copie a versao nova com esse nome e rode de novo.
  pause & exit /b 1
)

echo [1/3] Parando servico...
"%~dp0nssm.exe" stop ColiseuAgent
timeout /t 3 /nobreak >nul

echo [2/3] Trocando o programa...
if exist "%~dp0coliseu-agent.bak.cjs" del "%~dp0coliseu-agent.bak.cjs"
ren "%~dp0coliseu-agent.cjs" coliseu-agent.bak.cjs
ren "%~dp0coliseu-agent.new.cjs" coliseu-agent.cjs

echo [3/3] Iniciando servico...
"%~dp0nssm.exe" start ColiseuAgent
timeout /t 6 /nobreak >nul
powershell -NoProfile -Command "Get-Content '%~dp0logs\agent.log' -Tail 15" 2>nul
echo.
echo Atualizado. Se algo deu errado, o anterior esta em coliseu-agent.bak.cjs.
pause
