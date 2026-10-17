import { Prisma } from "@prisma/client";

/**
 * Fixed assets (docs/ACCOUNTING-DECISIONS.md, B4). Groups with the PGC
 * accounts they use and the maximum yearly rate of Decreto Presidencial
 * 207/15 (Regime das Reintegrações e Amortizações). The rates are the
 * usual ones for these groups, to be confirmed against the decree's tables
 * (a scan, not readable here) by the accountant: **REVIEW**.
 */
export const ASSET_CATEGORIES: Record<string, { name: string; maxRate: number; asset: string; accumulated: string; expense: string }> = {
  BUILDINGS: { name: "Edifícios comerciais e administrativos", maxRate: 4, asset: "11.2", accumulated: "18.1.2", expense: "73.1" },
  MACHINERY: { name: "Máquinas e equipamento básico", maxRate: 12.5, asset: "11.3", accumulated: "18.1.3", expense: "73.1" },
  TOOLS: { name: "Ferramentas e utensílios", maxRate: 25, asset: "11.3", accumulated: "18.1.3", expense: "73.1" },
  LIGHT_VEHICLES: { name: "Viaturas ligeiras", maxRate: 25, asset: "11.4", accumulated: "18.1.4", expense: "73.1" },
  HEAVY_VEHICLES: { name: "Viaturas pesadas e de carga", maxRate: 20, asset: "11.4", accumulated: "18.1.4", expense: "73.1" },
  FURNITURE: { name: "Mobiliário", maxRate: 10, asset: "11.5", accumulated: "18.1.5", expense: "73.1" },
  COMPUTERS: { name: "Equipamento informático", maxRate: 25, asset: "11.5", accumulated: "18.1.5", expense: "73.1" },
  OFFICE_EQUIPMENT: { name: "Equipamento administrativo", maxRate: 12.5, asset: "11.5", accumulated: "18.1.5", expense: "73.1" },
  CONTAINERS: { name: "Taras e vasilhame", maxRate: 20, asset: "11.6", accumulated: "18.1.6", expense: "73.1" },
  SOFTWARE: { name: "Programas de computador", maxRate: 33.33, asset: "12.9", accumulated: "18.2", expense: "73.2" },
  OTHER: { name: "Outras imobilizações corpóreas", maxRate: 10, asset: "11.9", accumulated: "18.1.9", expense: "73.1" },
};

/** The first of the month an asset starts depreciating: the month it was acquired (duodécimos). */
export function depreciationStart(acquisitionDate: string): string {
  return `${acquisitionDate.slice(0, 7)}-01`;
}

/**
 * One month's straight-line depreciation: the depreciable base (value less
 * residual) × rate / 12, never past what's left; nothing before the start
 * month.
 */
export function monthlyDepreciation(
  asset: { acquisitionValue: Prisma.Decimal; residualValue: Prisma.Decimal; annualRate: Prisma.Decimal; depreciationStart: string },
  year: number,
  month: number,
  alreadyDepreciated: Prisma.Decimal,
): Prisma.Decimal {
  const zero = new Prisma.Decimal(0);
  if (`${year}-${String(month).padStart(2, "0")}-01` < asset.depreciationStart) return zero;
  const base = asset.acquisitionValue.minus(asset.residualValue);
  const left = base.minus(alreadyDepreciated);
  if (left.lte(0)) return zero;
  const monthly = base.times(asset.annualRate).div(100).div(12).toDecimalPlaces(2);
  return Prisma.Decimal.min(monthly, left);
}
