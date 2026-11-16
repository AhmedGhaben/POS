import { Module } from "@nestjs/common";
import { PermissionsModule } from "../common/permissions/permissions.module";
import { TerminalsController } from "./terminals.controller";
import { StoreStatusController } from "./store-status.controller";
import { TerminalStatusService } from "./terminal-status.service";
import { TerminalsService } from "./terminals.service";

@Module({
  imports: [PermissionsModule],
  controllers: [TerminalsController, StoreStatusController],
  providers: [TerminalsService, TerminalStatusService],
})
export class TerminalsModule {}
