/**
 * AI insights are off unless AI_INSIGHTS_ENABLED is "true" (or "1"): the
 * feature needs an Anthropic key and isn't offered yet. The app reads the
 * flag from the business settings and hides the button when it's off.
 */
export function aiInsightsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.AI_INSIGHTS_ENABLED;
  return v === "1" || v?.toLowerCase() === "true";
}
