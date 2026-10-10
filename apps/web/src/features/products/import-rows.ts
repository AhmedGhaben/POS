import i18n from "@/i18n";
import { parseLooseNumber } from "@/lib/csv-parse";

export type ImportField = "name" | "sku" | "barcode" | "category" | "costPrice" | "sellPrice" | "taxRate" | "stock";

/** Column order of the template (and of the export, minus Stock). */
export const IMPORT_FIELDS: ImportField[] = ["name", "sku", "barcode", "category", "costPrice", "sellPrice", "taxRate", "stock"];

/** A column's header in the language on screen ("Sell price", "Preço de venda"). */
export function fieldHeader(field: ImportField): string {
  return i18n.t(`products:columns.${field}`);
}

/**
 * Accepted header spellings, English and Portuguese, compared after
 * lowercasing and dropping accents and everything but letters.
 */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ["name", "product", "productname", "item", "itemname", "description", "nome", "produto", "descricao", "artigo", "designacao"],
  sku: ["sku", "code", "itemcode", "productcode", "ref", "reference", "referencia", "codigo", "codigodoproduto", "codigointerno"],
  barcode: ["barcode", "ean", "upc", "gtin", "codigodebarras", "codbarras"],
  category: ["category", "categoryname", "group", "categoria", "familia", "grupo"],
  costPrice: ["costprice", "cost", "purchaseprice", "buyprice", "precodecusto", "custo", "precocusto", "precodecompra"],
  sellPrice: ["sellprice", "price", "sellingprice", "saleprice", "retailprice", "unitprice", "precodevenda", "preco", "pvp", "precovenda"],
  taxRate: ["tax", "taxrate", "vat", "vatrate", "iva", "taxa", "imposto", "taxadeiva"],
  stock: ["stock", "quantity", "qty", "onhand", "stockquantity", "estoque", "quantidade", "qtd", "existencias"],
};

const REQUIRED: ImportField[] = ["name", "sku", "sellPrice"];

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export type ColumnMap = Partial<Record<ImportField, number>>;

/** Finds each field's column; returns the missing required ones by their template name. */
export function mapColumns(header: string[]): { columns: ColumnMap; missing: string[] } {
  const columns: ColumnMap = {};
  header.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
      if (columns[field] === undefined && HEADER_ALIASES[field].includes(key)) {
        columns[field] = index;
        break;
      }
    }
  });
  const missing = REQUIRED.filter((f) => columns[f] === undefined).map(fieldHeader);
  return { columns, missing };
}

/** What the API receives for a row (see ImportProductRowDto). */
export interface ImportRowPayload {
  line: number;
  sku: string;
  name: string;
  barcode?: string;
  category?: string;
  costPrice?: number;
  sellPrice: number;
  taxRate?: number;
  stock?: number;
}

export interface PreviewRow {
  line: number;
  status: "new" | "update" | "error";
  errors: string[];
  /** Present unless status is "error". */
  payload?: ImportRowPayload;
  /** Raw values, for showing the row in the preview. */
  sku: string;
  name: string;
  sellPrice: string;
}

const hasTwoDecimalsAtMost = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

/**
 * Validates data rows (header excluded; line numbers count the header as
 * line 1) and marks each new / update / error. `existingSkus` drives new vs
 * update.
 */
export function buildPreview(dataRows: string[][], columns: ColumnMap, existingSkus: Set<string>): PreviewRow[] {
  const cell = (row: string[], field: ImportField) => {
    const index = columns[field];
    return index === undefined ? "" : (row[index] ?? "").trim();
  };
  const seen = new Set<string>();

  return dataRows.map((row, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const sku = cell(row, "sku");
    const name = cell(row, "name");
    const sellRaw = cell(row, "sellPrice");

    const e = (key: string, values: Record<string, unknown> = {}) =>
      errors.push(i18n.t(`products:import.errors.${key}` as never, values) as string);
    if (!name) e("missing", { field: fieldHeader("name") });
    else if (name.length > 200) e("tooLong", { field: fieldHeader("name"), max: 200 });
    if (!sku) e("missing", { field: fieldHeader("sku") });
    else if (sku.length > 64) e("tooLong", { field: fieldHeader("sku"), max: 64 });
    else if (seen.has(sku)) e("duplicateSku");
    if (sku) seen.add(sku);

    const amount = (field: ImportField, required: boolean): number | undefined => {
      const raw = cell(row, field);
      const value = parseLooseNumber(raw);
      const label = fieldHeader(field);
      if (value === null) {
        if (required) e("missing", { field: label });
        return undefined;
      }
      if (Number.isNaN(value)) e("notNumber", { field: label, value: raw });
      else if (value < 0) e("negative", { field: label });
      else if (!hasTwoDecimalsAtMost(value)) e("decimals", { field: label });
      else return value;
      return undefined;
    };
    const sellPrice = amount("sellPrice", true);
    const costPrice = amount("costPrice", false);
    const taxRate = amount("taxRate", false);
    if (taxRate !== undefined && taxRate > 100) e("over100", { field: fieldHeader("taxRate") });

    let stock: number | undefined;
    const stockRaw = cell(row, "stock");
    const stockValue = parseLooseNumber(stockRaw);
    if (stockValue !== null) {
      if (!Number.isInteger(stockValue) || stockValue < 0) {
        e("stock", { field: fieldHeader("stock"), value: stockRaw });
      } else {
        stock = stockValue;
      }
    }

    const barcode = cell(row, "barcode");
    if (barcode.length > 64) e("tooLong", { field: fieldHeader("barcode"), max: 64 });
    const category = cell(row, "category");
    if (category.length > 100) e("tooLong", { field: fieldHeader("category"), max: 100 });

    const base = { line, sku, name, sellPrice: sellRaw };
    if (errors.length > 0) return { ...base, status: "error", errors };
    return {
      ...base,
      status: existingSkus.has(sku) ? "update" : "new",
      errors,
      payload: {
        line,
        sku,
        name,
        sellPrice: sellPrice!,
        ...(barcode ? { barcode } : {}),
        ...(category ? { category } : {}),
        ...(costPrice !== undefined ? { costPrice } : {}),
        ...(taxRate !== undefined ? { taxRate } : {}),
        ...(stock !== undefined ? { stock } : {}),
      },
    };
  });
}
