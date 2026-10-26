@echo off
setlocal EnableDelayedExpansion
title POS demo server
cd /d "%~dp0"

echo.
echo  === POS demo server ===
echo.

rem --- 1. Docker installed and running? -------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
  echo  Docker is not installed. Install Docker Desktop first:
  echo    https://www.docker.com/products/docker-desktop/
  goto :fail
)
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ok
echo  Docker is not running - starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries=0
:wait_docker
set /a tries+=1
if !tries! gtr 90 (
  echo  Docker did not start within 3 minutes. Open Docker Desktop, wait until it
  echo  says "Engine running", then run start-demo.bat again.
  goto :fail
)
ping -n 3 127.0.0.1 >nul
docker info >nul 2>&1
if errorlevel 1 goto :wait_docker
:docker_ok
echo  [ok] Docker is running

rem --- 2. Fresh demo secrets (first run only) --------------------------------
if not exist ".env" (
  powershell -NoProfile -Command "$r=[Security.Cryptography.RandomNumberGenerator]::Create(); function New-Secret($n){$b=New-Object byte[] $n; $r.GetBytes($b); [BitConverter]::ToString($b).Replace('-','').ToLower()}; Set-Content -Encoding ascii -Path .env -Value @(('POSTGRES_PASSWORD='+(New-Secret 16)),('JWT_ACCESS_SECRET='+(New-Secret 32)),('JWT_REFRESH_SECRET='+(New-Secret 32)))"
  findstr /r /c:"^JWT_REFRESH_SECRET=[0-9a-f][0-9a-f]*" .env >nul 2>&1
  if errorlevel 1 (
    if exist ".env" del ".env"
    echo  Could not create the .env file in this folder.
    goto :fail
  )
  echo  [ok] Generated fresh demo secrets
)

rem --- 3. Load the server images (first run only) ----------------------------
docker image inspect pos-demo-api:latest >nul 2>&1
if errorlevel 1 (
  if not exist "images\pos-demo-images.tar" (
    echo  The file images\pos-demo-images.tar is missing from this folder.
    goto :fail
  )
  echo  Loading the server images - this takes a minute the first time...
  docker load -i "images\pos-demo-images.tar"
  if errorlevel 1 goto :fail
)
echo  [ok] Server images ready

rem --- 4. Database ------------------------------------------------------------
echo  Starting the database...
docker compose up -d --wait postgres
if errorlevel 1 goto :fail
echo  [ok] Database running

rem --- 5. Migrations ------------------------------------------------------------
echo  Applying database migrations...
docker compose run --rm --no-deps api npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
if errorlevel 1 goto :fail
echo  [ok] Database up to date

rem --- 6. Demo store (first run only: re-seeding would reset stock levels) ----
set "seeded="
for /f %%c in ('docker compose exec -T postgres psql -U pos -d pos -tAc "select count(*) from businesses where id = 'seed-business'"') do set "seeded=%%c"
if "!seeded!"=="1" (
  echo  [ok] Demo store already set up
) else (
  echo  Creating the Angolan demo store...
  docker compose run --rm --no-deps -e ALLOW_DEMO_SEED=1 api node apps/api/dist/prisma/seed.js
  if errorlevel 1 goto :fail
)

rem --- 7. API -----------------------------------------------------------------
echo  Starting the API...
docker compose up -d api
if errorlevel 1 goto :fail
set /a tries=0
:wait_api
set /a tries+=1
if !tries! gtr 60 (
  echo  The API did not answer on http://localhost:4000 - recent log:
  docker compose logs --tail 40 api
  goto :fail
)
ping -n 2 127.0.0.1 >nul
curl -s -f -o nul http://localhost:4000/health
if errorlevel 1 goto :wait_api

rem The passwords end in "!", which delayed expansion would swallow.
setlocal DisableDelayedExpansion
echo.
echo  ============================================================
echo   The POS server is running.
echo.
echo   Server address to type into the POS app:
echo.
echo       http://localhost:4000
echo.
echo   Owner:    owner@demo-store.test    / OwnerPass123!    (till PIN 8642)
echo   Cashier:  cashier@demo-store.test  / CashierPass123!  (till PIN 2468)
echo.
echo   It keeps running in the background (also after a restart,
echo   once Docker Desktop is open). Use stop-demo.bat to stop it.
echo  ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo  Something went wrong - see the message above.
echo.
pause
exit /b 1
