import type { Translations } from "./messages";

/** Contabilidade's messages (docs/ACCOUNTING-DECISIONS.md), merged into messages.ts. */
export const ACCOUNTING_EXACT: Record<string, Translations> = {
  "Account codes are the class digit and a second digit (e.g. 31), then parts separated by dots (31.1.2): up to 30 characters": {
    "pt-PT": "O código da conta começa pelo algarismo da classe e um segundo algarismo (ex.: 31), seguidos de partes separadas por pontos (31.1.2): até 30 caracteres",
    "pt-BR": "O código da conta começa pelo dígito da classe e um segundo dígito (ex.: 31), seguidos de partes separadas por pontos (31.1.2): até 30 caracteres",
  },
  "Account not found": { "pt-PT": "Conta não encontrada", "pt-BR": "Conta não encontrada" },
  "That year is out of range": { "pt-PT": "Esse ano não é válido", "pt-BR": "Esse ano não é válido" },
  "Accounting period not found": { "pt-PT": "Período contabilístico não encontrado", "pt-BR": "Período contábil não encontrado" },
  "The year is closed: reopen the year first": { "pt-PT": "O exercício está encerrado: reabra primeiro o exercício", "pt-BR": "O exercício está encerrado: reabra primeiro o exercício" },
  "Entry not found": { "pt-PT": "Lançamento não encontrado", "pt-BR": "Lançamento não encontrado" },
  "Journal not found": { "pt-PT": "Diário não encontrado", "pt-BR": "Diário não encontrado" },
  "Journal codes have no spaces (up to 30 characters)": { "pt-PT": "O código do diário não tem espaços (até 30 caracteres)", "pt-BR": "O código do diário não tem espaços (até 30 caracteres)" },
  "Period 0 holds the opening balances only": { "pt-PT": "O período 0 é só para os saldos de abertura", "pt-BR": "O período 0 é só para os saldos de abertura" },
  "An entry needs at least two lines": { "pt-PT": "Um lançamento precisa de pelo menos duas linhas", "pt-BR": "Um lançamento precisa de pelo menos duas linhas" },
  "This till has no cash account yet: open the missing accounts in the chart of accounts": {
    "pt-PT": "Este terminal ainda não tem conta de caixa: abra as contas em falta no plano de contas",
    "pt-BR": "Este terminal ainda não tem conta de caixa: abra as contas faltantes no plano de contas",
  },
  "This customer has no account yet: open the missing accounts in the chart of accounts": {
    "pt-PT": "Este cliente ainda não tem conta: abra as contas em falta no plano de contas",
    "pt-BR": "Este cliente ainda não tem conta: abra as contas faltantes no plano de contas",
  },
  "This supplier has no account yet: open the missing accounts in the chart of accounts": {
    "pt-PT": "Este fornecedor ainda não tem conta: abra as contas em falta no plano de contas",
    "pt-BR": "Este fornecedor ainda não tem conta: abra as contas faltantes no plano de contas",
  },
  "Template not found": { "pt-PT": "Lançamento pré-definido não encontrado", "pt-BR": "Lançamento pré-definido não encontrado" },
  "Report not found": { "pt-PT": "Relatório não encontrado", "pt-BR": "Relatório não encontrado" },
  "Choose an account": { "pt-PT": "Escolha uma conta", "pt-BR": "Escolha uma conta" },
  "Periods go from 0 to 15, the first before the last": { "pt-PT": "Os períodos vão de 0 a 15, o primeiro antes do último", "pt-BR": "Os períodos vão de 0 a 15, o primeiro antes do último" },
  "Work out the results first: classes 6 and 7 still have balances": { "pt-PT": "Apure primeiro os resultados: as classes 6 e 7 ainda têm saldo", "pt-BR": "Apure primeiro os resultados: as classes 6 e 7 ainda têm saldo" },
  "Unknown mapping key": { "pt-PT": "Chave de mapeamento desconhecida", "pt-BR": "Chave de mapeamento desconhecida" },
  "An entry needs at least one debit and one credit line": { "pt-PT": "Um lançamento precisa de pelo menos uma linha a débito e uma a crédito", "pt-BR": "Um lançamento precisa de pelo menos uma linha a débito e uma a crédito" },
};

/** Messages with values; $1, $2… are the captured values. */
export const ACCOUNTING_PATTERNS: { re: RegExp; t: Translations }[] = [
  {
    re: /^The SAF-T accounting file can't be made yet: (.+)$/,
    t: { "pt-PT": "O ficheiro SAF-T de contabilidade ainda não pode ser gerado: $1 (veja a verificação)", "pt-BR": "O arquivo SAF-T de contabilidade ainda não pode ser gerado: $1 (veja a verificação)" },
  },
  { re: /^Account (\S+) is missing from the chart: open it to work out the results$/, t: { "pt-PT": "Falta a conta $1 no plano: abra-a para apurar os resultados", "pt-BR": "Falta a conta $1 no plano: abra-a para apurar os resultados" } },
  { re: /^The results of (\d+) were already worked out: reverse those entries to do it again$/, t: { "pt-PT": "Os resultados de $1 já foram apurados: estorne esses lançamentos para repetir", "pt-BR": "Os resultados de $1 já foram apurados: estorne esses lançamentos para repetir" } },
  { re: /^There's nothing in classes 6 and 7 for (\d+)$/, t: { "pt-PT": "Não há movimentos nas classes 6 e 7 em $1", "pt-BR": "Não há movimentos nas classes 6 e 7 em $1" } },
  { re: /^Close the months first: (.+) still open$/, t: { "pt-PT": "Feche primeiro os meses: $1 ainda abertos", "pt-BR": "Feche primeiro os meses: $1 ainda abertos" } },
  { re: /^Reopen (\d+) first$/, t: { "pt-PT": "Reabra primeiro $1", "pt-BR": "Reabra primeiro $1" } },
  {
    re: /^The account for (.+) doesn't exist: set it in Contabilidade → Configuração$/,
    t: { "pt-PT": "A conta para $1 não existe: defina-a em Contabilidade → Configuração", "pt-BR": "A conta para $1 não existe: defina-a em Contabilidade → Configuração" },
  },
  {
    re: /^The account for (.+), (\S+), is not a movement account$/,
    t: { "pt-PT": "A conta para $1, $2, não é uma conta de movimento", "pt-BR": "A conta para $1, $2, não é uma conta de movimento" },
  },
  { re: /^The account for (.+), (\S+), is inactive$/, t: { "pt-PT": "A conta para $1, $2, está inactiva", "pt-BR": "A conta para $1, $2, está inativa" } },
  { re: /^No account is set for "(.+)"$/, t: { "pt-PT": 'Não há conta definida para "$1"', "pt-BR": 'Não há conta definida para "$1"' } },
  {
    re: /^(.+): what was paid \((\S+)\) doesn't match the document \((\S+)\)$/,
    t: { "pt-PT": "$1: o valor pago ($2) não corresponde ao documento ($3)", "pt-BR": "$1: o valor pago ($2) não corresponde ao documento ($3)" },
  },
  { re: /^(.+): an invoice on credit needs a customer$/, t: { "pt-PT": "$1: uma factura a crédito precisa de um cliente", "pt-BR": "$1: uma fatura a prazo precisa de um cliente" } },
  { re: /^(.+): a credit note not paid back needs a customer$/, t: { "pt-PT": "$1: uma nota de crédito não reembolsada precisa de um cliente", "pt-BR": "$1: uma nota de crédito não reembolsada precisa de um cliente" } },
  { re: /^(.+): a receipt needs a customer$/, t: { "pt-PT": "$1: um recibo precisa de um cliente", "pt-BR": "$1: um recibo precisa de um cliente" } },
  { re: /^Waiting for (.+), in the same daily summary$/, t: { "pt-PT": "À espera de $1, no mesmo resumo diário", "pt-BR": "Aguardando $1, no mesmo resumo diário" } },
  {
    re: /^(\d+) records of this period aren't posted yet: see the integration monitor$/,
    t: { "pt-PT": "$1 registos deste período ainda não foram lançados: veja o monitor de integração", "pt-BR": "$1 registros deste período ainda não foram lançados: veja o monitor de integração" },
  },
  { re: /^Account (\S+) is inactive$/, t: { "pt-PT": "A conta $1 está inactiva", "pt-BR": "A conta $1 está inativa" } },
  {
    re: /^Account (\S+) is not a movement account: only movement \(GM\) accounts take postings$/,
    t: { "pt-PT": "A conta $1 não é de movimento: só as contas de movimento (GM) aceitam lançamentos", "pt-BR": "A conta $1 não é de movimento: só as contas de movimento (GM) aceitam lançamentos" },
  },
  {
    re: /^Entry (.+) was already reversed by (.+)$/,
    t: { "pt-PT": "O lançamento $1 já foi estornado por $2", "pt-BR": "O lançamento $1 já foi estornado por $2" },
  },
  { re: /^Journal (\S+) is inactive$/, t: { "pt-PT": "O diário $1 está inactivo", "pt-BR": "O diário $1 está inativo" } },
  {
    re: /^Period (\d+)\/(\d+) is closed: nothing can be posted in it$/,
    t: { "pt-PT": "O período $1/$2 está fechado: não se pode lançar nele", "pt-BR": "O período $1/$2 está fechado: não é possível lançar nele" },
  },
  {
    re: /^The posting date (\S+) isn't in period (\d+) of (\d+)$/,
    t: { "pt-PT": "A data do movimento $1 não pertence ao período $2 de $3", "pt-BR": "A data do movimento $1 não pertence ao período $2 de $3" },
  },
  {
    re: /^The year (\d+) is closed: nothing can be posted in it$/,
    t: { "pt-PT": "O exercício $1 está encerrado: não se pode lançar nele", "pt-BR": "O exercício $1 está encerrado: não é possível lançar nele" },
  },
  { re: /^There's already a journal (\S+)$/, t: { "pt-PT": "Já existe o diário $1", "pt-BR": "Já existe o diário $1" } },
  {
    re: /^There's no active journal for (\w+) entries$/,
    t: { "pt-PT": "Não há nenhum diário activo para lançamentos do tipo $1", "pt-BR": "Não há nenhum diário ativo para lançamentos do tipo $1" },
  },
  {
    re: /^The entry doesn't balance: debits (\S+), credits (\S+)$/,
    t: { "pt-PT": "O lançamento não está equilibrado: débitos $1, créditos $2", "pt-BR": "O lançamento não está equilibrado: débitos $1, créditos $2" },
  },
  { re: /^Line (\d+): amounts can't be negative$/, t: { "pt-PT": "Linha $1: os valores não podem ser negativos", "pt-BR": "Linha $1: os valores não podem ser negativos" } },
  { re: /^Line (\d+): amounts have at most two decimals$/, t: { "pt-PT": "Linha $1: os valores têm no máximo duas casas decimais", "pt-BR": "Linha $1: os valores têm no máximo duas casas decimais" } },
  { re: /^Line (\d+): a line is either a debit or a credit$/, t: { "pt-PT": "Linha $1: uma linha é a débito ou a crédito", "pt-BR": "Linha $1: uma linha é a débito ou a crédito" } },
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
