import type { Translations } from "./messages";

/** Contabilidade's messages (docs/ACCOUNTING-DECISIONS.md), merged into messages.ts. */
export const ACCOUNTING_EXACT: Record<string, Translations> = {
  "Account codes are the class digit and a second digit (e.g. 31), then parts separated by dots (31.1.2): up to 30 characters": {
    "pt-PT": "O código da conta começa pelo algarismo da classe e um segundo algarismo (ex.: 31), seguidos de partes separadas por pontos (31.1.2): até 30 caracteres",
    "pt-BR": "O código da conta começa pelo dígito da classe e um segundo dígito (ex.: 31), seguidos de partes separadas por pontos (31.1.2): até 30 caracteres",
  },
  "Account not found": { "pt-PT": "Conta não encontrada", "pt-BR": "Conta não encontrada" },
};

/** Messages with values; $1, $2… are the captured values. */
export const ACCOUNTING_PATTERNS: { re: RegExp; t: Translations }[] = [
  { re: /^There's already an account (\S+)$/, t: { "pt-PT": "Já existe a conta $1", "pt-BR": "Já existe a conta $1" } },
  {
    re: /^Open account (\S+) first: (\S+) goes under it$/,
    t: { "pt-PT": "Abra primeiro a conta $1: a $2 fica sob ela", "pt-BR": "Abra primeiro a conta $1: a $2 fica sob ela" },
  },
  {
    re: /^(\S+) has movements: a movement account can't get sub-accounts$/,
    t: { "pt-PT": "A conta $1 tem movimentos: uma conta de movimento não pode ter subcontas", "pt-BR": "A conta $1 tem movimentos: uma conta de movimento não pode ter subcontas" },
  },
  {
    re: /^(\S+) is kept by the app: it can't get sub-accounts$/,
    t: { "pt-PT": "A conta $1 é gerida pela aplicação: não pode ter subcontas", "pt-BR": "A conta $1 é gerida pelo aplicativo: não pode ter subcontas" },
  },
  { re: /^(\S+) has sub-accounts: remove them first$/, t: { "pt-PT": "A conta $1 tem subcontas: elimine-as primeiro", "pt-BR": "A conta $1 tem subcontas: exclua-as primeiro" } },
  {
    re: /^(\S+) has movements: it can be deactivated, not removed$/,
    t: { "pt-PT": "A conta $1 tem movimentos: pode ser desactivada, não eliminada", "pt-BR": "A conta $1 tem movimentos: pode ser desativada, não excluída" },
  },
  {
    re: /^(\S+) is kept by the app: deactivate it instead$/,
    t: { "pt-PT": "A conta $1 é gerida pela aplicação: desactive-a em vez de a eliminar", "pt-BR": "A conta $1 é gerida pelo aplicativo: desative-a em vez de excluí-la" },
  },
];
