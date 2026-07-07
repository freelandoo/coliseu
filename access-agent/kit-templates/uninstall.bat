@echo off
setlocal
cd /d "%~dp0"
title Coliseu Agent - Remocao

net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Execute como ADMINISTRADOR.
  pause & exit /b 1
)
echo Parando e removendo o servico ColiseuAgent...
"%~dp0nssm.exe" stop ColiseuAgent >nul 2>&1
"%~dp0nssm.exe" remove ColiseuAgent confirm
echo.
echo Servico removido. Os arquivos da pasta (config, logs) foram mantidos.
pause
