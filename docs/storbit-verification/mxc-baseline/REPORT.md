# MXC baseline comparison — 2026-11-14

Baseline NOT READY; visual redesign not started. Earlier logs preserved; fresh logs in this directory. No application, fiscal, schema or Electron security changes; no push/merge/deploy.

Execution identity is ahmed\asus, profile directory enumeration now succeeds (previously EPERM). No MXC backend/status indicator is exposed by available execution tools or environment; cannot independently certify MXC from identity alone. CODEX_SANDBOX_NETWORK_DISABLED=1 remains set.

| Check | Previous | Fresh result |
| --- | --- | --- |
| npm.cmd run build | Failed config access | PASSED, exit 0; Vite and PWA completed. |
| npm.cmd run test --workspace apps/web | Blocked before collection | PASSED, exit 0; 51 files, 267 tests. |
| Docker version | Daemon unavailable | BLOCKED: permission denied connecting to npipe:////./pipe/dockerDesktopLinuxEngine. |
| Isolated PostgreSQL | initdb blocked | initdb PASSED, UTF8/SCRAM; dedicated workspace cluster on 127.0.0.1:55439 started and logged ready. createdb BLOCKED: Permission denied (0x0000271D/10013). Prisma deploy exit 1, P1001 cannot reach server. No successful database creation/migration/seed; API E2E NOT RUN, BLOCKED by prerequisite. |
| Windows Electron E2E | Launch crash | BLOCKED: command exit 1, 1 failed in launch-dependent setup, 164 did not run, 1 outside-test error. Process exit 2147483651 (0x80000003). Current log contains no fatal ACL stderr, so historical ACL explanation is not newly proven. |

Electron command: npm.cmd run test:e2e --workspace apps/desktop -- --max-failures=1 (DEBUG=pw:browser). Fail-fast stops repeated crash attempts; tests/assertions unchanged. Single standalone Playwright launch also failed, see electron-launch.log. No sandbox flags/ACL changes.

Safe next steps: confirm/restart this Codex task under the intended MXC backend and verify Docker named-pipe and localhost TCP access inside that same session. Do not relax Electron sandbox protections. After host/session access is fixed, repair/reinstall Electron with supported sandbox-readable installation permissions if its fatal diagnostics confirm that issue, then rerun full E2E without fail-fast. Normal PowerShell success does not prove this executor has the same network/pipe permissions.

Temporary cluster data remains under .local-desktop/mxc-pg; random password file removed. Cleanup pg_ctl stop reported No such process for PID 34724, so it did not confirm graceful shutdown; no other PostgreSQL service was stopped. No production database accessed. Critical POS workflows remain unverified. API/desktop unit and lint results from the prior report were not rerun or represented as fresh results here.
