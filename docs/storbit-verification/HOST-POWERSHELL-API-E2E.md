# Host PowerShell: API E2E without a Windows VM

Initial API-only phase; not executed by Codex. No Electron or hardware tests. This supplements EXTERNAL-POWERSHELL-RUNBOOK.md: its VM requirement no longer applies to this contained API phase. Its section F stop requirement still applies.

## Design

PowerShell orchestrates Docker Desktop. API tests run in a **temporary Linux Node container**, not host Node. This distinction must appear in the test report. PostgreSQL has a unique container name, random role/password/database and random **127.0.0.1-only** published port. No existing PostgreSQL container is used, stopped, exec'd into, mounted or modified.

The runner shares only the NEW database container's network namespace. Its database URL is therefore 127.0.0.1:5432, satisfying existing local-test database guards. A namespace-local IPv4/IPv6 firewall permits loopback and established replies, rejects other outgoing connections. This prevents new calls to host services, other databases, LAN, fiscal/payment/email/AI services or internet while allowing existing loopback mocks. Firewall changes occur only in the new namespace, never on Windows or the existing containers. Test runners have no NET_ADMIN capability, Docker socket or host mounts. No security protections are disabled.

Prerequisites: local Docker Desktop Linux context, Git, Node >=20 dependencies prepared by the image build, reviewed committed baseline and lockfile. Review archive for secrets before building. No dirty tracked code may be silently omitted. Build requires internet; runtime does not. Do not import host dotenv/npmrc/node_modules/profiles. Existing Compose files and volumes are never used. Allow about 2 GiB runner + 512 MiB PostgreSQL plus Docker overhead; 15.6 GB laptop RAM does not require a Windows VM for this phase. Close other heavy applications without stopping either existing PostgreSQL container.

## Preflight only

Read-only; no Docker, database, Electron or E2E invocation. Prints potentially unsafe variable names only.

```powershell
Set-Location 'C:\Users\ASUS\Desktop\project_main'
Get-Command git.exe,docker.exe | Select-Object Name,Source
git status --short
git rev-parse HEAD
(Get-Content apps/api/package.json -Raw | ConvertFrom-Json).scripts
Get-Content apps/api/test/jest-e2e.json
Get-Content apps/api/prisma/schema.prisma -TotalCount 10
Get-ChildItem Env: | Where-Object Name -match 'DATABASE|PG|PRISMA|DOTENV|NODE_OPTIONS|PROXY|AGT|SAFT' | Select-Object Name
```

Confirmed commands: `prisma:deploy` = prisma migrate deploy; `prisma:seed` = ts-node prisma/seed.ts; `test:e2e` = jest --config ./test/jest-e2e.json --runInBand. Jest uses Node, ts-jest, .e2e-spec.ts discovery and forceExit. No new exclusions, mocks replacing assertions, or retries. Existing migrations initialize only the empty disposable database; no schema source changes.

## One manual execution

Save the following as a PowerShell script outside the checkout and execute the **whole script** in a normal fresh PowerShell window. Do not execute stages individually. No elevation or Electron invocation. Stop on failure. This procedure has only been statically reviewed, not runtime-tested.

```powershell
$ErrorActionPreference='Stop'
$root='C:\Users\ASUS\Desktop\project_main'
Set-Location -LiteralPath $root
$token=[guid]::NewGuid().ToString('N')
$run=Join-Path $root "docs/storbit-verification/host-api-$token"
$stage=Join-Path $run 'context'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$pgName="storbit-api-pg-$token"; $net="storbit-api-net-$token"
$image="storbit-api-runner:$token"
$role='test_'+$token.Substring(0,12); $db='storbit_test_'+$token.Substring(0,12)
$password=[guid]::NewGuid().ToString('N')
$pgId=$null; $netId=$null; $failure=$null
$names=New-Object System.Collections.Generic.List[string]
function Check($label,[scriptblock]$cmd) {
    $old=$ErrorActionPreference; $ErrorActionPreference='Continue'
    try { & $cmd 2>&1 | Tee-Object (Join-Path $run "$label.log"); $code=$LASTEXITCODE }
    finally { $ErrorActionPreference=$old }
    "$label`t$code" | Add-Content (Join-Path $run 'exit-codes.tsv')
    if($code -ne 0){throw "$label failed: exit $code"}
}
function Owned($name) {
    $raw=docker inspect $name 2>$null
    if($LASTEXITCODE -ne 0){throw "Cannot inspect $name"}
    $m=@($raw | ConvertFrom-Json)[0]
    if($m.Name -ne "/$name" -or $m.Config.Labels.'storbit.api.run' -ne $token){throw 'Ownership mismatch'}
    return $m
}
function AssertDb {
    $m=Owned $pgName
    if($m.Id -ne $pgId -or $m.Config.Image -ne 'postgres:16-alpine'){throw 'Database container changed'}
    if(@($m.Mounts | Where-Object Type -eq 'bind').Count){throw 'Host mount forbidden'}
    $b=@($m.NetworkSettings.Ports.'5432/tcp')
    if($b.Count -ne 1 -or $b[0].HostIp -ne '127.0.0.1' -or $b[0].HostPort -ne "$hostPort"){throw 'Binding changed'}
    if($url -cne "postgresql://${role}:${password}@127.0.0.1:5432/${db}?schema=public"){throw 'URL changed'}
    # Verify through PostgreSQL TCP inside the same namespace, not just Docker metadata.
    Check 'db-target-proof' { docker exec -e "PGPASSWORD=$password" $pgId psql -h 127.0.0.1 -U $role -d $db -v ON_ERROR_STOP=1 -c "select 1 / ((current_database() = '$db' AND current_user = '$role')::int) as identity_ok, system_identifier from pg_control_system();" }
}
function Api($label,$script) {
    AssertDb
    $n="storbit-api-$label-$token"; $names.Add($n)
    Check $label { docker run --name $n --label "storbit.api.run=$token" --network "container:$pgId" --cap-drop ALL --security-opt no-new-privileges --memory 2g --cpus 2 -e NODE_ENV=test -e "DATABASE_URL=$url" -e "JWT_ACCESS_SECRET=$jwtA" -e "JWT_REFRESH_SECRET=$jwtR" -e JWT_ACCESS_TTL=30m -e JWT_REFRESH_TTL=30d -e AGT_EINVOICE_ENABLED=false -e AGT_EINVOICE_URL=http://127.0.0.1:9 -e AI_INSIGHTS_ENABLED=false $image npm run $script --workspace apps/api }
}
try {
    $dirty=git diff HEAD --name-only
    if($LASTEXITCODE -ne 0 -or $dirty){throw 'Choose exact committed baseline; tracked changes present'}
    git rev-parse HEAD | Set-Content (Join-Path $run 'head.txt')
    Check 'archive' { git archive --format=zip --output="$run/source.zip" HEAD }
    Expand-Archive -LiteralPath (Join-Path $run 'source.zip') -DestinationPath $stage
    $unsafe=@(Get-ChildItem $stage -Recurse -Force -File | Where-Object { ($_.Name -match '^\.env($|\.)|\.env$|^\.npmrc$|^\.pgpass$|^pg_service\.conf$') -and $_.Name -notmatch '\.(example|sample|template)$' })
    if($unsafe.Count){throw 'Runtime config/credential file in archive; stop for review'}
    @'
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends iptables python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY . .
RUN npm ci && npm run prisma:generate --workspace apps/api
ENV NODE_ENV=test
'@ | Set-Content (Join-Path $stage 'Dockerfile.api-test')
    @'
set -eu
for tool in iptables ip6tables; do
  $tool -N STORBIT_TEST_OUT
  $tool -A STORBIT_TEST_OUT -o lo -j ACCEPT
  $tool -A STORBIT_TEST_OUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  $tool -A STORBIT_TEST_OUT -j REJECT
  $tool -I OUTPUT 1 -j STORBIT_TEST_OUT
  $tool -C OUTPUT -j STORBIT_TEST_OUT
  $tool -C STORBIT_TEST_OUT -j REJECT
  $tool -S STORBIT_TEST_OUT
done
'@ | Set-Content (Join-Path $stage 'guard.sh')
    # POSIX shell script: remove Windows CRLF before building.
    $guardPath=Join-Path $stage 'guard.sh'
    [IO.File]::WriteAllText($guardPath, ((Get-Content $guardPath -Raw) -replace [char]13,''), [Text.Encoding]::ASCII)
    if($env:DOCKER_HOST -or $env:DOCKER_TLS_VERIFY -or $env:DOCKER_CERT_PATH){throw 'Remove Docker endpoint overrides in a fresh shell'}
    $context=(docker context show).Trim()
    if($LASTEXITCODE -ne 0 -or $context -ne 'desktop-linux'){throw 'Expected local desktop-linux context'}
    $ci=@(docker context inspect $context | ConvertFrom-Json)[0]
    if($LASTEXITCODE -ne 0 -or $ci.Endpoints.docker.Host -ne 'npipe:////./pipe/dockerDesktopLinuxEngine'){throw 'Unexpected Docker endpoint'}
    docker ps -aq | Set-Content (Join-Path $run 'existing-container-ids.txt')
    if($LASTEXITCODE -ne 0){throw 'Docker unavailable'}
    Check 'image-build' { docker build --label "storbit.api.run=$token" -t $image -f "$stage/Dockerfile.api-test" $stage }
    Check 'network-create' { docker network create --internal --label "storbit.api.run=$token" $net }
    $ni=@(docker network inspect $net | ConvertFrom-Json)[0]
    if($LASTEXITCODE -ne 0 -or $ni.Labels.'storbit.api.run' -ne $token -or -not $ni.Internal){throw 'Unsafe network'}
    $netId=$ni.Id
    Check 'db-create' { docker run -d --name $pgName --label "storbit.api.run=$token" --network $net --memory 512m --cpus 1 -e "POSTGRES_USER=$role" -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=$db" -p 127.0.0.1::5432 postgres:16-alpine }
    $pg=Owned $pgName; $pgId=$pg.Id
    $pgId | Set-Content (Join-Path $run 'test-container-id.txt')
    $hostPort=[int](@($pg.NetworkSettings.Ports.'5432/tcp')[0].HostPort)
    "127.0.0.1:$hostPort/$db" | Set-Content (Join-Path $run 'host-db-target.txt')
    $url="postgresql://${role}:${password}@127.0.0.1:5432/${db}?schema=public"
    $jwtA=[guid]::NewGuid().ToString('N'); $jwtR=[guid]::NewGuid().ToString('N')
    $ready=$false
    for($i=0;$i -lt 60;$i++) {
        docker exec $pgId pg_isready -U $role -d $db *> $null
        if($LASTEXITCODE -eq 0){$ready=$true;break}; Start-Sleep -Seconds 1
    }
    if(-not $ready){throw 'Disposable PostgreSQL not ready'}
    $guard="storbit-api-guard-$token"; $names.Add($guard)
    Check 'network-guard' { docker run --name $guard --label "storbit.api.run=$token" --network "container:$pgId" --cap-drop ALL --cap-add NET_ADMIN --security-opt no-new-privileges $image sh /workspace/guard.sh }
    Check 'egress-negative' { docker run --rm --network "container:$pgId" --cap-drop ALL --security-opt no-new-privileges $image node -e "const s=require('net').connect({host:'192.0.2.1',port:443});s.on('connect',()=>{console.error('UNSAFE_EGRESS');process.exit(1)});s.on('error',()=>console.log('EGRESS_DENIED'));s.setTimeout(2000,()=>{s.destroy();console.log('EGRESS_DENIED_TIMEOUT')});" }
    AssertDb
    Api 'migrations' 'prisma:deploy'
    Api 'seed' 'prisma:seed'
    Api 'api-e2e' 'test:e2e'
    'API AUTOMATION PASSED; SECTION F OPEN' | Set-Content (Join-Path $run 'result.txt')
} catch {
    $failure=$_
    $_ | Out-String | Set-Content (Join-Path $run 'failure.txt')
    'FAILED/BLOCKED; DO NOT START REDESIGN' | Set-Content (Join-Path $run 'result.txt')
} finally {
    foreach($n in @($names.ToArray()) + @($pgName)) {
        try {
            $m=Owned $n
            docker logs $m.Id 2>&1 | Set-Content (Join-Path $run "$n.log")
            docker rm -f -v $m.Id 2>&1 | Set-Content (Join-Path $run "$n-cleanup.log")
            if($LASTEXITCODE -ne 0){throw 'Container removal failed'}
        } catch { $_ | Out-String | Add-Content (Join-Path $run 'cleanup-review.log') }
    }
    try {
        $ni=@(docker network inspect $net 2>$null | ConvertFrom-Json)[0]
        if($LASTEXITCODE -ne 0 -or $ni.Labels.'storbit.api.run' -ne $token -or ($netId -and $ni.Id -ne $netId)){throw 'Network identity not confirmed; no removal'}
        docker network rm $ni.Id 2>&1 | Set-Content (Join-Path $run 'network-cleanup.log')
        if($LASTEXITCODE -ne 0){throw 'Network removal failed'}
    } catch { $_ | Out-String | Add-Content (Join-Path $run 'cleanup-review.log') }
    docker ps -aq | Set-Content (Join-Path $run 'remaining-container-ids.txt')
    Write-Host "Logs retained: $run"
}
if($failure){throw $failure}
```

## Results and remaining risk

- Require exit 0 at each checked stage; DB proof identity_ok=1, unique database/role and stable system identifier; network guard rules installed for both families; egress probe denied. Docker port metadata must show the random 127.0.0.1 binding. Never substitute an existing host endpoint. Exact runner URL is reconstructed/checked before migrations, seed and E2E. No host environment forwarding (`-e NAME` without a value is forbidden).
- Inspect exact Jest passed/failed/skipped totals; every failure is reported. Existing API phase9 tests intentionally use a local AGT HTTP fake and generated test signing keys; containment allows loopback but prevents real AGT. NODE_ENV=test uses repository test fiscal key, not production key. Checkout records are synthetic. No host payment credentials, email/AI keys, printers, USB/serial, Docker socket or profile is available. No claim that all integrations are mocked: network denial is essential. Stop if guard tooling is incompatible; do not remove it to run tests.
- Compare existing-container-ids.txt and remaining-container-ids.txt: both original containers must remain. No Compose down, broad prune, existing-volume deletion, or existing-container action. Cleanup verifies unique name/run label; network also checks ID. Runner image/context retained for audit, never pushed; arrange their deletion separately after reviewing logs. No recursive host deletion is performed.
- Finally handles ordinary errors, not power loss/forced termination. Retain IDs/run token for manual ownership-verified recovery. Review cleanup-review.log even after test success. Password is disposable but visible to Docker administrators; do not publish inspect/environment output. Logs/source archive may contain synthetic records/test keys; keep local.
- Shared Docker CPU/RAM/disk, build-time supply chain, Docker administrator access and possible container/kernel vulnerabilities remain host risks. Ordinary scripts cannot adequately isolate untrusted code or hostile dependencies; use a dedicated VM/machine for that threat model. The namespace firewall requires a narrowly scoped NET_ADMIN helper; runner itself has all capabilities dropped. No Windows/global firewall changes. Existing services still share host resources, so OOM/disk pressure is possible despite per-container limits.
- Linux-container API success is not Windows-native/Electron/hardware verification. Keep Electron E2E (one reviewed fail-fast invocation, no sandbox weakening), packaged updater, manual print/hardware, viewport/theme/language/a11y and other section F evidence as separate phases. Any critical untested/blocked workflow means baseline NOT READY. No redesign, push, merge or deployment.


