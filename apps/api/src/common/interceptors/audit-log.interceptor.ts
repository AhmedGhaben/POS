import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { Observable, tap } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../types/authenticated-user";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const REDACTED_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "passwordHash",
  "token",
  "refreshToken",
  "accessToken",
  "tokenHash",
]);

function redact(body: unknown): Prisma.InputJsonValue | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const entries = Object.entries(body as Record<string, unknown>).map(([key, value]) =>
    REDACTED_KEYS.has(key) ? [key, "[redacted]"] : [key, value],
  );
  return Object.fromEntries(entries) as Prisma.InputJsonValue;
}

/**
 * Records who-did-what for every mutating request into AuditLog. Applied
 * globally so new endpoints are covered automatically — no per-service
 * instrumentation needed. Logging failures never break the actual request.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        void this.record(req, responseBody);
      }),
    );
  }

  private async record(req: Request, responseBody: unknown) {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    let userId = user?.userId;
    let businessId = user?.businessId;

    // Public mutating routes (e.g. login) have no req.user yet — recover
    // businessId from the response body when it's shaped like a login result.
    if (!businessId && responseBody && typeof responseBody === "object") {
      const nestedUser = (responseBody as Record<string, unknown>).user as
        | Record<string, unknown>
        | undefined;
      if (typeof nestedUser?.businessId === "string") {
        businessId = nestedUser.businessId;
        userId = (nestedUser.id as string | undefined) ?? userId;
      }
    }
    // Can't attribute to a business (refresh/logout/forgot-password/reset-password) — skip.
    if (!businessId) return;

    const routePath = req.route?.path ?? req.path ?? req.url;
    const entityType = routePath.split("/").filter(Boolean)[0] ?? "unknown";
    const entityId =
      responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
        ? ((responseBody as Record<string, unknown>).id as string | undefined)
        : undefined;

    try {
      await this.prisma.auditLog.create({
        data: {
          businessId,
          userId,
          action: `${req.method} ${routePath}`,
          entityType,
          entityId,
          metadata: redact(req.body),
          ipAddress: req.ip,
        },
      });
    } catch {
      // Never let audit logging break the actual request.
    }
  }
}
