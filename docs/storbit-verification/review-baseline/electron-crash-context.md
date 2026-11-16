# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: angola-phase1.spec.ts >> Angola phase 1: account switch and dropdowns >> a customer can be picked from the dropdown with the mouse
- Location: e2e\angola-phase1.spec.ts:85:7

# Error details

```
Error: electron.launch: Process failed to launch!
Call log:
  - <launching> "C:\Users\ASUS\Desktop\project_main\node_modules\electron\dist\electron.exe" "-r" "C:\Users\ASUS\Desktop\project_main\node_modules\playwright-core\lib\server\electron\loader.js" "--inspect=0" "--remote-debugging-port=0" "C:\Users\ASUS\Desktop\project_main\apps\desktop"
  - <launched> pid=5880
  - [pid=5880][out]
  - [pid=5880][err] Debugger listening on ws://127.0.0.1:6580/c8e79f70-258f-49d0-ad95-a1f46e710e16
  - [pid=5880][err] For help, see: https://nodejs.org/learn/getting-started/debugging
  - <ws connecting> ws://127.0.0.1:6580/c8e79f70-258f-49d0-ad95-a1f46e710e16
  - <ws connected> ws://127.0.0.1:6580/c8e79f70-258f-49d0-ad95-a1f46e710e16
  - [pid=5880][err] Debugger attached.
  - [pid=5880][err] (node:32420) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
  - [pid=5880][err] (Use `electron --trace-warnings ...` to show where the warning was created)
  - [pid=5880][err] [32420:1114/040122.118:ERROR:components\os_crypt\sync\os_crypt_win.cc:77] Failed to encrypt: The system cannot find the file specified. (0x2)
  - [pid=5880][err] [32420:1114/040122.152:FATAL:electron\shell\browser\win\install_dir_access.cc:52] Sandboxed processes cannot read C:\Users\ASUS\Desktop\project_main\node_modules\electron\dist: its ACL has an entry for an AppContainer package SID but none for ALL APPLICATION PACKAGES, so Windows denies the sandbox token access. Grant it with: icacls "C:\Users\ASUS\Desktop\project_main\node_modules\electron\dist" /grant *S-1-15-2-1:(OI)(CI)(RX)
  - <ws disconnected> ws://127.0.0.1:6580/c8e79f70-258f-49d0-ad95-a1f46e710e16 code=1006 reason=
  - [pid=5880] <kill>
  - [pid=5880] <will force kill>
  - [pid=5880] <process did exit: exitCode=2147483651, signal=null>
  - [pid=5880] starting temporary directories cleanup
  - [pid=5880] finished temporary directories cleanup

```

# Test source

```ts
  14  |  *   answer (the API saves the sale, then the line drops), the worst moment
  15  |  *   for a connection to fail
  16  |  */
  17  | export type ProxyMode = "pass" | "bad-gateway" | "lose-responses";
  18  | 
  19  | /**
  20  |  * A TCP proxy in front of the API that the test can switch off or make
  21  |  * misbehave, to play "server unreachable" without touching the API process.
  22  |  */
  23  | export class SwitchableProxy {
  24  |   private server: net.Server | null = null;
  25  |   private sockets = new Set<net.Socket>();
  26  |   port = 0;
  27  |   mode: ProxyMode = "pass";
  28  | 
  29  |   constructor(private readonly target: URL) {}
  30  | 
  31  |   /** Changes behaviour for every request from now on, dropping open
  32  |    * keep-alive connections as a real outage or recovery would. */
  33  |   setMode(mode: ProxyMode) {
  34  |     this.mode = mode;
  35  |     for (const s of this.sockets) s.destroy();
  36  |   }
  37  | 
  38  |   get url() {
  39  |     return `http://127.0.0.1:${this.port}`;
  40  |   }
  41  | 
  42  |   private track(s: net.Socket) {
  43  |     this.sockets.add(s);
  44  |     s.on("close", () => this.sockets.delete(s));
  45  |     s.on("error", () => s.destroy());
  46  |   }
  47  | 
  48  |   async up(mode: ProxyMode = "pass"): Promise<void> {
  49  |     this.mode = mode;
  50  |     if (this.server) return;
  51  |     const server = net.createServer((client) => {
  52  |       this.track(client);
  53  |       if (this.mode === "bad-gateway") {
  54  |         client.once("data", () => {
  55  |           client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nContent-Length: 11\r\nConnection: close\r\n\r\nBad Gateway");
  56  |         });
  57  |         return;
  58  |       }
  59  |       const upstream = net.connect(Number(this.target.port || 80), this.target.hostname);
  60  |       this.track(upstream);
  61  |       // Set once this connection carries a sale while losing responses.
  62  |       let losing = false;
  63  |       client.on("data", (chunk: Buffer) => {
  64  |         if (this.mode === "lose-responses" && chunk.toString("latin1").startsWith("POST /sales")) {
  65  |           losing = true;
  66  |         }
  67  |         upstream.write(chunk);
  68  |       });
  69  |       upstream.on("data", (chunk: Buffer) => {
  70  |         if (!losing) {
  71  |           client.write(chunk);
  72  |           return;
  73  |         }
  74  |         // The API has saved the sale and is answering: cut the line instead.
  75  |         client.destroy();
  76  |         upstream.destroy();
  77  |       });
  78  |       client.on("end", () => upstream.end());
  79  |       upstream.on("end", () => client.end());
  80  |     });
  81  |     await new Promise<void>((resolve) => server.listen(this.port, "127.0.0.1", resolve));
  82  |     const assignedPort = (server.address() as net.AddressInfo).port;
  83  |     // Windows may allocate these ephemeral ports; Chromium refuses HTTP on them.
  84  |     const blocked = new Set([1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080]);
  85  |     if (this.port === 0 && blocked.has(assignedPort)) {
  86  |       await new Promise<void>((resolve) => server.close(() => resolve()));
  87  |       return this.up(mode);
  88  |     }
  89  |     this.port = assignedPort;
  90  |     this.server = server;
  91  |   }
  92  | 
  93  |   async down() {
  94  |     const server = this.server;
  95  |     this.server = null;
  96  |     for (const s of this.sockets) s.destroy();
  97  |     if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  98  |   }
  99  | }
  100 | 
  101 | export function tempUserData() {
  102 |   return fs.mkdtempSync(path.join(os.tmpdir(), "pos-desktop-test-"));
  103 | }
  104 | 
  105 | /**
  106 |  * Launches the dev build, or the packaged app when POS_DESKTOP_EXECUTABLE
  107 |  * points at it (e.g. release/win-unpacked/POS.exe).
  108 |  */
  109 | export async function launch(
  110 |   userData: string,
  111 |   extraEnv: Record<string, string> = {},
  112 | ): Promise<{ app: ElectronApplication; page: Page }> {
  113 |   const executablePath = process.env.POS_DESKTOP_EXECUTABLE;
> 114 |   const app = await electron.launch({
      |               ^ Error: electron.launch: Process failed to launch!
  115 |     ...(executablePath ? { executablePath: path.resolve(executablePath), args: [] } : { args: [path.resolve(__dirname, "..")] }),
  116 |     // Tests never let the updater install anything on this PC.
  117 |     env: { ...process.env, POS_DESKTOP_USER_DATA: userData, POS_DESKTOP_UPDATE_INSTALL_ON_QUIT: "0", ...extraEnv } as Record<string, string>,
  118 |   });
  119 |   const page = await app.firstWindow();
  120 |   await page.waitForLoadState("domcontentloaded");
  121 |   return { app, page };
  122 | }
  123 | 
  124 | /** Status of a refresh attempt made the same way the web app makes it. */
  125 | export function refreshStatus(page: Page) {
  126 |   return page.evaluate(async () => {
  127 |     const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  128 |     return res.status;
  129 |   });
  130 | }
  131 | 
  132 | /**
  133 |  * Signs in on the login page. The server allows 5 sign-ins a minute, and the
  134 |  * whole suite signs in more often than that, so a "too many requests" answer
  135 |  * waits and tries again.
  136 |  */
  137 | export async function login(page: Page, email = "owner@demo-store.test", password = "OwnerPass123!") {
  138 |   // A till with PINs shows name buttons first.
  139 |   const emailLink = page.getByRole("button", { name: "Sign in with email instead" });
  140 |   await Promise.race([page.getByLabel("Email").waitFor(), emailLink.waitFor()]);
  141 |   if (await emailLink.isVisible()) await emailLink.click();
  142 |   await page.getByLabel("Email").fill(email);
  143 |   await page.getByLabel("Password").fill(password);
  144 |   for (let attempt = 0; ; attempt++) {
  145 |     await page.getByRole("button", { name: "Sign in", exact: true }).click();
  146 |     const outcome = await Promise.race([
  147 |       page.waitForURL((url) => !url.pathname.startsWith("/login")).then(() => "in" as const, (e: Error) => e),
  148 |       page.getByText(/Too Many Requests/i).waitFor().then(() => "throttled" as const, () => new Promise<never>(() => {})),
  149 |     ]);
  150 |     if (outcome instanceof Error) throw outcome;
  151 |     if (outcome === "in") return;
  152 |     if (attempt >= 6) throw new Error("Sign-in still rate limited");
  153 |     await page.waitForTimeout(15_000);
  154 |   }
  155 | }
  156 | 
  157 | /**
  158 |  * First-run setup: point the till at the (proxied) server. A new till then
  159 |  * offers the setup wizard; `skipSetup` (the default) goes straight to sign-in.
  160 |  */
  161 | export async function connect(page: Page, serverUrl: string, { skipSetup = true } = {}) {
  162 |   await page.getByLabel("Server address").fill(serverUrl);
  163 |   await page.getByRole("button", { name: "Connect" }).click();
  164 |   await page.waitForURL(/^app:\/\/pos\/(login|setup|$)/);
  165 |   if (skipSetup && page.url().endsWith("/setup")) {
  166 |     await page.getByRole("button", { name: "Skip for now and sign in" }).click();
  167 |     await page.waitForURL(/^app:\/\/pos\/login/);
  168 |   }
  169 | }
  170 | 
  171 | /**
  172 |  * Opens the POS and selects the first category so products are on screen.
  173 |  * Selling needs an open shift (docs/plans/ANGOLA.md, phase 3): unless
  174 |  * `openShift: false`, the till is opened with no float if it asks.
  175 |  */
  176 | export async function openPosWithProducts(page: Page, { openShift = true } = {}) {
  177 |   await page.goto("app://pos/pos");
  178 |   await page.getByRole("button", { name: "All", exact: true }).locator("xpath=following-sibling::button[1]").click();
  179 |   await page.locator("div.grid > button.text-left").first().waitFor();
  180 |   if (openShift) await ensureShiftOpen(page);
  181 | }
  182 | 
  183 | /**
  184 |  * Log out. A sale left in the cart is cancelled first (the till asks). With
  185 |  * the person's shift open, Log out goes into closing it (blind count,
  186 |  * report): count 0, close, and sign out from there.
  187 |  */
  188 | export async function logOut(page: Page) {
  189 |   await page.getByRole("button", { name: "Log out" }).click();
  190 |   const closing = page.getByRole("dialog").filter({ hasText: "Close the till" });
  191 |   const cart = page.getByRole("dialog").filter({ hasText: "There's a sale in the cart" });
  192 |   let outcome = await Promise.race([
  193 |     page.waitForURL(/\/login/).then(() => "out" as const),
  194 |     closing.waitFor().then(() => "close" as const),
  195 |     cart.waitFor().then(() => "cart" as const),
  196 |   ]);
  197 |   if (outcome === "cart") {
  198 |     await cart.getByRole("button", { name: "Cancel the sale" }).click();
  199 |     outcome = await Promise.race([
  200 |       page.waitForURL(/\/login/).then(() => "out" as const),
  201 |       closing.waitFor().then(() => "close" as const),
  202 |     ]);
  203 |   }
  204 |   if (outcome === "close") {
  205 |     // A shift with nothing in it asks "count = opening float?" (one click); otherwise count 0.
  206 |     const quick = closing.getByRole("button", { name: /^Yes, close with/ });
  207 |     const counted = closing.getByLabel("Cash counted");
  208 |     await Promise.race([quick.waitFor(), counted.waitFor()]);
  209 |     if (await quick.isVisible()) await quick.click();
  210 |     else {
  211 |       await counted.fill("0");
  212 |       await closing.getByRole("button", { name: "Close the till" }).click();
  213 |     }
  214 |     await page.getByRole("button", { name: "Done (sign out)" }).click();
```