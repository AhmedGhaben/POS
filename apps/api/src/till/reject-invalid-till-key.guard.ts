import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { keyWasSent, TERMINAL_KEY_HEADER, TillAuthService } from "./till-auth.service";

/**
 * For managing tills (register, pairing codes, new key, switch on/off): a
 * request that carries a till key that no longer counts (malformed, revoked,
 * the till withdrawn) comes from a withdrawn till, and is refused. Otherwise
 * a session saved on that till could give it a new key or switch it back on
 * by itself. Browsers send no key and are unchanged; the till recovers
 * through a manager or by being set up again (docs/security/TILL_PIN_LOCK.md).
 */
@Injectable()
export class RejectInvalidTillKeyGuard implements CanActivate {
  constructor(private readonly till: TillAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = context.switchToHttp().getRequest().headers?.[TERMINAL_KEY_HEADER];
    if (keyWasSent(key) && !(await this.till.terminalForKey(key))) {
      throw new ForbiddenException("This till isn't registered any more");
    }
    return true;
  }
}
