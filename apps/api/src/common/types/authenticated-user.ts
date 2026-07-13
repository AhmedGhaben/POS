import { Role } from "@prisma/client";

/** Shape attached to `req.user` by JwtStrategy after token verification. */
export interface AuthenticatedUser {
  userId: string;
  businessId: string;
  role: Role;
}
