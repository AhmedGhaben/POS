import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import { TERMINAL_KEY_HEADER, TillAuthService, type TillTerminal } from "../../till/till-auth.service";

/** A till's budget on routes without their own limit, against 100/min per IP for everyone else. */
export const TILL_DEFAULT_LIMIT = 600;
const KEY_CACHE_MS = 60_000;
const KEY_CACHE_SIZE = 500;

/**
 * The global rate limit, with registered tills counted by till rather than
 * by IP: a shop's tills share one public IP, so a busy shop would otherwise
 * hit the per-IP limit and its tills start failing. A request with a valid
 * X-Terminal-Key gets its own bucket, and a larger one on routes that don't
 * set a stricter limit of their own (login and the like keep theirs).
 */
@Injectable()
export class TillThrottlerGuard extends ThrottlerGuard {
  private readonly keys = new Map<string, { terminal: TillTerminal | null; until: number }>();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly till: TillAuthService,
  ) {
    super(options, storage, reflector);
  }

  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const { req } = this.getRequestResponse(props.context);
    const terminal = await this.terminalFor(req.headers?.[TERMINAL_KEY_HEADER]);
    if (!terminal) return super.handleRequest(props);

    const ownLimit = this.reflector.getAllAndOverride<unknown>(`THROTTLER:LIMIT${props.throttler.name ?? "default"}`, [
      props.context.getHandler(),
      props.context.getClass(),
    ]);
    return super.handleRequest({
      ...props,
      limit: ownLimit === undefined ? Math.max(props.limit, TILL_DEFAULT_LIMIT) : props.limit,
      getTracker: async () => `terminal:${terminal.id}`,
    });
  }

  /** The till a key belongs to, remembered for a minute so each request isn't a lookup. */
  private async terminalFor(key: unknown): Promise<TillTerminal | null> {
    if (typeof key !== "string" || !key) return null;
    const now = Date.now();
    const cached = this.keys.get(key);
    if (cached && cached.until > now) return cached.terminal;
    const terminal = await this.till.terminalForKey(key);
    if (this.keys.size >= KEY_CACHE_SIZE) this.keys.clear();
    this.keys.set(key, { terminal, until: now + KEY_CACHE_MS });
    return terminal;
  }
}
