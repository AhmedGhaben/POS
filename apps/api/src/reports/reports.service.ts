import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface PeriodTotals {
  revenue: number;
  orderCount: number;
  profit: number;
}

export interface SalesTrendRow {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface StoreComparisonRow {
  storeId: string;
  storeName: string;
  revenue: number;
  profit: number;
  orderCount: number;
}

function calcDeltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async periodTotals(storeId: string, start: Date, end: Date): Promise<PeriodTotals> {
    const rows = await this.prisma.$queryRaw<PeriodTotals[]>(Prisma.sql`
      WITH line_profit AS (
        SELECT sli."saleId" as sale_id,
               SUM(sli.quantity * (sli."unitPrice" - p."costPrice"))::float8 as profit
        FROM sale_line_items sli
        JOIN products p ON p.id = sli."productId"
        GROUP BY sli."saleId"
      )
      SELECT
        COALESCE(SUM(s.subtotal), 0)::float8 as revenue,
        COUNT(DISTINCT s.id)::int as "orderCount",
        COALESCE(SUM(lp.profit), 0)::float8 as profit
      FROM sales s
      LEFT JOIN line_profit lp ON lp.sale_id = s.id
      WHERE s."storeId" = ${storeId}
        AND s.status = 'COMPLETED'
        AND s."createdAt" >= ${start}
        AND s."createdAt" < ${end}
    `);
    return rows[0] ?? { revenue: 0, orderCount: 0, profit: 0 };
  }

  async summary(storeId: string, days = 30) {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

    const [current, previous] = await Promise.all([
      this.periodTotals(storeId, periodStart, now),
      this.periodTotals(storeId, previousPeriodStart, periodStart),
    ]);

    const avgOrderValue = current.orderCount > 0 ? current.revenue / current.orderCount : 0;
    const previousAvgOrderValue = previous.orderCount > 0 ? previous.revenue / previous.orderCount : 0;

    return {
      revenue: current.revenue,
      profit: current.profit,
      orderCount: current.orderCount,
      avgOrderValue,
      revenueDeltaPct: calcDeltaPct(current.revenue, previous.revenue),
      profitDeltaPct: calcDeltaPct(current.profit, previous.profit),
      orderCountDeltaPct: calcDeltaPct(current.orderCount, previous.orderCount),
      avgOrderValueDeltaPct: calcDeltaPct(avgOrderValue, previousAvgOrderValue),
    };
  }

  async salesTrend(storeId: string, days = 30) {
    return this.prisma.$queryRaw<SalesTrendRow[]>(Prisma.sql`
      SELECT
        to_char(gs, 'YYYY-MM-DD') as date,
        COALESCE(SUM(s.subtotal), 0)::float8 as revenue,
        COUNT(DISTINCT s.id)::int as "orderCount"
      FROM generate_series(
        (CURRENT_DATE - ((${days}::int) - 1)), CURRENT_DATE, interval '1 day'
      ) AS gs
      LEFT JOIN sales s
        ON s."storeId" = ${storeId}
        AND s.status = 'COMPLETED'
        AND s."createdAt"::date = gs::date
      GROUP BY gs
      ORDER BY gs
    `);
  }

  async topProducts(storeId: string, days = 30, limit = 5) {
    return this.prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
      SELECT
        p.id as "productId",
        p.name,
        SUM(sli.quantity)::int as "quantitySold",
        SUM(sli."lineTotal")::float8 as revenue
      FROM sale_line_items sli
      JOIN sales s ON s.id = sli."saleId"
      JOIN products p ON p.id = sli."productId"
      WHERE s."storeId" = ${storeId}
        AND s.status = 'COMPLETED'
        AND s."createdAt" >= (now() - (${days}::int) * interval '1 day')
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT (${limit}::int)
    `);
  }

  async lowStock(storeId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { storeId },
      include: { product: true },
      orderBy: { quantity: "asc" },
    });
    return items.filter((item) => item.quantity <= item.reorderLevel);
  }

  async storeComparison(businessId: string, days = 30) {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRaw<StoreComparisonRow[]>(Prisma.sql`
      WITH line_profit AS (
        SELECT sli."saleId" as sale_id,
               SUM(sli.quantity * (sli."unitPrice" - p."costPrice"))::float8 as profit
        FROM sale_line_items sli
        JOIN products p ON p.id = sli."productId"
        GROUP BY sli."saleId"
      )
      SELECT
        st.id as "storeId",
        st.name as "storeName",
        COALESCE(SUM(s.subtotal), 0)::float8 as revenue,
        COALESCE(SUM(lp.profit), 0)::float8 as profit,
        COUNT(DISTINCT s.id)::int as "orderCount"
      FROM stores st
      LEFT JOIN sales s
        ON s."storeId" = st.id
        AND s.status = 'COMPLETED'
        AND s."createdAt" >= ${start}
      LEFT JOIN line_profit lp ON lp.sale_id = s.id
      WHERE st."businessId" = ${businessId} AND st."isActive" = true
      GROUP BY st.id, st.name
      ORDER BY revenue DESC
    `);
  }
}
