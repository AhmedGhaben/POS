import { app, net, protocol } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import log from "electron-log/main";
import { getConfig } from "./config";
import { APP_HOST, APP_ORIGIN, APP_SCHEME } from "./origin";
import { takePrintPage } from "./printing";

export { APP_ORIGIN };

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

/** Print pages are plain documents: styles and images only, never scripts. */
const PRINT_CSP = [
  "default-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/** Must run before `app.ready`. A standard + secure scheme gets its own
 * stable origin, so localStorage/IndexedDB persist across restarts. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
    },
  ]);
}

/** The bundled web build (`apps/web` built with `--mode desktop`). */
export function webRoot() {
  if (process.env.POS_DESKTOP_WEB_DIR) return path.resolve(process.env.POS_DESKTOP_WEB_DIR);
  return app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(__dirname, "../../web/dist-desktop");
}

/** Desktop-only pages (first-run setup). */
function staticRoot() {
  return path.resolve(__dirname, "../static");
}

export function handleAppScheme() {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return forwardToServer(request, url);
    }
    if (url.pathname.startsWith("/__print/")) {
      const html = takePrintPage(url.pathname.slice("/__print/".length));
      return html
        ? new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PRINT_CSP } })
        : new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/__desktop/")) {
      return serveFile(staticRoot(), url.pathname.slice("/__desktop".length), false);
    }
    return serveFile(webRoot(), url.pathname, true);
  });
}

/**
 * `app://pos/api/*` → `<serverUrl>/*`, from the main process. The refresh
 * cookie lives in this session's cookie jar for the server's own origin and
 * is never exposed to the page. A network failure rejects, so the page sees
 * the same error as `fetch` against an unreachable server and the offline
 * POS path takes over.
 */
async function forwardToServer(request: Request, url: URL): Promise<Response> {
  const serverUrl = getConfig().serverUrl;
  if (!serverUrl) {
    return Response.json({ message: "No server address configured" }, { status: 503 });
  }
  const target = `${serverUrl}${url.pathname.slice("/api".length)}${url.search}`;

  const headers = new Headers(request.headers);
  for (const h of ["origin", "referer", "cookie", "host"]) headers.delete(h);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let res: Response;
  try {
    res = await net.fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      credentials: "include",
      redirect: "manual",
      bypassCustomProtocolHandlers: true,
    });
  } catch (err) {
    log.warn(`[api] ${request.method} ${url.pathname} unreachable: ${(err as Error).message}`);
    throw err;
  }

  const outHeaders = new Headers(res.headers);
  outHeaders.delete("set-cookie");
  return new Response(NULL_BODY_STATUSES.has(res.status) ? null : res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: outHeaders,
  });
}

async function serveFile(root: string, pathname: string, spaFallback: boolean): Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const file = path.resolve(root, `.${rel}`);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  let target = file;
  let stat = await fs.stat(target).catch(() => null);
  if (stat?.isDirectory()) {
    target = path.join(target, "index.html");
    stat = await fs.stat(target).catch(() => null);
  }
  // Client-side routes (/pos, /settings, …) have no file: serve the SPA shell.
  if (!stat && spaFallback && !path.extname(file)) {
    target = path.join(root, "index.html");
    stat = await fs.stat(target).catch(() => null);
  }
  if (!stat) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(target).toLowerCase();
  const headers = new Headers({ "Content-Type": MIME[ext] ?? "application/octet-stream" });
  if (ext === ".html") {
    headers.set("Content-Security-Policy", CSP);
    headers.set("Cache-Control", "no-cache");
  }
  return new Response(await fs.readFile(target), { status: 200, headers });
}
