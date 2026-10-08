import { parseLooseNumber } from "@/lib/csv-parse";

export type ImportField = "name" | "sku" | "barcode" | "category" | "costPrice" | "sellPrice" | "taxRate" | "stock";

/** Column order of the template (and of the export, minus Stock). */
export const TEMPLATE_HEADERS: Record<ImportField, string> = {
  name: "Name",
  sku: "SKU",
  barcode: "Barcode",
  category: "Category",
  costPrice: "Cost price",
  sellPrice: "Sell price",
  taxRate: "Tax %",
  stock: "Stock",
};

/** Accepted header spellings, compared after lowercasing and dropping everything but letters. */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ["name", "product", "productname", "item", "itemname", "description"],
  sku: ["sku", "code", "itemcode", "productcode", "ref", "reference"],
  barcode: ["barcode", "ean", "upc", "gtin"],
  category: ["category", "categoryname", "group"],
  costPrice: ["costprice", "cost", "purchaseprice", "buyprice"],
  sellPrice: ["sellprice", "price", "sellingprice", "saleprice", "retailprice", "unitprice"],
  taxRate: ["tax", "taxrate", "vat", "vatrate"],
  stock: ["stock", "quantity", "qty", "onhand", "stockquantity"],
};

const REQUIRED: ImportField[] = ["name", "sku", "sellPrice"];

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

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
  const missing = REQUIRED.filter((f) => columns[f] === undefined).map((f) => TEMPLATE_HEADERS[f]);
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

    if (!name) errors.push("Name is missing");
    else if (name.length > 200) errors.push("Name is over 200 characters");
    if (!sku) errors.push("SKU is missing");
    else if (sku.length > 64) errors.push("SKU is over 64 characters");
    else if (seen.has(sku)) errors.push("SKU appears earlier in the file");
    if (sku) seen.add(sku);

    const amount = (field: ImportField, label: string, required: boolean): number | undefined => {
      const raw = cell(row, field);
      const value = parseLooseNumber(raw);
      if (value === null) {
        if (required) errors.push(`${label} is missing`);
        return undefined;
      }
      if (Number.isNaN(value)) errors.push(`${label} "${raw}" isn't a number`);
      else if (value < 0) errors.push(`${label} can't be negative`);
      else if (!hasTwoDecimalsAtMost(value)) errors.push(`${label} has more than 2 decimals`);
      else return value;
      return undefined;
    };
    const sellPrice = amount("sellPrice", "Sell price", true);
    const costPrice = amount("costPrice", "Cost price", false);
    const taxRate = amount("taxRate", "Tax %", false);
    if (taxRate !== undefined && taxRate > 100) errors.push("Tax % is over 100");

    let stock: number | undefined;
    const stockRaw = cell(row, "stock");
    const stockValue = parseLooseNumber(stockRaw);
    if (stockValue !== null) {
      if (!Number.isInteger(stockValue) || stockValue < 0) {
        errors.push(`Stock "${stockRaw}" must be a whole number, 0 or more`);
      } else {
        stock = stockValue;
      }
    }

    const barcode = cell(row, "barcode");
    if (barcode.length > 64) errors.push("Barcode is over 64 characters");
    const category = cell(row, "category");
    if (category.length > 100) errors.push("Category is over 100 characters");

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
