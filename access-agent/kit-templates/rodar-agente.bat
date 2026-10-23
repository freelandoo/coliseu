@echo off
rem Roda o agente em loop na sessao do usuario (modo CloudGym). Chamado escondido
rem pelo iniciar-oculto.vbs; se o agente cair, volta em 10 segundos.
cd /d "%~dp0"
if not exist "%~dp0logs" mkdir "%~dp0logs"
:loop
for %%A in ("%~dp0logs\agent.log") do if %%~zA GTR 5000000 move /y "%~dp0logs\agent.log" "%~dp0logs\agent.old.log" >nul
"%ProgramFiles%\nodejs\node.exe" --env-file=.env coliseu-agent.cjs >> "%~dp0logs\agent.log" 2>&1
timeout /t 10 /nobreak >nul
goto loop
