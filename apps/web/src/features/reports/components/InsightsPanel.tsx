import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateInsights } from "@/features/reports/api";
import { ApiError } from "@/lib/api-client";

interface InsightsPanelProps {
  storeId: string;
  days: number;
}

/** On-demand, not auto-loaded — this calls an LLM on every click, so it
 * shouldn't fire automatically on every dashboard visit or period change. */
export function InsightsPanel({ storeId, days }: InsightsPanelProps) {
  const mutation = useMutation({
    mutationFn: () => generateInsights(storeId, days),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">AI insights</h2>
            <p className="text-sm text-muted-foreground">
              A plain-English read on this period's numbers, generated on demand.
            </p>
          </div>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            {mutation.isPending ? "Generating..." : mutation.data ? "Regenerate" : "Generate insights"}
          </Button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Unable to generate insights."}
          </p>
        )}

        {mutation.data && (
          <div className="space-y-4">
            <p className="text-sm">{mutation.data.summary}</p>

            {mutation.data.highlights.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-medium">Highlights</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {mutation.data.highlights.map((highlight, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{highlight.title}:</span>{" "}
                      {highlight.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mutation.data.restockSuggestions.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-medium">Restock suggestions</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {mutation.data.restockSuggestions.map((suggestion, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{suggestion.productName}:</span>{" "}
                      {suggestion.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
