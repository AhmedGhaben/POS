import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { anthropicClientProvider } from "./anthropic-client.provider";
import { InsightsController } from "./insights.controller";
import { InsightsService } from "./insights.service";

@Module({
  imports: [ReportsModule],
  controllers: [InsightsController],
  providers: [InsightsService, anthropicClientProvider],
})
export class InsightsModule {}
