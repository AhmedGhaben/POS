import type { Language, TranslatedLanguage } from "./languages";
import { aoSpelling } from "./ao-spelling";

/**
 * Translations of the messages the API sends back, keyed by the English
 * text the code throws (docs/plans/I18N.md). The exception filter swaps
 * them in using the request's X-Language header; a message missing here
 * stays in English, so adding a new error never breaks anything.
 */
type Translations = Record<TranslatedLanguage, string>;

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
  "Wrong PIN": { "pt-PT": "PIN errado", "pt-BR": "PIN incorreto" },
  "Wrong password": { "pt-PT": "Palavra-passe errada", "pt-BR": "Senha incorreta" },
  "A PIN is 4 to 6 digits": { "pt-PT": "O PIN tem 4 a 6 algarismos", "pt-BR": "O PIN tem de 4 a 6 dígitos" },
  "Too many wrong PINs. Try again in a few minutes.": {
    "pt-PT": "Demasiados PIN errados. Tente novamente daqui a alguns minutos.",
    "pt-BR": "Muitos PINs incorretos. Tente de novo em alguns minutos.",
  },
  "Sign in again with your PIN": { "pt-PT": "Inicie sessão novamente com o seu PIN", "pt-BR": "Entre novamente com o seu PIN" },
  "You don't have access to this till's store": {
    "pt-PT": "Não tem acesso à loja desta caixa",
    "pt-BR": "Você não tem acesso à loja deste caixa",
  },
  "That till code isn't valid or has expired": {
    "pt-PT": "Esse código da caixa não é válido ou expirou",
    "pt-BR": "Esse código do caixa não é válido ou expirou",
  },
  "This till isn't registered any more": {
    "pt-PT": "Esta caixa já não está registada",
    "pt-BR": "Este caixa não está mais registrado",
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
  "You don't have permission to give discounts": {
    "pt-PT": "Não tem permissão para fazer descontos",
    "pt-BR": "Você não tem permissão para dar descontos",
  },
  "A percentage discount can't be more than 100%": {
    "pt-PT": "Um desconto em percentagem não pode ser superior a 100%",
    "pt-BR": "Um desconto percentual não pode ser maior que 100%",
  },
  "Shift not found": { "pt-PT": "Turno não encontrado", "pt-BR": "Turno não encontrado" },
  "This shift is closed": { "pt-PT": "Este turno está fechado", "pt-BR": "Este turno está fechado" },
  "This till already has an open shift": {
    "pt-PT": "Esta caixa já tem um turno aberto",
    "pt-BR": "Este caixa já tem um turno aberto",
  },
  "This sale's shift is closed. Use Returns instead.": {
    "pt-PT": "O turno desta venda está fechado. Use as Devoluções.",
    "pt-BR": "O turno desta venda está fechado. Use as Devoluções.",
  },
  "Say which sale to cancel": { "pt-PT": "Indique a venda a anular", "pt-BR": "Informe a venda a cancelar" },
  "This sale was cancelled": { "pt-PT": "Esta venda foi anulada", "pt-BR": "Esta venda foi cancelada" },
  "This sale has a return, so it can't be cancelled. Use Returns instead.": {
    "pt-PT": "Esta venda tem uma devolução, por isso não pode ser anulada. Use as Devoluções.",
    "pt-BR": "Esta venda tem uma devolução, por isso não pode ser cancelada. Use as Devoluções.",
  },
  "An invoice was issued for this sale, so it can't be cancelled": {
    "pt-PT": "Foi emitida uma fatura para esta venda, por isso não pode ser anulada",
    "pt-BR": "Foi emitida uma fatura para esta venda, por isso não pode ser cancelada",
  },
  "Sales older than 24 hours can't be cancelled. Use Returns instead.": {
    "pt-PT": "As vendas com mais de 24 horas não podem ser anuladas. Use as Devoluções.",
    "pt-BR": "Vendas com mais de 24 horas não podem ser canceladas. Use as Devoluções.",
  },
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
  "Customer not found": { "pt-PT": "Cliente não encontrado", "pt-BR": "Cliente não encontrado" },
  // Company data (country config)
  "Unknown legal form": { "pt-PT": "Forma jurídica desconhecida", "pt-BR": "Natureza jurídica desconhecida" },
  "Unknown province": { "pt-PT": "Província desconhecida", "pt-BR": "Província desconhecida" },
  "Use only letters and numbers": { "pt-PT": "Use só letras e números", "pt-BR": "Use só letras e números" },
  "Unsupported country": { "pt-PT": "País não suportado", "pt-BR": "País não suportado" },
  "Use a two-letter country code": {
    "pt-PT": "Use o código do país com duas letras",
    "pt-BR": "Use o código do país com duas letras",
  },
  "Type the bank's name": { "pt-PT": "Escreva o nome do banco", "pt-BR": "Digite o nome do banco" },
  "Unknown bank": { "pt-PT": "Banco desconhecido", "pt-BR": "Banco desconhecido" },
  "This IBAN isn't valid": { "pt-PT": "Este IBAN não é válido", "pt-BR": "Este IBAN não é válido" },
  "Bank account not found": { "pt-PT": "Conta bancária não encontrada", "pt-BR": "Conta bancária não encontrada" },
  "Unknown tax region": { "pt-PT": "Região fiscal desconhecida", "pt-BR": "Região fiscal desconhecida" },
  "Tax rate not found": { "pt-PT": "Taxa não encontrada", "pt-BR": "Alíquota não encontrada" },
  "The default rate can't be turned off": {
    "pt-PT": "A taxa por omissão não pode ser desativada",
    "pt-BR": "A alíquota padrão não pode ser desativada",
  },
  // Stock that isn't tracked (services etc.)
  "This product doesn't track stock": {
    "pt-PT": "Este produto não controla stock",
    "pt-BR": "Este produto não controla estoque",
  },
  // Manager override
  "Someone else has to approve this": {
    "pt-PT": "Tem de ser outra pessoa a autorizar",
    "pt-BR": "Outra pessoa precisa autorizar",
  },
  "This person can't approve it": {
    "pt-PT": "Esta pessoa não pode autorizar isto",
    "pt-BR": "Esta pessoa não pode autorizar isso",
  },
  "The manager's approval is no longer valid": {
    "pt-PT": "A autorização do gerente já não é válida. Peça-a novamente.",
    "pt-BR": "A autorização do gerente não é mais válida. Peça de novo.",
  },
  "Unknown approver": { "pt-PT": "Autorizador desconhecido", "pt-BR": "Autorizador desconhecido" },
  "Changing a price needs a manager's approval": {
    "pt-PT": "Alterar um preço precisa da autorização de um gerente",
    "pt-BR": "Alterar um preço precisa da autorização de um gerente",
  },
  "Taking cash out needs a manager's approval": {
    "pt-PT": "Retirar dinheiro precisa da autorização de um gerente",
    "pt-BR": "Retirar dinheiro precisa da autorização de um gerente",
  },
  // Shifts
  "A cash refund has to be done at a till with an open shift": {
    "pt-PT": "Um reembolso em dinheiro tem de ser feito numa caixa com o turno aberto",
    "pt-BR": "Um reembolso em dinheiro precisa ser feito em um caixa com o turno aberto",
  },
  "Open a shift before selling": {
    "pt-PT": "Abra o turno antes de vender",
    "pt-BR": "Abra o turno antes de vender",
  },
  "This sale's shift hasn't reached the server yet": {
    "pt-PT": "O turno desta venda ainda não chegou ao servidor",
    "pt-BR": "O turno desta venda ainda não chegou ao servidor",
  },
  "This shift is closed. Open a new one to sell.": {
    "pt-PT": "Este turno está fechado. Abra um novo para vender.",
    "pt-BR": "Este turno está fechado. Abra um novo para vender.",
  },
  "This shift belongs to someone else. They have to close it before you can sell.": {
    "pt-PT": "Este turno é de outra pessoa. Essa pessoa tem de o fechar antes de poder vender.",
    "pt-BR": "Este turno é de outra pessoa. Ela precisa fechá-lo antes que você possa vender.",
  },
  "This shift is open on another till": {
    "pt-PT": "Este turno está aberto noutra caixa",
    "pt-BR": "Este turno está aberto em outro caixa",
  },
  "The count by note and coin isn't valid": {
    "pt-PT": "A contagem por notas e moedas não é válida",
    "pt-BR": "A contagem por cédulas e moedas não é válida",
  },
  "The notes and coins don't add up to the counted cash": {
    "pt-PT": "As notas e moedas não somam o valor contado",
    "pt-BR": "As cédulas e moedas não somam o valor contado",
  },
  "Only the cashier who opened this shift, or a manager, can close it": {
    "pt-PT": "Só o operador que abriu este turno, ou um gerente, o pode fechar",
    "pt-BR": "Só o operador que abriu este turno, ou um gerente, pode fechá-lo",
  },
  // Products, categories and stock
  "Choose a different category to move the products to": {
    "pt-PT": "Escolha outra categoria para onde mover os produtos",
    "pt-BR": "Escolha outra categoria para onde mover os produtos",
  },
  "That tax rate is turned off": { "pt-PT": "Essa taxa está desativada", "pt-BR": "Essa alíquota está desativada" },
  "Unknown exemption reason": { "pt-PT": "Motivo de isenção desconhecido", "pt-BR": "Motivo de isenção desconhecido" },
  "Unknown inventory type": { "pt-PT": "Tipo de inventário desconhecido", "pt-BR": "Tipo de inventário desconhecido" },
  "Send the photo as a JPEG, PNG or WebP image": {
    "pt-PT": "Envie a fotografia em JPEG, PNG ou WebP",
    "pt-BR": "Envie a foto em JPEG, PNG ou WebP",
  },
  "The photo is too big (512 KB at most)": {
    "pt-PT": "A fotografia é demasiado grande (máximo 512 KB)",
    "pt-BR": "A foto é grande demais (máximo 512 KB)",
  },
  "Photo not found": { "pt-PT": "Fotografia não encontrada", "pt-BR": "Foto não encontrada" },
  "Give the date as YYYY-MM-DD": { "pt-PT": "Indique a data como AAAA-MM-DD", "pt-BR": "Informe a data como AAAA-MM-DD" },
  // Fiscal documents
  "That proforma isn't open any more": { "pt-PT": "Essa factura pró-forma já não está em aberto", "pt-BR": "Essa fatura pró-forma não está mais em aberto" },
  "A returned product wasn't on the sale": { "pt-PT": "Um dos produtos devolvidos não fazia parte da venda", "pt-BR": "Um dos produtos devolvidos não fazia parte da venda" },
  "Only a till numbers its own documents": { "pt-PT": "Só uma caixa numera os seus próprios documentos", "pt-BR": "Só um caixa numera os próprios documentos" },
  "Document not found": { "pt-PT": "Documento não encontrado", "pt-BR": "Documento não encontrado" },
  "Alert not found": { "pt-PT": "Alerta não encontrado", "pt-BR": "Alerta não encontrado" },
  "This till's access was withdrawn; it can't issue documents": {
    "pt-PT": "O acesso desta caixa foi retirado; já não pode emitir documentos",
    "pt-BR": "O acesso deste caixa foi retirado; ele não pode mais emitir documentos",
  },
  "Till not found": { "pt-PT": "Caixa não encontrada", "pt-BR": "Caixa não encontrado" },
  "This sale's Factura-Recibo can only be annulled if the customer was wrongly identified or it never reached the customer. Otherwise make a return (credit note).": {
    "pt-PT": "A Factura-Recibo desta venda só pode ser anulada se o cliente foi mal identificado ou se o documento não lhe chegou a ser entregue. Nos outros casos faça uma devolução (nota de crédito).",
    "pt-BR": "A Fatura-Recibo desta venda só pode ser anulada se o cliente foi identificado errado ou se o documento não chegou a ser entregue. Nos outros casos faça uma devolução (nota de crédito).",
  },
  "Every sale already has its Factura-Recibo; print that instead": {
    "pt-PT": "Cada venda já tem a sua Factura-Recibo; imprima essa",
    "pt-BR": "Cada venda já tem sua Fatura-Recibo; imprima essa",
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
    re: /^Series (\S+) isn't this till's$/,
    t: { "pt-PT": "A série $1 não é desta caixa", "pt-BR": "A série $1 não é deste caixa" },
  },
  {
    re: /^Series (\S+) belongs to another till$/,
    t: { "pt-PT": "A série $1 pertence a outra caixa", "pt-BR": "A série $1 pertence a outro caixa" },
  },
  {
    re: /^Document (\d+) of (\S+) came before (\d+); the till will send them in order$/,
    t: { "pt-PT": "O documento $1 da série $2 chegou antes do $3; a caixa envia-os por ordem", "pt-BR": "O documento $1 da série $2 chegou antes do $3; o caixa envia em ordem" },
  },
  {
    re: /^Document number (\d+) of (\S+) was already used$/,
    t: { "pt-PT": "O número $1 da série $2 já foi usado", "pt-BR": "O número $1 da série $2 já foi usado" },
  },
  {
    re: /^"(.+)" is sold in whole units$/,
    t: { "pt-PT": '"$1" vende-se à unidade (sem casas decimais)', "pt-BR": '"$1" é vendido por unidade (sem casas decimais)' },
  },
  {
    re: /^This barcode is already used by "(.+)"$/,
    t: { "pt-PT": 'Este código de barras já é usado por "$1"', "pt-BR": 'Este código de barras já é usado por "$1"' },
  },
  {
    re: /^Barcode already used by "(.+)"$/,
    t: { "pt-PT": 'Código de barras já usado por "$1"', "pt-BR": 'Código de barras já usado por "$1"' },
  },
  {
    re: /^Discounts can't be more than (\S+)% of the price$/,
    t: { "pt-PT": "Os descontos não podem ser superiores a $1% do preço", "pt-BR": "Os descontos não podem passar de $1% do preço" },
  },
  {
    re: /^"(.+)" doesn't track stock, so it can't be transferred$/,
    t: {
      "pt-PT": '"$1" não controla stock, por isso não pode ser transferido',
      "pt-BR": '"$1" não controla estoque, por isso não pode ser transferido',
    },
  },
  {
    re: /^Product (\S+) was not part of this sale$/,
    t: { "pt-PT": "O produto $1 não fazia parte desta venda", "pt-BR": "O produto $1 não fazia parte desta venda" },
  },
];

export function translateMessage(message: string, lang: Language): string {
  if (lang === "en") return message;
  // Angola: the European Portuguese text in Angolan spelling.
  if (lang === "pt-AO") return aoSpelling(translateMessage(message, "pt-PT"));
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
