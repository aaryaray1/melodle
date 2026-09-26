@echo off
rem Opens a public HTTPS address that forwards to the local Melodle server, so
rem friends who are not on your Wi-Fi can play. Deliberately NOT started at
rem logon: while this runs, your laptop is serving the internet.
rem
rem The address changes every time this starts. Close this window to take it down.
title Melodle public link

set "CF=%LOCALAPPDATA%\Melodle\cloudflared.exe"

if not exist "%CF%" (
  echo cloudflared is missing. Download it to:
  echo   %CF%
  echo from https://github.com/cloudflare/cloudflared/releases
  pause
  exit /b 1
)

echo Starting the public link. Watch for the trycloudflare.com address below.
echo Everyone also needs the invite code from .env to make an account.
echo.

rem Runs in the foreground so the address is visible in this window.
"%CF%" tunnel --url http://localhost:8787 --no-autoupdate
