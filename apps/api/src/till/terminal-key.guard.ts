import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { TERMINAL_KEY_HEADER, TillAuthService, type TillTerminal } from "./till-auth.service";

/**
 * For routes only a registered till may call (PIN sign-in, its staff list):
 * the X-Terminal-Key header must belong to an active till. Combine with
 * @Public(), since nobody is signed in yet.
 */
@Injectable()
export class TerminalKeyGuard implements CanActivate {
  constructor(private readonly till: TillAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const terminal = await this.till.terminalForKey(request.headers?.[TERMINAL_KEY_HEADER]);
    if (!terminal) throw new UnauthorizedException("This till isn't registered any more");
    request.terminal = terminal;
    return true;
  }
}

/** The till that called, set by TerminalKeyGuard (or a till upload). */
export const CurrentTerminal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TillTerminal => ctx.switchToHttp().getRequest().terminal,
);

export const TILL_UPLOAD_KEY = "tillUpload";

/**
 * Queued work from a till (sales, cancels, drawer openings) may upload with
 * the till's key and an `actingUserId` instead of a session: it's recorded
 * under the person who was on the till, even if someone else is signed in
 * now, or nobody is.
 */
export const TillUpload = () => SetMetadata(TILL_UPLOAD_KEY, true);
