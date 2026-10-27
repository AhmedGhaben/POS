/**
 * The demo data (a sample business, logins with known passwords, example
 * suppliers and expenses) must never reach a real shop's database. The
 * production image sets NODE_ENV=production and its start command only runs
 * `prisma migrate deploy`; this stops a seed run there by hand too. The demo
 * bundle (demo/start-demo.bat) opts in with ALLOW_DEMO_SEED=1.
 */
export function assertDemoDataAllowed(script: string): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    console.error(`${script}: refusing to add demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=1 only on a demo machine.`);
    process.exit(1);
  }
}
