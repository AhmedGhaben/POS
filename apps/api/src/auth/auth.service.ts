import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Plan, Role, User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { emailLanguage, type Language } from "../common/i18n/languages";
import { countryConfig } from "../countries";
import { parseDurationMs } from "../common/utils/duration";
import { generateOpaqueToken, hashToken } from "../common/utils/tokens";
import { normalizeEmail } from "../common/transforms/normalize-email";
import { RegisterDto } from "./dto/register.dto";
import { BusinessSettings, toBusinessSettings } from "../businesses/businesses.service";
import { checkPinAttempt } from "../common/utils/pin-attempts";
import { finalConsumerData } from "../customers/final-consumer";
import { TillAuthService, type TillTerminal } from "../till/till-auth.service";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
/** Same cost as UsersService and resetPassword. */
const SALT_ROUNDS = 12;
/** How long after an offline PIN check the till may pick the session up. */
const PIN_RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    businessId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    emailVerified: boolean;
    language: string | null;
    displaySize: number | null;
    accessibleStoreIds: string[];
  };
  stores: { id: string; businessId: string; name: string; address: string | null; timezone: string; isActive: boolean }[];
  /** Cached by the web app so the offline POS knows currency and receipt details. */
  business: BusinessSettings;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly till: TillAuthService,
  ) {}

  private signAccessToken(user: { id: string; businessId: string; role: Role }, businessId = user.businessId): string {
    return this.jwt.sign(
      { sub: user.id, businessId, role: user.role },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "30m",
      },
    );
  }

  private async issueRefreshToken(userId: string, businessId: string | null = null): Promise<string> {
    const rawToken = generateOpaqueToken();
    const ttlMs = parseDurationMs(this.config.get<string>("JWT_REFRESH_TTL") ?? "30d");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        businessId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return rawToken;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.role === Role.ACCOUNTANT) return this.buildSession(user, await this.accountantBusiness(user.id, user.businessId));
    return this.buildSession(user);
  }

  /**
   * The client an accountant works in: the one asked for, if it still gives
   * them access; else their first client. Invitations not accepted yet don't count.
   */
  private async accountantBusiness(userId: string, preferred: string | null): Promise<string> {
    const access = await this.prisma.accountantAccess.findMany({ where: { userId, revokedAt: null, acceptedAt: { not: null } }, orderBy: { createdAt: "asc" }, select: { businessId: true } });
    if (!access.length) {
      const invited = await this.prisma.accountantAccess.count({ where: { userId, revokedAt: null, acceptedAt: null } });
      throw new UnauthorizedException(invited ? "Accept the invitation from your email first" : "No company has given you access");
    }
    return access.find((a) => a.businessId === preferred)?.businessId ?? access[0].businessId;
  }

  /** An accountant moves to another of their clients: a new session there. */
  async switchBusiness(userId: string, businessId: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.role !== Role.ACCOUNTANT) throw new UnauthorizedException("Only accountants switch between companies");
    const access = await this.prisma.accountantAccess.findFirst({ where: { userId, businessId, revokedAt: null } });
    if (!access) throw new UnauthorizedException("No company has given you access");
    if (!access.acceptedAt) throw new UnauthorizedException("Accept this company's invitation first");
    return this.buildSession(user, businessId);
  }

  /**
   * Signs someone in on a registered till with their PIN. Five wrong PINs in
   * a row lock that person's PIN for a few minutes.
   */
  async pinLogin(terminal: TillTerminal, userId: string, pin: string): Promise<LoginResult> {
    const user = await this.tillUser(terminal, userId);
    await checkPinAttempt(this.prisma, user, pin);
    return this.buildSession(user);
  }

  /**
   * The till checked this person's PIN while it was offline; now the server
   * is back, it gets them a session. Only for a recent check, and only if
   * they can still use the till.
   */
  async resumeTillSession(terminal: TillTerminal, userId: string, verifiedAt: string): Promise<LoginResult> {
    const at = new Date(verifiedAt).getTime();
    const now = Date.now();
    if (Number.isNaN(at) || at > now + 5 * 60 * 1000 || now - at > PIN_RESUME_WINDOW_MS) {
      throw new UnauthorizedException("Sign in again with your PIN");
    }
    return this.buildSession(await this.tillUser(terminal, userId));
  }

  /** Someone who may sign in on this till with a PIN. */
  private async tillUser(terminal: TillTerminal, userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, businessId: terminal.businessId } });
    if (!user || !user.isActive || !user.pinHash) throw new UnauthorizedException("Wrong PIN");
    if (!(await this.till.canUseStore(user, terminal.storeId))) {
      throw new ForbiddenException("You don't have access to this till's store");
    }
    return user;
  }

  /**
   * Creates a Business, its first Store and the OWNER user in one transaction,
   * then logs the owner straight in. Owners see every store in their business,
   * so no StoreUser row is needed (same as login).
   */
  async register(dto: RegisterDto): Promise<LoginResult> {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Email already in use");
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      // Currency, language, time zone and IVA regime come from the country
      // (Angola: AOA, pt-AO, Africa/Luanda, Regime Geral).
      const country = countryConfig(dto.country ?? "AO");
      const business = await tx.business.create({
        data: {
          name: dto.businessName.trim(),
          plan: Plan.SIMPLE,
          country: country?.code ?? "AO",
          currency: country?.currency ?? "USD",
          language: dto.language ?? country?.defaultLanguage ?? "en",
        },
      });
      // Every sale without a chosen customer goes to "Consumidor Final".
      await tx.customer.create({ data: finalConsumerData(business.id) });
      await tx.store.create({
        data: {
          businessId: business.id,
          name: dto.storeName.trim(),
          timezone: dto.timezone ?? country?.timeZone ?? "UTC",
          country: country?.code ?? "AO",
          ivaRegime: country?.defaultIvaRegime ?? "GERAL",
        },
      });
      return tx.user.create({
        data: {
          businessId: business.id,
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: Role.OWNER,
          language: dto.language ?? null,
        },
      });
    });

    // Best-effort, after commit: a mail outage must not fail sign-up — the
    // owner can resend from the banner in the app.
    try {
      await this.sendVerificationEmail(user, emailLanguage(dto.language, null));
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${user.email}: ${(err as Error).message}`);
    }

    return this.buildSession(user);
  }

  private async buildSession(user: User, businessId = user.businessId): Promise<LoginResult> {
    const [allStores, business] = await Promise.all([
      // Oldest first: the business's first store is the default one.
      this.prisma.store.findMany({ where: { businessId, isActive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    ]);

    let accessibleStoreIds: string[];
    // An accountant reads every store of the client they're in.
    if (user.role === Role.OWNER || user.role === Role.ACCOUNTANT) {
      accessibleStoreIds = allStores.map((s) => s.id);
    } else {
      const storeUsers = await this.prisma.storeUser.findMany({
        where: { userId: user.id },
        select: { storeId: true },
      });
      accessibleStoreIds = storeUsers.map((su) => su.storeId);
    }

    const accessToken = this.signAccessToken(user, businessId);
    const refreshToken = await this.issueRefreshToken(user.id, user.role === Role.ACCOUNTANT ? businessId : null);

    const accessibleStores = allStores.filter((s) => accessibleStoreIds.includes(s.id));

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        businessId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerifiedAt !== null,
        language: user.language,
        displaySize: user.displaySize,
        accessibleStoreIds,
      },
      stores: accessibleStores,
      business: toBusinessSettings(business),
    };
  }

  /**
   * Rotates the refresh token on every use: the presented token is revoked
   * and a new one issued. If a token that was already revoked is presented
   * again, that's a signal of token theft (the old token was exfiltrated and
   * used after the legitimate client rotated past it) — every refresh token
   * for that user is revoked as a precaution.
   */
  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // An accountant stays in the client they were in (while it still gives them access).
    const businessId = user.role === Role.ACCOUNTANT ? await this.accountantBusiness(user.id, stored.businessId) : user.businessId;
    const newRawToken = await this.issueRefreshToken(user.id, user.role === Role.ACCOUNTANT ? businessId : null);
    const newRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(newRawToken) },
    });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenId: newRecord?.id },
    });

    return { accessToken: this.signAccessToken(user, businessId), refreshToken: newRawToken };
  }

  /** Idempotent — always "succeeds" whether or not the token was still valid. */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Always resolves the same way regardless of whether the email exists, to avoid user enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: { business: { select: { language: true } } },
    });
    if (!user || !user.isActive) return;

    const rawToken = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.mail.sendPasswordResetEmail(user.email, rawToken, emailLanguage(user.language, user.business?.language));
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // Force re-login on every device once the password changes.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async sendVerificationEmail(user: Pick<User, "id" | "email" | "firstName">, lang: Language): Promise<void> {
    const rawToken = generateOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    await this.mail.sendEmailVerificationEmail(user.email, user.firstName, rawToken, lang);
  }

  /** No-op when the user is already verified, so a stale banner can't spam emails. */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { business: { select: { language: true } } },
    });
    if (!user || !user.isActive || user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user, emailLanguage(user.language, user.business?.language));
  }

  /**
   * Returns the verified address so the web page can tell whether it matches
   * the account signed in on that browser — the link may be opened while
   * logged in as someone else. Holding the token already proves access to
   * that inbox, so revealing the address leaks nothing.
   */
  async verifyEmail(rawToken: string): Promise<{ email: string }> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { email: true } } },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired verification link");
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: now } }),
      this.prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: now } }),
    ]);
    return { email: stored.user.email };
  }
}
