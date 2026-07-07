@echo off
setlocal
cd /d "%~dp0"
title Coliseu Agent - Status

echo ----- servico -----
"%~dp0nssm.exe" status ColiseuAgent
echo.
echo ----- ultimas 30 linhas do log -----
powershell -NoProfile -Command "Get-Content '%~dp0logs\agent.log' -Tail 30" 2>nul
echo ------------------------------------
echo.
echo Dica: ONLINE = falando com a nuvem ^| DEVICE OK = falando com a catraca.
pause
