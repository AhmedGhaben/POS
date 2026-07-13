import { SetMetadata } from "@nestjs/common";
import { Permission } from "@prisma/client";

export const PERMISSION_KEY = "requiredPermission";

export const RequiresPermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
