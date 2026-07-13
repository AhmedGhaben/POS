/** Auto-compact currency: $1,284.00 / $12.9K / $4.2M — per stat-tile figure contract. */
export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US");
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
