# Environment repair investigation — 2026-11-14

Baseline NOT READY. No UI/application/business/fiscal/schema changes. No push, merge or deployment. Existing evidence preserved.

| Check | Status | Evidence / root cause |
| --- | --- | --- |
| API unit | PASSED | api-unit.log: 49 suites, 324 tests, exit 0. |
| Desktop unit | PASSED | desktop-unit.log: 29 tests, exit 0. |
| Lint | PASSED | lint.log: exit 0, 0 errors, 4 warnings. |
| Web unit | BLOCKED | web-unit.log: exit 1 before collection; esbuild cannot enumerate ancestor profile directory and then fails config resolution. Config files exist and are readable by PowerShell. Direct esbuild file-entry reproduction fails; stdin bundling succeeds. Node readdir of C:/Users/ASUS returns EPERM; Desktop and checkout readable. |
| Workspace build | FAILED | Same Vite config/esbuild access error in prior baseline; fresh output retained in build.log. |
| Isolated API E2E | BLOCKED | Docker daemon pipe absent; Docker config access denied; Docker service stopped and Start-Service denied. PostgreSQL 18 service exists but was not accessed. Attempted separate workspace cluster with initdb, UTF8, SCRAM authentication and temporary random password; initdb exit 1 with restricted-token errors 87/3 and ancestor directory creation failure. Password file removed; no existing DB accessed or schema changed. See initdb.log. |
| Windows Electron E2E | BLOCKED | Preserved fatal installation-access crash 0x80000003; prior crash reports missing ALL APPLICATION PACKAGES read access. Current ACL lacks that entry; differs from historical package-SID details, so exact historical ACL not proven. Attempted narrow RX grant to Electron dist for S-1-15-2-1 via icacls; access denied, 0 files processed. No sandbox/security flags changed. No launch retries without repair. |
| Critical manual/E2E workflows, screenshots, a11y | BLOCKED | Reliable web build, isolated database and Electron launch environment unavailable; no equivalence sign-off. |

Required environment remediation outside current restricted session: provide supported ancestor-directory traversal/enumeration for build tooling (or a readable checkout location), a usable isolated PostgreSQL service/cluster or Docker daemon, and administrator/installation-owner repair of Electron installation sandbox read access. Do not disable sandboxing. Re-run full baseline after these are available. Application-code changes are neither needed nor authorized by this investigation.
