@echo off
setlocal
title Coliseu Agent - Remocao (computador do CloudGym)
net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Execute como ADMINISTRADOR.
  pause & exit /b 1
)
del "%ProgramData%\Microsoft\Windows\Start Menu\Programs\StartUp\Coliseu Agent.vbs" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*rodar-agente.bat*' -or $_.CommandLine -like '*coliseu-agent.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Agente parado e removido da inicializacao. Os arquivos da pasta foram mantidos.
pause
