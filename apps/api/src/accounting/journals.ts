import { JournalKind } from "@prisma/client";

/**
 * The default diários (docs/ACCOUNTING-DECISIONS.md, step A3). The code is
 * the SAF-T JournalID. The integration and the year-end post in them.
 */
export const DEFAULT_JOURNALS: { code: string; name: string; kind: JournalKind }[] = [
  { code: "VEN", name: "Vendas", kind: JournalKind.SALES },
  { code: "COM", name: "Compras", kind: JournalKind.PURCHASES },
  { code: "CXA", name: "Caixa", kind: JournalKind.CASH },
  { code: "BCO", name: "Bancos", kind: JournalKind.BANK },
  { code: "OPD", name: "Operações diversas", kind: JournalKind.GENERAL },
  { code: "ABE", name: "Abertura", kind: JournalKind.OPENING },
  { code: "APU", name: "Apuramento de resultados", kind: JournalKind.CLOSING },
  { code: "SAL", name: "Salários", kind: JournalKind.PAYROLL },
];

/** Where an entry made by the app goes (the first active journal of that kind). */
export type SystemJournal = JournalKind;
