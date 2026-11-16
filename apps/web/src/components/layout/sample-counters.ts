/** Synthetic preview only. Both values share one finite frame loop. */
export function prepareSampleCounters(root: HTMLElement) {
  const sales = root.querySelector<HTMLElement>("[data-sample-sales]");
  const transactions = root.querySelector<HTMLElement>("[data-sample-transactions]");
  let frame = 0;
  let started = false;
  let cancelled = false;
  const finish = () => {
    if (sales) sales.textContent = "Kz 2.48M";
    if (transactions) transactions.textContent = "126";
  };
  if (sales && transactions) {
    sales.textContent = "Kz 0.00M";
    transactions.textContent = "0";
  }
  return {
    start() {
      if (started || cancelled || !sales || !transactions) return;
      started = true;
      const startTime = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, Math.max(0, (now - startTime) / 800));
        const eased = 1 - (1 - progress) ** 3;
        sales.textContent = `Kz ${(2.48 * eased).toFixed(2)}M`;
        transactions.textContent = String(Math.round(126 * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
        else finish();
      };
      frame = requestAnimationFrame(tick);
    },
    cancel() {
      cancelled = true;
      cancelAnimationFrame(frame);
      finish();
    },
  };
}
