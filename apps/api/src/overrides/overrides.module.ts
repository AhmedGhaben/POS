import { Global, Module } from "@nestjs/common";
import { OverridesController } from "./overrides.controller";
import { OverridesService } from "./overrides.service";

/** Global: the permissions guard and several services accept approvals. */
@Global()
@Module({
  controllers: [OverridesController],
  providers: [OverridesService],
  exports: [OverridesService],
})
export class OverridesModule {}
