# Non-Electron verification report — 2026-11-14

Verification remains incomplete. No application logic, Electron sandbox settings, ACLs or launch flags were changed. No Windows Electron launches or retries were performed in this session.

Existing diagnostics in baseline/, session-baseline/, resumed-baseline/ and review-baseline/ were preserved in place. preserved-evidence-sha256.csv records their SHA-256 hashes. In particular, review-baseline/electron-crash-context.md, electron-e2e.log, electron-install-acl.txt and electron-binary-hash.txt remain available.

| Check | Status | Result |
| --- | --- | --- |
| Workspace build: npm.cmd run build | FAILED | Exit 1; see build.log. API and desktop compilation advanced to web build; aggregate build did not pass. |
| API unit tests | PASSED | Exit 0; 49 suites, 324 tests passed. See api-unit.log. |
| Desktop Node unit tests (no Electron imports) | PASSED | Exit 0; 8 suites, 29 tests passed; 0 failed/skipped. See desktop-unit.log. |
| Web unit tests | BLOCKED | Runner exit 1 before collection: esbuild directory access denied and Vitest configuration resolution failure. No test results. See web-unit.log. |
| Workspace lint | PASSED | Exit 0; 0 errors, 4 React fast-refresh warnings. See lint.log. |
| API TypeScript --noEmit | PASSED | Exit 0; see type-api.log. |
| Desktop TypeScript --noEmit | PASSED | Exit 0; see type-desktop.log. |
| API database E2E | BLOCKED | Not run: DATABASE_URL is not set in this process; suite requires an isolated local test database. No database configuration, migrations or seeding performed. |
| Windows Electron E2E | BLOCKED | Existing environment issue: Electron fatal installation-access/sandbox ACL check and process exit 0x80000003. No retries attempted. |
| Packaged Windows/manual workflows and visual/accessibility checks | NOT RUN | Remain unverified. |

All command output from this session is retained beside this report. Historical results are not counted as fresh passes. Remaining blockers are the Windows Electron environment, web tooling filesystem/configuration access, the failed aggregate build, and the missing isolated API test database. Critical end-to-end workflows remain unverified; no full verification, implementation completion or release sign-off is claimed.
