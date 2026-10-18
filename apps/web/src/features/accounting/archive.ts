import { unzipSync, zipSync, type Zippable } from "fflate";
import { desktop } from "@/features/desktop/bridge";

/**
 * The document archive (docs/ACCOUNTING-DECISIONS.md, B2a): the server's
 * ZIP (SAF-T files, attachments, index) plus a PDF of every document, drawn
 * in the app with the same A4 template it prints with, as a "2ª Via".
 */

export interface ArchivePdf {
  /** Its place in the archive, as the server's index names it (documentos/FR/FR_....pdf). */
  path: string;
  data: Uint8Array;
}

/** Adds the documents' PDFs to the server's ZIP and zips it all again. */
export function completeArchive(serverZip: Uint8Array, pdfs: ArchivePdf[]): Uint8Array {
  const files: Zippable = unzipSync(serverZip);
  // PDFs are compressed inside already.
  for (const pdf of pdfs) files[pdf.path] = [pdf.data, { level: 0 }];
  return zipSync(files, { level: 6 });
}

/** How many A4 pages a capture `heightPx` tall needs when a page is `pagePx` tall (a sliver of rounding isn't a page). */
export function pagesFor(heightPx: number, pagePx: number): number {
  return Math.max(1, Math.ceil((heightPx - pagePx * 0.01) / pagePx));
}

/** Waits for the document's images (the logo, the QR code) and fonts, at most 4 s, as the print window does. */
export async function settled(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img")).map((img) =>
    img.complete
      ? null
      : new Promise<void>((resolve) => {
          img.onload = img.onerror = () => resolve();
        }),
  );
  await Promise.race([Promise.all([document.fonts?.ready, ...images]), new Promise((resolve) => setTimeout(resolve, 4000))]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** Images by address, as data: URLs (the logo is the same on every document). */
const inlined = new Map<string, Promise<string>>();

/**
 * The browser draws the page through an SVG, which shows only images
 * carried inside it: linked ones (the logo) become data: URLs first.
 */
async function inlineImages(element: HTMLElement): Promise<void> {
  for (const img of Array.from(element.querySelectorAll("img"))) {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:")) continue;
    if (!inlined.has(src)) {
      inlined.set(
        src,
        fetch(src)
          .then((r) => r.blob())
          .then((blob) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          }))
          .catch(() => src),
      );
    }
    img.src = await inlined.get(src)!;
    await img.decode().catch(() => undefined);
  }
}

/** True when the PDFs come out exactly as printed (the Windows app); else they're a picture of the page. */
export const exactPdfs = () => !!desktop?.printers.pdf;

/**
 * A rendered A4 document (the element holding <FiscalA4>) as a PDF. In the
 * Windows app it's printed to PDF from the same hidden window as a real
 * print: text, vector, identical to paper. In a browser it's a picture of
 * the same page (html2canvas), one A4 page per 297 mm.
 */
export async function documentPdf(container: HTMLElement): Promise<Uint8Array> {
  if (desktop?.printers.pdf) {
    const stylesheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) => l.href);
    return new Uint8Array(await desktop.printers.pdf({ html: container.innerHTML, stylesheets }));
  }
  const page = container.firstElementChild as HTMLElement;
  await inlineImages(page);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(page, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    // Drawn by the browser itself (SVG foreignObject): html2canvas's own layout sets text a few pixels low, so table rules cut through it.
    foreignObjectRendering: true,
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pxPerMm = canvas.width / 210;
  const pagePx = Math.round(297 * pxPerMm);
  const pages = pagesFor(canvas.height, pagePx);
  for (let i = 0; i < pages; i++) {
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.min(pagePx, canvas.height - i * pagePx);
    const ctx = slice.getContext("2d")!;
    // White paper: anything left transparent would come out black in the JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, i * pagePx, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (i > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, slice.height / pxPerMm);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}
