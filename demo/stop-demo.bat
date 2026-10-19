@echo off
setlocal
title POS demo server
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo  Docker is not running, so the POS server is already stopped.
  goto :done
)

if /i "%~1"=="reset" goto :reset

echo  Stopping the POS server (your demo data is kept)...
docker compose stop
echo  [ok] Stopped. Run start-demo.bat to start it again.
goto :done

:reset
echo  This DELETES all demo data (sales, products, users) and starts over
echo  with a fresh demo store next time you run start-demo.bat.
set /p "answer=  Type YES to continue: "
if /i not "%answer%"=="YES" (
  echo  Cancelled - nothing was deleted.
  goto :done
)
docker compose down -v
if exist ".env" del ".env"
echo  [ok] Demo data deleted. Run start-demo.bat for a fresh demo store.

:done
echo.
pause
