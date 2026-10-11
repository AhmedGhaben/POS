import { Module } from "@nestjs/common";
import { PermissionsModule } from "../common/permissions/permissions.module";
import { TerminalsController } from "./terminals.controller";
import { TerminalsService } from "./terminals.service";

@Module({
  imports: [PermissionsModule],
  controllers: [TerminalsController],
  providers: [TerminalsService],
})
export class TerminalsModule {}
