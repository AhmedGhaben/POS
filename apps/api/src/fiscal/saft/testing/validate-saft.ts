import { readFileSync } from "fs";
import { join } from "path";
import { validateXML } from "xmllint-wasm";

/** The official SAF-T (AO) 1.01_01 schema, kept in docs/saft-ao/xsd. */
const XSD_FILE = join(__dirname, "..", "..", "..", "..", "..", "..", "docs", "saft-ao", "xsd", "SAFTAO1.01_01.xsd");

let schema: string | null = null;

/** Validates a SAF-T (AO) file against the XSD with libxml2 (WASM, offline). Returns the errors; none means valid. */
export async function saftSchemaErrors(xml: string): Promise<string[]> {
  schema ??= readFileSync(XSD_FILE, "utf8");
  const result = await validateXML({
    xml: { fileName: "saft.xml", contents: xml },
    schema: { fileName: "SAFTAO1.01_01.xsd", contents: schema },
  });
  return result.errors.map((e) => e.rawMessage);
}
