import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";
import { lastValueFrom, type Observable } from "rxjs";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { TILL_UPLOAD_KEY } from "../../till/terminal-key.guard";
import { TERMINAL_KEY_HEADER, TillAuthService } from "../../till/till-auth.service";

/**
 * Applied globally in AppModule; routes marked @Public() (e.g. login) skip
 * it. On @TillUpload() routes, a till's key plus `actingUserId` stands in
 * for a session (see TillUpload).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(
    private readonly reflector: Reflector,
    private readonly till: TillAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const key = request.headers?.[TERMINAL_KEY_HEADER];
    const actingUserId = request.body?.actingUserId;
    if (this.reflector.getAllAndOverride<boolean>(TILL_UPLOAD_KEY, targets) && key && actingUserId) {
      const { user, terminal } = await this.till.actingUser(key, actingUserId);
      request.user = user;
      request.terminal = terminal;
      return true;
    }

    const result = super.canActivate(context) as boolean | Promise<boolean> | Observable<boolean>;
    return typeof result === "boolean" ? result : result instanceof Promise ? result : lastValueFrom(result);
  }
}
