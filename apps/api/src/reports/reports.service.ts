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

/**
 * Returns per store, made in the period `filter` selects (on returns r):
 * the refund without IVA and the cost of what came back. The refund is the
 * credit note's net total when there is one (as the report tables count
 * it); otherwise the returned lines' share of their sale line without IVA.
 * The cost is the sale's unit cost, as when the goods left.
 */
function returnTotals(filter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    sale_product AS (
      SELECT sli."saleId" AS sale_id, sli."productId" AS product_id,
             SUM(sli."lineTotal" - sli."taxAmount") / NULLIF(SUM(sli."lineTotal"), 0) AS net_ratio,
             SUM(sli.quantity * COALESCE(sli."unitCost", p."costPrice")) / NULLIF(SUM(sli.quantity), 0) AS unit_cost
      FROM sale_line_items sli
      JOIN products p ON p.id = sli."productId"
      GROUP BY sli."saleId", sli."productId"
    ),
    return_lines AS (
      SELECT r.id AS return_id, r."storeId" AS store_id,
             SUM(rli."lineTotal" * COALESCE(sp.net_ratio, 1)) AS line_net,
             SUM(rli.quantity * COALESCE(sp.unit_cost, p."costPrice")) AS cost
      FROM returns r
      JOIN return_line_items rli ON rli."returnId" = r.id
      JOIN products p ON p.id = rli."productId"
      LEFT JOIN sale_product sp ON sp.sale_id = r."saleId" AND sp.product_id = rli."productId"
      WHERE ${filter}
      GROUP BY r.id, r."storeId"
    ),
    return_totals AS (
      SELECT rl.store_id,
             SUM(COALESCE(nc."netTotal", rl.line_net))::float8 AS refund,
             SUM(COALESCE(nc."netTotal", rl.line_net) - rl.cost)::float8 AS profit
      FROM return_lines rl
      LEFT JOIN fiscal_documents nc ON nc."returnId" = rl.return_id AND nc."documentType" = 'NC' AND nc.status <> 'A'
      GROUP BY rl.store_id
    )`;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sales without IVA, less returns in the period (so the dashboard matches the report tables). */
  private async periodTotals(storeId: string, start: Date, end: Date): Promise<PeriodTotals> {
    const rows = await this.prisma.$queryRaw<PeriodTotals[]>(Prisma.sql`
      WITH ${returnTotals(Prisma.sql`r."storeId" = ${storeId} AND r."createdAt" >= ${start} AND r."createdAt" < ${end}`)},
      line_profit AS (
        SELECT sli."saleId" as sale_id,
               SUM(sli."lineTotal" - sli."taxAmount" - sli.quantity * COALESCE(sli."unitCost", p."costPrice"))::float8 as profit
        FROM sale_line_items sli
        JOIN products p ON p.id = sli."productId"
        GROUP BY sli."saleId"
      ),
      sold AS (
        SELECT
          COALESCE(SUM(s.total - s."taxTotal"), 0)::float8 as revenue,
          COUNT(DISTINCT s.id)::int as "orderCount",
          COALESCE(SUM(lp.profit), 0)::float8 as profit
        FROM sales s
        LEFT JOIN line_profit lp ON lp.sale_id = s.id
        WHERE s."storeId" = ${storeId}
          AND s.status = 'COMPLETED'
          AND s."createdAt" >= ${start}
          AND s."createdAt" < ${end}
      )
      SELECT
        (sold.revenue - COALESCE(rt.refund, 0))::float8 as revenue,
        sold."orderCount",
        (sold.profit - COALESCE(rt.profit, 0))::float8 as profit
      FROM sold
      LEFT JOIN return_totals rt ON true
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
        COALESCE(SUM(s.total - s."taxTotal"), 0)::float8 as revenue,
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
        SUM(sli.quantity)::float8 as "quantitySold",
        SUM(sli."lineTotal" - sli."taxAmount")::float8 as revenue
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
    // Only products that track stock (and are still sold) can run low.
    const items = await this.prisma.inventoryItem.findMany({
      where: { storeId, product: { trackStock: true, isActive: true } },
      include: { product: true },
      orderBy: { quantity: "asc" },
    });
    return items.filter((item) => item.quantity.lte(item.reorderLevel));
  }

  /** Each store's sales without IVA, less its returns, over the last `days`. */
  async storeComparison(businessId: string, days = 30) {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRaw<StoreComparisonRow[]>(Prisma.sql`
      WITH ${returnTotals(Prisma.sql`r."createdAt" >= ${start} AND r."storeId" IN (SELECT id FROM stores WHERE "businessId" = ${businessId})`)},
      line_profit AS (
        SELECT sli."saleId" as sale_id,
               SUM(sli."lineTotal" - sli."taxAmount" - sli.quantity * COALESCE(sli."unitCost", p."costPrice"))::float8 as profit
        FROM sale_line_items sli
        JOIN products p ON p.id = sli."productId"
        GROUP BY sli."saleId"
      ),
      sold AS (
        SELECT
          st.id as "storeId",
          st.name as "storeName",
          COALESCE(SUM(s.total - s."taxTotal"), 0)::float8 as revenue,
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
      )
      SELECT
        sold."storeId",
        sold."storeName",
        (sold.revenue - COALESCE(rt.refund, 0))::float8 as revenue,
        (sold.profit - COALESCE(rt.profit, 0))::float8 as profit,
        sold."orderCount"
      FROM sold
      LEFT JOIN return_totals rt ON rt.store_id = sold."storeId"
      ORDER BY revenue DESC
    `);
  }
}
