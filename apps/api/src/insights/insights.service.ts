import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ReportsService } from "../reports/reports.service";
import { ANTHROPIC_CLIENT } from "./anthropic-client.provider";

const InsightsSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence plain-English summary of how the store performed this period"),
  highlights: z
    .array(
      z.object({
        title: z.string().describe("Short label, e.g. 'Revenue dip mid-period'"),
        detail: z.string().describe("1-2 sentences citing the specific numbers involved"),
      }),
    )
    .max(4)
    .describe("Notable patterns or anomalies actually present in the data — not generic advice"),
  restockSuggestions: z
    .array(
      z.object({
        productName: z.string(),
        reason: z.string().describe("Why this product, e.g. sales velocity vs. remaining stock"),
      }),
    )
    .max(5)
    .describe("Products worth restocking soon, based only on the low-stock and top-products data given"),
});

export type BusinessInsights = z.infer<typeof InsightsSchema>;

const SYSTEM_PROMPT = `You are a retail business analyst producing a short, plain-English \
briefing for a busy store owner from their point-of-sale data. Reference specific numbers \
from the data provided. Do not invent figures, trends, or products that aren't in the input. \
If nothing noteworthy stands out, say so plainly rather than manufacturing an anomaly.`;

@Injectable()
export class InsightsService {
  constructor(
    private readonly reports: ReportsService,
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic | null,
  ) {}

  async generate(storeId: string, days: number): Promise<BusinessInsights> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException(
        "AI insights are not configured — set ANTHROPIC_API_KEY on the server.",
      );
    }

    const [summary, salesTrend, topProducts, lowStock] = await Promise.all([
      this.reports.summary(storeId, days),
      this.reports.salesTrend(storeId, days),
      this.reports.topProducts(storeId, days, 5),
      this.reports.lowStock(storeId),
    ]);

    const payload = {
      periodDays: days,
      summary,
      salesTrend,
      topProducts,
      lowStock: lowStock.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        reorderLevel: item.reorderLevel,
      })),
    };

    const response = await this.anthropic.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: zodOutputFormat(InsightsSchema),
      },
      messages: [
        {
          role: "user",
          content: `Here is the store's data for the last ${days} days:\n\n${JSON.stringify(payload)}`,
        },
      ],
    });

    if (!response.parsed_output) {
      throw new ServiceUnavailableException("AI insights generation failed — please try again.");
    }
    return response.parsed_output;
  }
}
