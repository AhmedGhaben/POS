import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { TERMINAL_KEY_HEADER } from "./till-auth.service";

/**
 * The till key the request came with (the Windows app adds it to every
 * request), or undefined from a browser. Resolve it with
 * TillAuthService.tillFor(): only an active till of the caller's business
 * counts.
 */
export const TillKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): unknown => {
  return ctx.switchToHttp().getRequest().headers?.[TERMINAL_KEY_HEADER];
});
