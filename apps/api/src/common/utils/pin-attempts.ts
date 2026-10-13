import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { verifyPin } from "./pin";

/** Wrong PINs in a row before that person's PIN is locked for PIN_LOCK_MS. */
export const PIN_MAX_TRIES = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;

/**
 * Checks someone's PIN (signing in on a till, or approving a manager
 * override) and counts wrong tries: five in a row lock it for a few minutes.
 */
export async function checkPinAttempt(
  prisma: PrismaService,
  user: { id: string; pinHash: string | null; pinFailedCount: number; pinLockedUntil: Date | null },
  pin: string,
): Promise<void> {
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    throw new ForbiddenException("Too many wrong PINs. Try again in a few minutes.");
  }
  if (!user.pinHash || !(await verifyPin(pin, user.pinHash))) {
    const failed = user.pinFailedCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data:
        failed >= PIN_MAX_TRIES
          ? { pinFailedCount: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) }
          : { pinFailedCount: failed },
    });
    throw new UnauthorizedException("Wrong PIN");
  }
  if (user.pinFailedCount > 0 || user.pinLockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { pinFailedCount: 0, pinLockedUntil: null } });
  }
}
