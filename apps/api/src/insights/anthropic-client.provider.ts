import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export const ANTHROPIC_CLIENT = "ANTHROPIC_CLIENT";

/** `null` when ANTHROPIC_API_KEY isn't configured — InsightsService turns that
 * into a clear "not configured" error instead of a confusing SDK crash. */
export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (config: ConfigService): Anthropic | null => {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY");
    return apiKey ? new Anthropic({ apiKey }) : null;
  },
  inject: [ConfigService],
};
