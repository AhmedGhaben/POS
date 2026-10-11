import i18n from "@/i18n";

const MAX_SIDE = 600;
/** The API's limit is 300 KB decoded; stay under it with some margin. */
const MAX_BYTES = 290 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(i18n.t("settings:logo.unreadable")));
    };
    img.src = url;
  });
}

/** Bytes encoded in a base64 data URL. */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Shrinks the image to fit 600x600 and re-encodes it so phone photos fit
 * the 300 KB limit. PNG keeps transparency; falls back to WebP, then JPEG
 * at decreasing quality if it's still too big.
 */
export async function resizeLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) {
    throw new Error(i18n.t("settings:logo.wrongType"));
  }
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);

  const attempts: [string, number?][] = [
    ["image/png"],
    ["image/webp", 0.9],
    ["image/webp", 0.75],
    ["image/jpeg", 0.85],
    ["image/jpeg", 0.65],
  ];
  for (const [type, quality] of attempts) {
    const dataUrl = canvas.toDataURL(type, quality);
    // Browsers without WebP encoding silently return PNG; skip those.
    if (!dataUrl.startsWith(`data:${type};`)) continue;
    if (dataUrlBytes(dataUrl) <= MAX_BYTES) return dataUrl;
  }
  throw new Error(i18n.t("settings:logo.tooDetailed"));
}
