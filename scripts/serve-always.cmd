@echo off
rem Keeps the Melodle server up: restarts it if it ever exits, and logs where
rem you can read it. Started at logon by the "Melodle server" scheduled task.
title Melodle server

cd /d "%~dp0.."

set "LOGDIR=%LOCALAPPDATA%\Melodle"
set "LOG=%LOGDIR%\server.log"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

:loop
echo. >> "%LOG%"
echo [%date% %time%] starting Melodle >> "%LOG%"
call npm run start:lan >> "%LOG%" 2>&1
echo [%date% %time%] server exited, restarting in 10 seconds >> "%LOG%"
timeout /t 10 /nobreak > nul
goto loop
