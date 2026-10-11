import { Global, Module } from "@nestjs/common";
import { TillAuthService } from "./till-auth.service";
import { TerminalKeyGuard } from "./terminal-key.guard";

/** Global: the app-wide JwtAuthGuard uses it for uploads from tills. */
@Global()
@Module({
  providers: [TillAuthService, TerminalKeyGuard],
  exports: [TillAuthService, TerminalKeyGuard],
})
export class TillAuthModule {}
