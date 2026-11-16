For initial API E2E without a Windows VM, use [HOST-POWERSHELL-API-E2E.md](HOST-POWERSHELL-API-E2E.md). Windows Electron and manual hardware checks remain separate; section F still applies.

# External Windows PowerShell baseline runbook — revised safety gate

This supersedes the earlier runbook. No Docker, database, Electron or E2E commands in this document were executed during its preparation. No application/schema/security changes are authorized. Baseline remains NOT READY until actual results and section F evidence are reviewed.

## 1. Safe preflight ONLY (no database creation or test execution)

Run this block in normal Windows PowerShell. It only reads the checkout, executable locations and listening ports. It does NOT run npm scripts, load application modules, invoke Docker or connect to any database. Keep its output for review; do not print dotenv contents or credentials.

```powershell
Set-Location 'C:\Users\ASUS\Desktop\project_main'
$ErrorActionPreference='Stop'
foreach ($tool in @('node.exe','npm.cmd','git.exe','docker.exe')) {
    Get-Command $tool -ErrorAction Stop | Select-Object Name,Source
}
foreach ($file in @('package.json','apps/web/package.json','apps/api/package.json','apps/desktop/package.json')) {
    $pkg=Get-Content $file -Raw | ConvertFrom-Json
    Write-Output "SCRIPTS: $file"
    $pkg.scripts | Format-List
}
Get-Content apps/web/vitest.config.ts
Get-Content apps/api/test/jest-e2e.json
Get-Content apps/desktop/playwright.config.ts
Get-Content docker-compose.yml
Get-Content docker-compose.prod.yml
Get-FileHash package-lock.json,apps/api/prisma/schema.prisma -Algorithm SHA256
# Names only: never expose values of inherited credentials.
Get-ChildItem Env: | Where-Object Name -match 'DATABASE|PG|PRISMA|DOTENV|NODE_OPTIONS|PROXY|AGT|SAFT|PAYMENT|POS_' | Select-Object Name
foreach ($p in @(55480,55481,55462,55472)) {
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        Select-Object LocalAddress,LocalPort,OwningProcess
}
```

Expected: real scripts/configs below, no occupied test ports. This block cannot certify Docker connectivity, network isolation, hardware isolation or a complete baseline. Do not proceed merely because it completes.

## 2. Mandatory isolation prerequisites — stop if unavailable

Use a **disposable Windows VM with a fresh local account**, not the everyday POS/development host. This stronger boundary is required because environment-variable filtering alone cannot guarantee that tests or native dependencies never reach another database, printer or fiscal endpoint.

- No existing DB/API/POS services, mapped drives, shared host folders, host database routes, saved credentials, payment terminals, USB/serial passthrough, printers (including network printers), drawer or customer-display hardware. No production fiscal keys/certificates. Do not redirect host printers into the VM.
- Install Node >=20, Git, Docker Desktop Linux engine and Microsoft Edge. Prepare dependencies and cache `postgres:16-alpine` BEFORE restricting network access. Do not install/update packages during tests.
- Export the exact reviewed tracked HEAD into a **new VM-local checkout** (for example with `git archive HEAD`, then extract). Do not copy ignored/untracked dotenv files, `.local-desktop`, application profiles or original `node_modules`. Install the exported lockfile with `npm.cmd ci` during preparation. Record source HEAD and source dirty status separately: an archive excludes uncommitted edits; stop if those are intended baseline inputs.
- After preparation, have the VM/network owner block guest access to host/LAN/internet, while retaining guest loopback, local Docker named pipe, and the Docker internal forwarding needed for the newly published database. Verify outbound denial separately for host/LAN and internet. No route to any existing database is permitted. Do NOT relax Electron sandbox, firewall or native security for the tests. If this isolation cannot be demonstrated, mark E2E BLOCKED.
- Docker context must be the local Docker Desktop Linux engine, never a remote context. No existing Compose stack may be used. Development Compose mounts `postgres_data` on 15432; production mounts `postgres_prod_data`; neither belongs to this run.
- A fresh VM account plus an environment allowlist and dotenv rejection below prevents inherited variables/configuration fallback. An explicit DATABASE_URL is necessary but is NOT the sole safety boundary. Review any new config loader, hardcoded endpoint or external-service integration added since the inspected HEAD before running.

Logs are written to a unique directory outside the disposable checkout. Keep that directory when discarding the VM. Existing historical logs must not be overwritten. Container passwords are disposable but visible to local Docker administrators; do not publish them or full `docker inspect` output.

## 3. Confirmed commands, suites and safety coverage

| Area | Actual configuration / command |
| --- | --- |
| Workspace | `npm.cmd run build`: all workspace builds; `npm.cmd run lint`: existing workspace lint scripts. |
| Web unit | `npm.cmd run test --workspace apps/web`: `vitest run`, Node setup `src/test/setup.ts`, alias from vitest.config.ts; no browser UI coverage implied. |
| API unit | `npm.cmd run test --workspace apps/api -- --runInBand`: Jest src specs. |
| Desktop unit | `npm.cmd run test --workspace apps/desktop`: tsc then Node dist/unit-tests.js, not Electron. |
| API E2E | `npm.cmd run test:e2e --workspace apps/api`: Jest test/jest-e2e.json, ts-jest, Node, runInBand, forceExit. All matching .e2e-spec.ts files; migrated and seeded isolated database needed. |
| DB preparation | Existing `prisma:deploy` and `prisma:seed` scripts only, on empty disposable DB; never migrate dev/reset/db push or schema edits. |
| Desktop renderer | `npm.cmd run build:desktop --workspace apps/web`: tsc/Vite desktop output; Electron main separately compiled by test:e2e. |
| Electron E2E | `npm.cmd run test:e2e --workspace apps/desktop -- --max-failures=1 --retries=0 --output=...`: compile then Playwright, one worker, test timeout 90s, assertion timeout 15s. Exactly ONE invocation. |

Enabled flags (all `1`): POS_ARCHIVE_TESTS, POS_CONTENTION_TESTS, POS_OFFLINE_STOCK_TESTS, POS_FINAL_1C_TESTS, POS_RECOVERY_UI_TESTS, POS_FREE_POLICY_TESTS. Their browser variants use Edge and POS_TEST_WEB_URL; their Electron variants use app://pos. Helpers use POS_TEST_API_URL (unsafe default localhost:4000 is overridden). Archive proxy uses 55472, offline-stock proxy 55462; other fake servers/proxies allocate loopback ports. Intentional unavailable loopback ports are negative tests, not external services.

Known exclusions: Playwright already ignores `zz-probe.spec.ts` (scratch diagnostic); no new exclusion is allowed. `updates.spec.ts` skips without POS_TEST_UPDATE_FEED AND POS_DESKTOP_EXECUTABLE. Both remain unset here: packaged updater verification is NOT RUN, requires a separately reviewed packaged test/feed, and prevents a claim of total coverage. Capture ALL actual skips and fail-fast not-run tests; do not reinterpret them as passes. Timezone suites check POS_ACCOUNTING_TEST_TIMEZONE/POS_FISCAL_TEST_TIMEZONE when supplied; a default-timezone run does not certify a multi-timezone matrix.

External-service audit at inspection:

- API `angola-phase9.e2e-spec.ts` creates an HTTP fake on 127.0.0.1, generates test signing keys, overrides AGT endpoint/credentials and queue interval, restores environment/tears down afterward. Do not globally prevent that legitimate mock; external egress containment prevents real AGT calls.
- Fiscal signature code supports test signing in NODE_ENV=test; no real key/certificate may be imported. Synthetic fiscal documents are expected inside the disposable DB; none may be submitted externally.
- Desktop `helpers.ts` supplies SwitchableProxy/FakePrinter loopback servers; part C drawer and part D display use fake network devices. Part B uses POS_DESKTOP_PRINT_TO_PDF_DIR for PDF rendering and also exercises missing-printer behavior. Not every OS/native path is mocked. The VM must have NO real printer/hardware access; do not skip those assertions or substitute real devices.
- Checkout payment records are synthetic database transactions, not evidence of a real acquirer mock. No blanket claim that all payment integrations are mocked: no payment credentials/terminal and no external network are permitted. Any newly discovered external SDK/URL not covered here is a STOP for review.
- Mail/AI credentials absent; AGT/AI disabled by default except explicit local mock tests. Fresh profile, no updater feed/executable and install-on-quit=0; no real software installation/update or print job is authorized.

## 4. Execute one checked run with finally cleanup

Save the following as a **VM-local** `Run-StorbitBaseline.ps1` outside the checkout. Set ONLY `$source` to the prepared exported checkout; do not point it at the everyday checkout. Run the whole script with `powershell.exe -NoProfile -File ...`; do not paste stages separately. Required isolation prerequisites above must already be met. No elevation or security bypass flags.

```powershell
$ErrorActionPreference='Stop'
$source='C:\STORBIT-Test\checkout'
$run=Join-Path 'C:\STORBIT-Test\logs' ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$token=[guid]::NewGuid().ToString('N')
$name="storbit-baseline-test-$token"
$containerId=$null; $api=$null; $web=$null; $failure=$null
$saved=@{}; Get-ChildItem Env: | ForEach-Object { $saved[$_.Name]=$_.Value }
function Check($label,[scriptblock]$cmd) {
    # Native stderr can contain warnings on success in Windows PowerShell.
    $old=$ErrorActionPreference; $ErrorActionPreference='Continue'
    try { & $cmd 2>&1 | Tee-Object -FilePath (Join-Path $run "$label.log"); $exit=$LASTEXITCODE }
    finally { $ErrorActionPreference=$old }
    "$label`t$exit" | Add-Content (Join-Path $run 'exit-codes.tsv')
    if ($exit -ne 0) { throw "$label failed (exit $exit)" }
}
function Inspect-Owned {
    $json=docker inspect $name 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Container inspection failed' }
    $m=@($json | ConvertFrom-Json)[0]
    if ($m.Name -ne "/$name" -or $m.Config.Labels.'storbit.baseline.run' -ne $token) { throw 'Container ownership mismatch' }
    if ($containerId -and $m.Id -ne $containerId) { throw 'Container ID changed' }
    if (@($m.Mounts | Where-Object Type -eq 'bind').Count) { throw 'Host mount forbidden' }
    return $m
}
function Assert-Target {
    $m=Inspect-Owned
    $b=@($m.NetworkSettings.Ports.'5432/tcp')
    if ($b.Count -ne 1 -or $b[0].HostIp -ne '127.0.0.1' -or $b[0].HostPort -ne "$dbPort") { throw 'Database binding changed' }
    if ($env:DATABASE_URL -cne $testUrl) { throw 'DATABASE_URL changed' }
    if ($env:POS_TEST_API_URL -cne 'http://127.0.0.1:55480' -or $env:POS_TEST_WEB_URL -cne 'http://127.0.0.1:55481') { throw 'Test endpoint changed' }
}
function Assert-Listener($port,$process) {
    $process.Refresh()
    if ($process.HasExited) { throw "Dedicated server exited: $port" }
    $listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
    if (-not $listeners.Count -or @($listeners | Where-Object OwningProcess -ne $process.Id).Count) { throw "Unexpected owner on port $port" }
}
try {
    Set-Location -LiteralPath $source
    # Allowlist, not a denylist: remove ALL inherited DB/PG/Prisma, dotenv,
    # NODE_OPTIONS preload, proxy, npm config, POS, signing and service credentials.
    $keep=@('SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramW6432','SystemDrive','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS')
    Get-ChildItem Env: | Where-Object Name -notin $keep | ForEach-Object { Remove-Item -LiteralPath ("Env:"+$_.Name) }
    # No dotenv anywhere in project sources (including custom-named .env files).
    # node_modules is installed from lockfile and is not traversed here.
    $todo=New-Object System.Collections.Generic.Stack[string]; $todo.Push($source)
    while ($todo.Count) {
        foreach ($f in Get-ChildItem -LiteralPath $todo.Pop() -Force) {
            if ($f.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point forbidden: $($f.FullName)" }
            if ($f.PSIsContainer) { if ($f.Name -notin @('node_modules','.git')) { $todo.Push($f.FullName) } }
            elseif ($f.Name -match '^\.env($|\.)|\.env$|^\.npmrc$') {
                if ($f.Name -notmatch '\.(example|sample|template)$') { throw "Unexpected config file: $($f.FullName)" }
            }
        }
    }
    # Fresh VM HOME/profile must contain no .env, .npmrc, .pgpass or pg_service.conf.
    foreach ($f in @('.env','.npmrc','.pgpass','pg_service.conf')) {
        if (Test-Path (Join-Path $env:USERPROFILE $f)) { throw "Unexpected profile config: $f" }
    }
    $env:NODE_ENV='test'
    $env:JWT_ACCESS_SECRET=[guid]::NewGuid().ToString('N')
    $env:JWT_REFRESH_SECRET=[guid]::NewGuid().ToString('N')
    $env:JWT_ACCESS_TTL='30m'; $env:JWT_REFRESH_TTL='30d'
    $env:AGT_EINVOICE_ENABLED='false'; $env:AI_INSIGHTS_ENABLED='false'
    $env:AGT_EINVOICE_URL='http://127.0.0.1:9'
    $env:PORT='55480'; $env:API_PORT='55480'
    $env:POS_TEST_API_URL='http://127.0.0.1:55480'
    $env:POS_TEST_WEB_URL='http://127.0.0.1:55481'
    $env:CORS_ORIGIN=$env:POS_TEST_WEB_URL; $env:APP_URL=$env:POS_TEST_WEB_URL
    $env:POS_DESKTOP_UPDATE_INSTALL_ON_QUIT='0'
    foreach ($p in @(55480,55481,55462,55472)) {
        if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) { throw "Port occupied: $p" }
    }
    $context=(docker context show).Trim()
    if ($LASTEXITCODE -ne 0 -or $context -ne 'desktop-linux') { throw 'Expected local desktop-linux context' }
    $contextInfo=@(docker context inspect $context | ConvertFrom-Json)[0]
    if ($LASTEXITCODE -ne 0 -or $contextInfo.Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'Remote/unexpected Docker endpoint' }
    Check 'docker-info' { docker info }
    # Never print full inspect/environment or the password.
    $password=[guid]::NewGuid().ToString('N')
    Check 'db-create' { docker run -d --name $name --label "storbit.baseline.run=$token" -e POSTGRES_USER=storbit_test -e "POSTGRES_PASSWORD=$password" -e POSTGRES_DB=storbit_baseline_test -p 127.0.0.1::5432 postgres:16-alpine }
    $owned=Inspect-Owned; $containerId=$owned.Id
    $containerId | Set-Content (Join-Path $run 'container-id.txt')
    $b=@($owned.NetworkSettings.Ports.'5432/tcp')
    if ($b.Count -ne 1 -or $b[0].HostIp -ne '127.0.0.1') { throw 'Unsafe binding' }
    $dbPort=[int]$b[0].HostPort
    $testUrl="postgresql://storbit_test:${password}@127.0.0.1:${dbPort}/storbit_baseline_test?schema=public"
    $env:DATABASE_URL=$testUrl
    $ready=$false
    for ($i=0;$i -lt 60;$i++) {
        docker exec $containerId pg_isready -U storbit_test -d storbit_baseline_test *> $null
        if ($LASTEXITCODE -eq 0) { $ready=$true; break }; Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Disposable database not ready' }
    Assert-Target
    Check 'db-identity' { docker exec $containerId psql -U storbit_test -d storbit_baseline_test -c 'select current_database(), current_user;' }
    Check 'build' { npm.cmd run build }
    Check 'lint' { npm.cmd run lint }
    Check 'web-unit' { npm.cmd run test --workspace apps/web }
    Check 'api-unit' { npm.cmd run test --workspace apps/api -- --runInBand }
    Check 'desktop-unit' { npm.cmd run test --workspace apps/desktop }
    Check 'type-api' { .\node_modules\.bin\tsc.cmd -p apps/api/tsconfig.json --noEmit }
    Check 'type-desktop' { .\node_modules\.bin\tsc.cmd -p apps/desktop/tsconfig.json --noEmit }
    Check 'desktop-renderer' { npm.cmd run build:desktop --workspace apps/web }
    Assert-Target
    Check 'db-migrate' { npm.cmd run prisma:deploy --workspace apps/api }
    Check 'db-seed' { npm.cmd run prisma:seed --workspace apps/api }
    # API E2E creates Nest servers in-process with this exact isolated URL.
    Assert-Target
    Check 'api-e2e' { npm.cmd run test:e2e --workspace apps/api }
    Check 'db-reseed' { npm.cmd run prisma:seed --workspace apps/api }
    Assert-Target
    $node=(Get-Command node.exe).Source
    $api=Start-Process $node -ArgumentList 'dist/src/main.js' -WorkingDirectory (Join-Path $source 'apps/api') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'api.log') -RedirectStandardError (Join-Path $run 'api.err.log')
    $vite='"'+(Join-Path $source 'node_modules/vite/bin/vite.js')+'"'
    $web=Start-Process $node -ArgumentList @($vite,'--host','127.0.0.1','--port','55481','--strictPort') -WorkingDirectory (Join-Path $source 'apps/web') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'web.log') -RedirectStandardError (Join-Path $run 'web.err.log')
    $healthy=$false
    for ($i=0;$i -lt 60;$i++) {
        try {
            $health=Invoke-RestMethod ($env:POS_TEST_API_URL+'/health') -TimeoutSec 2
            if ($health.status -eq 'ok' -and $health.info.database.status -eq 'up') { $healthy=$true; break }
        } catch {}; Start-Sleep -Seconds 1
    }
    if (-not $healthy) { throw 'API health/database check failed' }
    Assert-Listener 55480 $api; Assert-Listener 55481 $web; Assert-Target
    $health | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $run 'health.json')
    # Cross-check an API-created marker directly inside the verified container.
    # This proves more than /health (which only SELECTs 1).
    $marker="baseline-$token@e2e.test"
    $body=@{businessName="Baseline $token";storeName='Test';firstName='Test';lastName='Owner';email=$marker;password='DisposableBaseline123!'} | ConvertTo-Json
    $session=Invoke-RestMethod ($env:POS_TEST_API_URL+'/auth/register') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 20
    $id=$session.user.businessId
    if ($id -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid marker ID' }
    $sql="select count(*) from businesses where id='$id';"
    $found=(docker exec $containerId psql -U storbit_test -d storbit_baseline_test -tAc $sql).Trim()
    if ($LASTEXITCODE -ne 0 -or $found -ne '1') { throw 'API is not proven to use disposable database' }
    "API marker $id verified in disposable database" | Set-Content (Join-Path $run 'api-db-proof.txt')
    $response=Invoke-WebRequest -UseBasicParsing $env:POS_TEST_WEB_URL -TimeoutSec 10
    if ($response.StatusCode -ne 200) { throw 'Web server unhealthy' }
    # Verify Vite proxy reaches the same API by authenticating the marker through it.
    $login=@{email=$marker;password='DisposableBaseline123!'} | ConvertTo-Json
    $viaWeb=Invoke-RestMethod ($env:POS_TEST_WEB_URL+'/api/auth/login') -Method Post -ContentType 'application/json' -Body $login
    if ($viaWeb.user.businessId -ne $id) { throw 'Web proxy targets wrong API' }
    foreach ($flag in @('POS_ARCHIVE_TESTS','POS_CONTENTION_TESTS','POS_OFFLINE_STOCK_TESTS','POS_FINAL_1C_TESTS','POS_RECOVERY_UI_TESTS','POS_FREE_POLICY_TESTS')) { Set-Item "Env:$flag" '1' }
    $env:DEBUG='pw:browser'
    Assert-Target; Assert-Listener 55480 $api; Assert-Listener 55481 $web
    # ONE invocation, zero retries. No security/ACL/sandbox changes.
    Check 'electron-e2e' { npm.cmd run test:e2e --workspace apps/desktop -- --max-failures=1 --retries=0 --output="$run/playwright-results" }
    'AUTOMATED CHECKS PASSED; SECTION F REVIEW STILL REQUIRED' | Set-Content (Join-Path $run 'result.txt')
} catch {
    $failure=$_
    $_ | Out-String | Set-Content (Join-Path $run 'failure.txt')
    'FAILED/BLOCKED; BASELINE NOT READY' | Set-Content (Join-Path $run 'result.txt')
} finally {
    # Independent cleanup attempts: one failure must not prevent the others.
    foreach ($process in @($api,$web)) {
        if ($null -ne $process) {
            try { $process.Refresh(); if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit(10000) | Out-Null } }
            catch { $_ | Out-String | Add-Content (Join-Path $run 'cleanup-errors.log') }
        }
    }
    try {
        # Even partial docker run failure is inspected by unique name+run label.
        $m=Inspect-Owned
        docker logs $m.Id 2>&1 | Set-Content (Join-Path $run 'postgres.log')
        # Remove only matching ID/name/run token; -v removes its anonymous volumes.
        docker rm -f -v $m.Id 2>&1 | Set-Content (Join-Path $run 'cleanup-container.log')
        if ($LASTEXITCODE -ne 0) { throw 'Container removal failed' }
    } catch { $_ | Out-String | Add-Content (Join-Path $run 'cleanup-errors.log') }
    Get-ChildItem Env: | ForEach-Object { Remove-Item -LiteralPath ("Env:"+$_.Name) -ErrorAction SilentlyContinue }
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key],'Process') }
    Write-Host "Preserved logs: $run"
}
if ($failure) { throw $failure }
```

Expected: every recorded native command exits 0; DB identity is storbit_baseline_test/storbit_test, health database=up, marker verified in container, web proxy returns that same business. No expected fixed test count: record exact suite/test/pass/fail/skip totals from this HEAD. Any stdout warning is retained, not suppressed to claim success. Review cleanup-errors.log even if tests passed. No broad Docker prune, Compose down -v, application-profile deletion or unrelated process killing.

`finally` runs on normal errors/throws and pipeline failures, but cannot guarantee cleanup after host shutdown, forced PowerShell termination or VM crash. If interrupted, retain the VM/logs; identify the exact container by recorded ID plus its unique storbit.baseline.run token before removal. Never remove a resource based only on a generic name prefix. Processes started through Node are tracked as process objects; if an untracked child survives a crash, discard the disposable VM rather than killing arbitrary host processes. Export logs before discarding VM. Cleanup failure is BLOCKED, never a clean sign-off.

## 5. Section F final gate

Record every check PASSED/FAILED/BLOCKED/NOT RUN, including skipped tests and fail-fast remainder. Manual evidence still required: routes/roles/store switch; barcode focus/search/quantity/discount/tax/split tender and disabled states; till float/cash/hold/resume/close; offline queue/reconnect/idempotency/no duplicates; fiscal IDs/QR/signature/IVA/receipt/A4 deterministic comparison; inventory/concurrency/isolation; accounting/SAF-T/reports/dates/currency. Use synthetic data only, no real fiscal submission, payment or hardware. Capture 1024x768 and 1366x768, English/Portuguese, light/dark, focus/touch/contrast/modal scroll/overflow before screenshots. Hardware/packaged updater checks unavailable in this containment remain explicitly NOT RUN/BLOCKED and require a separate reviewed test setup.

If any previously passing test fails, protected code changes, fiscal output differs, security must be weakened, or a critical workflow remains unverified: STOP, baseline NOT READY. Do not weaken/skip assertions, rerun Electron crashes, start redesign, push, merge or deploy. This runbook has been statically reviewed only; it has not been executed or certified as passing.

