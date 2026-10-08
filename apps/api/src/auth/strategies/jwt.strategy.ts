import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PrismaService } from "../../prisma/prisma.service";

interface AccessTokenPayload {
  sub: string;
  businessId: string;
  role: AuthenticatedUser["role"];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET")!,
    });
  }

  /**
   * Looks the user up on every request (one primary-key query) so that an
   * owner deactivating someone, or changing their role, takes effect
   * immediately rather than when the 30-minute access token expires.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, businessId: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }
    return { userId: user.id, businessId: user.businessId, role: user.role };
  }
}
