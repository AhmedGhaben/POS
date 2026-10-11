import type { Language } from "./languages";

/**
 * Translations of the messages the API sends back, keyed by the English
 * text the code throws (docs/plans/I18N.md). The exception filter swaps
 * them in using the request's X-Language header; a message missing here
 * stays in English, so adding a new error never breaks anything.
 */
type Translations = Record<Exclude<Language, "en">, string>;

const EXACT: Record<string, Translations> = {
  // Generic
  "Internal server error": { "pt-PT": "Erro interno do servidor", "pt-BR": "Erro interno do servidor" },
  "Forbidden resource": { "pt-PT": "Não tem permissão para fazer isto", "pt-BR": "Você não tem permissão para fazer isso" },
  Unauthorized: { "pt-PT": "Sessão expirada. Inicie sessão novamente.", "pt-BR": "Sessão expirada. Entre novamente." },
  "ThrottlerException: Too Many Requests": {
    "pt-PT": "Demasiados pedidos. Aguarde um momento e tente novamente.",
    "pt-BR": "Muitas solicitações. Aguarde um pouco e tente de novo.",
  },
  "This feature requires the Pro plan": {
    "pt-PT": "Esta funcionalidade requer o plano Pro",
    "pt-BR": "Este recurso exige o plano Pro",
  },
  // Sign-in and accounts
  "Invalid credentials": { "pt-PT": "Email ou palavra-passe incorretos", "pt-BR": "E-mail ou senha incorretos" },
  "Account is deactivated": { "pt-PT": "Esta conta está desativada", "pt-BR": "Esta conta está desativada" },
  "Email already in use": { "pt-PT": "Este email já está a ser usado", "pt-BR": "Este e-mail já está em uso" },
  "Missing refresh token": { "pt-PT": "Sessão expirada. Inicie sessão novamente.", "pt-BR": "Sessão expirada. Entre novamente." },
  "Invalid or expired refresh token": {
    "pt-PT": "Sessão expirada. Inicie sessão novamente.",
    "pt-BR": "Sessão expirada. Entre novamente.",
  },
  "Invalid or expired reset token": {
    "pt-PT": "Este link para repor a palavra-passe é inválido ou expirou",
    "pt-BR": "Este link de redefinição de senha é inválido ou expirou",
  },
  "Invalid or expired verification link": {
    "pt-PT": "Este link de verificação é inválido ou expirou",
    "pt-BR": "Este link de verificação é inválido ou expirou",
  },
  "User not found": { "pt-PT": "Utilizador não encontrado", "pt-BR": "Usuário não encontrado" },
  "Unsupported language": { "pt-PT": "Idioma não suportado", "pt-BR": "Idioma não suportado" },
  // Staff
  "Employee not found": { "pt-PT": "Funcionário não encontrado", "pt-BR": "Funcionário não encontrado" },
  "This employee already has a login": {
    "pt-PT": "Este funcionário já tem acesso",
    "pt-BR": "Este funcionário já tem login",
  },
  "That user already has an employee profile": {
    "pt-PT": "Esse utilizador já tem um perfil de funcionário",
    "pt-BR": "Esse usuário já tem um perfil de funcionário",
  },
  "Only the owner can create logins": {
    "pt-PT": "Só o proprietário pode criar acessos",
    "pt-BR": "Só o proprietário pode criar logins",
  },
  "You can't change your own access": {
    "pt-PT": "Não pode alterar o seu próprio acesso",
    "pt-BR": "Você não pode alterar o seu próprio acesso",
  },
  "Owner access can't be changed": {
    "pt-PT": "O acesso do proprietário não pode ser alterado",
    "pt-BR": "O acesso do proprietário não pode ser alterado",
  },
  "Provide either userId or login, not both": {
    "pt-PT": "Indique um utilizador existente ou um novo acesso, não ambos",
    "pt-BR": "Informe um usuário existente ou um novo login, não os dois",
  },
  "Provide either a password or sendInvite, not both": {
    "pt-PT": "Defina uma palavra-passe ou envie um convite, não ambos",
    "pt-BR": "Defina uma senha ou envie um convite, não os dois",
  },
  "Pick at least one store": { "pt-PT": "Escolha pelo menos uma loja", "pt-BR": "Escolha pelo menos uma loja" },
  // Stores and business
  "Business not found": { "pt-PT": "Empresa não encontrada", "pt-BR": "Empresa não encontrada" },
  "Store not found": { "pt-PT": "Loja não encontrada", "pt-BR": "Loja não encontrada" },
  "Store not found in your business": { "pt-PT": "Loja não encontrada na sua empresa", "pt-BR": "Loja não encontrada na sua empresa" },
  "You do not have access to this store": {
    "pt-PT": "Não tem acesso a esta loja",
    "pt-BR": "Você não tem acesso a esta loja",
  },
  "No access to that store": { "pt-PT": "Não tem acesso a essa loja", "pt-BR": "Você não tem acesso a essa loja" },
  "Unsupported currency": { "pt-PT": "Moeda não suportada", "pt-BR": "Moeda não suportada" },
  "No logo": { "pt-PT": "Sem logótipo", "pt-BR": "Sem logotipo" },
  "Logo must be a PNG, JPEG or WebP image": {
    "pt-PT": "O logótipo tem de ser uma imagem PNG, JPEG ou WebP",
    "pt-BR": "O logotipo deve ser uma imagem PNG, JPEG ou WebP",
  },
  "Logo must be 300 KB or smaller": {
    "pt-PT": "O logótipo tem de ter 300 KB ou menos",
    "pt-BR": "O logotipo deve ter 300 KB ou menos",
  },
  "Logo file doesn't match its image type": {
    "pt-PT": "O ficheiro do logótipo não corresponde ao tipo de imagem",
    "pt-BR": "O arquivo do logotipo não corresponde ao tipo de imagem",
  },
  "Terminal not found": { "pt-PT": "Caixa não encontrada", "pt-BR": "Caixa não encontrado" },
  // Products and stock
  "Product not found": { "pt-PT": "Produto não encontrado", "pt-BR": "Produto não encontrado" },
  "No product with that barcode": {
    "pt-PT": "Não há nenhum produto com esse código de barras",
    "pt-BR": "Nenhum produto com esse código de barras",
  },
  "SKU already exists": { "pt-PT": "Essa referência já existe", "pt-BR": "Esse código já existe" },
  "Category not found": { "pt-PT": "Categoria não encontrada", "pt-BR": "Categoria não encontrada" },
  "Category already exists": { "pt-PT": "Essa categoria já existe", "pt-BR": "Essa categoria já existe" },
  "One or more products were not found": {
    "pt-PT": "Um ou mais produtos não foram encontrados",
    "pt-BR": "Um ou mais produtos não foram encontrados",
  },
  "Choose a store for the Stock column": {
    "pt-PT": "Escolha uma loja para a coluna Stock",
    "pt-BR": "Escolha uma loja para a coluna Estoque",
  },
  "Supplier not found": { "pt-PT": "Fornecedor não encontrado", "pt-BR": "Fornecedor não encontrado" },
  "Source and destination stores must be different": {
    "pt-PT": "A loja de origem e a de destino têm de ser diferentes",
    "pt-BR": "A loja de origem e a de destino devem ser diferentes",
  },
  "One or both stores were not found": {
    "pt-PT": "Uma ou ambas as lojas não foram encontradas",
    "pt-BR": "Uma ou as duas lojas não foram encontradas",
  },
  "fromStoreId and toStoreId are required": {
    "pt-PT": "Indique a loja de origem e a de destino",
    "pt-BR": "Informe a loja de origem e a de destino",
  },
  // Sales, returns, invoices
  "Sale not found": { "pt-PT": "Venda não encontrada", "pt-BR": "Venda não encontrada" },
  "Sale not found for this store": { "pt-PT": "Venda não encontrada nesta loja", "pt-BR": "Venda não encontrada nesta loja" },
  "Payment amounts do not cover the total": {
    "pt-PT": "Os pagamentos não cobrem o total",
    "pt-BR": "Os pagamentos não cobrem o total",
  },
  "Tendered amount is less than the payment amount": {
    "pt-PT": "O valor entregue é inferior ao valor a pagar",
    "pt-BR": "O valor recebido é menor que o valor a pagar",
  },
  "Offline sales need a clientId": {
    "pt-PT": "As vendas sem internet precisam de um identificador",
    "pt-BR": "As vendas sem internet precisam de um identificador",
  },
  "Invoice not found": { "pt-PT": "Fatura não encontrada", "pt-BR": "Fatura não encontrada" },
  "Buyer name is required": {
    "pt-PT": "O nome do comprador é obrigatório",
    "pt-BR": "O nome do comprador é obrigatório",
  },
  "AI insights are not configured — set ANTHROPIC_API_KEY on the server.": {
    "pt-PT": "A análise com IA não está configurada no servidor.",
    "pt-BR": "A análise com IA não está configurada no servidor.",
  },
  "AI insights generation failed — please try again.": {
    "pt-PT": "Não foi possível gerar a análise — tente novamente.",
    "pt-BR": "Não foi possível gerar a análise — tente de novo.",
  },
};

/** Messages with a value inside; `$1` is the captured value. */
const PATTERNS: { re: RegExp; t: Translations }[] = [
  {
    re: /^Insufficient stock for "(.+)" at the source store$/,
    t: { "pt-PT": 'Stock insuficiente de "$1" na loja de origem', "pt-BR": 'Estoque insuficiente de "$1" na loja de origem' },
  },
  {
    re: /^Insufficient stock for "(.+)"$/,
    t: { "pt-PT": 'Stock insuficiente de "$1"', "pt-BR": 'Estoque insuficiente de "$1"' },
  },
  {
    re: /^Product (\S+) was not part of this sale$/,
    t: { "pt-PT": "O produto $1 não fazia parte desta venda", "pt-BR": "O produto $1 não fazia parte desta venda" },
  },
];

export function translateMessage(message: string, lang: Language): string {
  if (lang === "en") return message;
  const exact = EXACT[message];
  if (exact) return exact[lang];
  for (const { re, t } of PATTERNS) {
    const match = message.match(re);
    if (match) return t[lang].replace("$1", match[1]);
  }
  return message;
}

/** For tests: every English message we translate. */
export const TRANSLATED_MESSAGES = Object.keys(EXACT);
