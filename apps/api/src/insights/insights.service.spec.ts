import { ServiceUnavailableException } from "@nestjs/common";
import { InsightsService } from "./insights.service";

const PARSED_OUTPUT = {
  summary: "Revenue held steady at $500 with 20 orders.",
  highlights: [],
  restockSuggestions: [],
};

function buildReportsMock() {
  return {
    summary: jest.fn().mockResolvedValue({ revenue: 500, profit: 200, orderCount: 20 }),
    salesTrend: jest.fn().mockResolvedValue([{ date: "2026-01-01", revenue: 500, orderCount: 20 }]),
    topProducts: jest.fn().mockResolvedValue([{ productId: "p1", name: "Widget", quantitySold: 10, revenue: 100 }]),
    lowStock: jest
      .fn()
      .mockResolvedValue([{ product: { name: "Widget" }, quantity: 1, reorderLevel: 5 }]),
  };
}

describe("InsightsService#generate", () => {
  it("throws ServiceUnavailableException when no Anthropic client is configured", async () => {
    const service = new InsightsService(buildReportsMock() as any, null);

    await expect(service.generate("store-1", 30)).rejects.toThrow(ServiceUnavailableException);
  });

  it("gathers report data and returns the parsed structured output", async () => {
    const reports = buildReportsMock();
    const parse = jest.fn().mockResolvedValue({ parsed_output: PARSED_OUTPUT });
    const anthropic = { messages: { parse } };

    const service = new InsightsService(reports as any, anthropic as any);
    const result = await service.generate("store-1", 14);

    expect(reports.summary).toHaveBeenCalledWith("store-1", 14);
    expect(reports.salesTrend).toHaveBeenCalledWith("store-1", 14);
    expect(reports.topProducts).toHaveBeenCalledWith("store-1", 14, 5);
    expect(reports.lowStock).toHaveBeenCalledWith("store-1");

    expect(parse).toHaveBeenCalledTimes(1);
    const call = parse.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-8");
    const userContent = call.messages[0].content as string;
    expect(userContent).toContain("Widget");
    expect(userContent).toContain('"periodDays":14');

    expect(result).toEqual(PARSED_OUTPUT);
  });

  it("throws when the model returns no parsed output", async () => {
    const reports = buildReportsMock();
    const anthropic = { messages: { parse: jest.fn().mockResolvedValue({ parsed_output: null }) } };
    const service = new InsightsService(reports as any, anthropic as any);

    await expect(service.generate("store-1", 30)).rejects.toThrow(ServiceUnavailableException);
  });
});
