import { Role } from "@prisma/client";

/**
 * Who does what in Contabilidade (docs/ACCOUNTING-DECISIONS.md, decision
 * 21): the owner and their accountants keep the books; managers read the reports.
 */
export const ACCOUNTING_READ: Role[] = [Role.OWNER, Role.MANAGER, Role.ACCOUNTANT];
export const ACCOUNTING_WRITE: Role[] = [Role.OWNER, Role.ACCOUNTANT];
