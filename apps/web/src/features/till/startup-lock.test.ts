import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopTerminal, PinSignInResult, PosDesktopApi, TillStaffMember } from "@/features/desktop/bridge";

// Rendered on the server (no DOM here), zustand would show each store's
// initial state; the till's window shows its current one (the saved
// session, the till once loaded). Test-only: the same stores, rendered as
// the window would.
vi.mock("zustand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("zustand")>();
  const React = await import("react");
  const { createStore } = await import("zustand/vanilla");
  interface Api {
    subscribe: (listener: () => void) => () => void;
    getState: () => unknown;
  }
  const create = (init?: unknown): unknown => {
    if (!init) return create;
    const api = (createStore as unknown as (i: unknown) => Api)(init);
    const useBoundStore = (selector: (s: unknown) => unknown = (s) => s) =>
      React.useSyncExternalStore(api.subscribe, () => selector(api.getState()), () => selector(api.getState()));
    return Object.assign(useBoundStore, api);
  };
  return { ...actual, create };
});

/**
 * The Windows till's PIN lock at startup (PR #15). The session is kept
 * between runs of the app, so the lock must be too: every cold start, reload
 * or restart of a registered till comes up locked, and nothing behind
 * sign-in is rendered until someone signs in. Each "start" below re-imports
 * the app's modules with the same saved storage, as a restart would.
 */

const TERMINAL: DesktopTerminal = { id: "t1", name: "Caixa 1", code: "POS-001", storeId: "s1" };
const STORE = { id: "s1", name: "Loja", currency: "AOA" };
const BUSINESS = { id: "b1", name: "Shop" };
const MANAGER = { id: "u-manager", businessId: "b1", email: "m@x.test", firstName: "Mara", lastName: "Manager", role: "MANAGER", isActive: true };
const CASHIER = { id: "u-cashier", businessId: "b1", email: "c@x.test", firstName: "Cid", lastName: "Cashier", role: "CASHIER", isActive: true };
const STAFF: TillStaffMember[] = [
  { id: MANAGER.id, firstName: "Mara", lastName: "Manager", role: "MANAGER" },
  { id: CASHIER.id, firstName: "Cid", lastName: "Cashier", role: "CASHIER" },
] as TillStaffMember[];
const MANAGER_RIGHTS = { CASH_OUT: true, REFUND: true, DISCOUNT: true };
const CASHIER_RIGHTS = { CASH_OUT: false, REFUND: false, DISCOUNT: false };

interface FakeOptions {
  terminal?: DesktopTerminal | null;
  staff?: TillStaffMember[];
  signIn?: (userId: string, pin: string) => Promise<PinSignInResult>;
  noPin?: boolean;
}

/** What the Windows app's preload exposes, enough for start-up and PIN sign-in. */
function fakeDesktop(o: FakeOptions = {}) {
  const terminal = o.terminal === undefined ? TERMINAL : o.terminal;
  const signIn = vi.fn(o.signIn ?? (async () => ({ ok: false, code: "wrong", error: "Wrong PIN" }) as PinSignInResult));
  const api = {
    app: { platform: "win32", info: async () => ({ version: "0.2.6", platform: "win32", logFile: "" }), openLogFolder: async () => {} },
    settings: { get: async () => ({ autoLockMinutes: 0 }), update: async (p: unknown) => p, setServer: async () => ({ ok: true }) },
    terminal: { get: async () => terminal, set: async () => {}, hasKey: async () => !!terminal },
    staff: { list: async () => o.staff ?? STAFF, refresh: async () => ({ ok: true, count: 0 }) },
    pin: o.noPin ? undefined : { signIn, resume: async () => ({ ok: false, code: "nothing" }) },
    printers: { list: async () => [], print: async () => ({ ok: true }) },
    printing: { get: async () => null, update: async (x: unknown) => x },
    drawer: { get: async () => null, update: async (x: unknown) => x, open: async () => ({ ok: true }) },
    display: { get: async () => null, update: async (x: unknown) => x, show: () => {}, test: async () => ({ ok: true }), screens: async () => [] },
    updates: { status: async () => null, check: async () => null, install: async () => false, onStatus: () => () => {} },
    hardware: { comPorts: async () => [] },
    log: { write: () => {} },
  };
  return { api: api as unknown as PosDesktopApi, signIn };
}

/** A session saved by an earlier run of the app (zustand persist, "pos-auth"). */
function savedSession(state: Record<string, unknown> = {}) {
  localStorage.setItem(
    "pos-auth",
    JSON.stringify({
      state: {
        accessToken: "token-from-last-run",
        user: MANAGER,
        stores: [STORE],
        currentStoreId: STORE.id,
        business: BUSINESS,
        permissions: MANAGER_RIGHTS,
        offline: false,
        tillCache: { business: BUSINESS, stores: [STORE] },
        ...state,
      },
      version: 0,
    }),
  );
}

/** Starts the app: fresh modules, the given desktop bridge (or none: a browser), the saved storage. */
async function start(desktop: PosDesktopApi | null) {
  vi.resetModules();
  (window as { posDesktop?: PosDesktopApi }).posDesktop = desktop ?? undefined;
  await import("@/i18n");
  const bridge = await import("@/features/desktop/bridge");
  const lock = await import("@/features/till/lock-store");
  const auth = await import("@/features/auth/store");
  const session = await import("@/features/till/session");
  const { ProtectedRoute } = await import("@/components/layout/ProtectedRoute");
  const { SetupPage } = await import("@/routes/setup");

  // React, the router and React Query come fresh with the app's modules, as one app.
  const { createElement: h } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MemoryRouter, Route, Routes } = await import("react-router-dom");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const page = (text: string) => h("p", null, text);

  /** The first paint of a page: what anyone at the till would see. */
  function render(path: string) {
    return renderToStaticMarkup(
      h(
        QueryClientProvider,
        { client: new QueryClient() },
        h(
          MemoryRouter,
          { initialEntries: [path] },
          h(
            Routes,
            null,
            h(Route, { path: "/login", element: page("LOGIN PAGE") }),
            h(Route, { path: "/setup", element: h(SetupPage) }),
            h(Route, { element: h(ProtectedRoute) }, ...ROUTES.map((p) => h(Route, { key: p, path: p, element: page(`PROTECTED ${p}`) }))),
          ),
        ),
      ),
    );
  }
  return { bridge, lock, auth, session, render, load: () => bridge.useDeviceStore.getState().load() };
}

const PROTECTED = /PROTECTED/;
const LOCK_SCREEN = /Till locked/;
const ROUTES = ["/pos", "/dashboard", "/settings", "/employees", "/device", "/shifts"];

beforeEach(() => {
  localStorage.removeItem("pos-auth");
});
afterEach(() => {
  delete (window as { posDesktop?: PosDesktopApi }).posDesktop;
});

describe("cold start of a registered Windows till with a saved session", () => {
  it("shows nothing behind sign-in before it knows which till it is, then the PIN lock (1, 4)", async () => {
    savedSession();
    const app = await start(fakeDesktop().api);
    // Before the till's identity has loaded: blank, on every page.
    for (const path of ROUTES) {
      const html = app.render(path);
      expect(html).not.toMatch(PROTECTED);
      expect(html).toContain('data-testid="till-starting"');
    }
    await app.load();
    for (const path of ROUTES) {
      const html = app.render(path);
      expect(html).not.toMatch(PROTECTED);
      expect(html).toMatch(LOCK_SCREEN);
    }
    // The saved session is kept: no email and password needed.
    expect(app.auth.useAuthStore.getState()).toMatchObject({ accessToken: "token-from-last-run", user: { id: MANAGER.id } });
  });

  it("an old access token alone never unlocks it, nor a session saved while offline (3, 12)", async () => {
    savedSession({ accessToken: null, offline: true });
    const app = await start(fakeDesktop().api);
    await app.load();
    expect(app.lock.useLockStore.getState().locked).toBe(true);
    expect(app.render("/pos")).not.toMatch(PROTECTED);
  });

  it("restarting an unlocked till locks it again (3)", async () => {
    savedSession();
    let app = await start(fakeDesktop().api);
    await app.load();
    app.lock.useLockStore.getState().unlock();
    expect(app.render("/pos")).toMatch(PROTECTED);

    app = await start(fakeDesktop().api);
    await app.load();
    expect(app.lock.useLockStore.getState().locked).toBe(true);
    expect(app.render("/pos")).not.toMatch(PROTECTED);
  });

  it("restarting a locked till keeps it locked, however many times (2)", async () => {
    savedSession();
    for (let i = 0; i < 3; i++) {
      const app = await start(fakeDesktop().api);
      expect(app.render("/dashboard")).not.toMatch(PROTECTED);
      await app.load();
      expect(app.render("/dashboard")).toMatch(LOCK_SCREEN);
    }
  });

  it("navigating to setup with the saved session doesn't get past the lock (13)", async () => {
    savedSession();
    const app = await start(fakeDesktop().api);
    expect(app.render("/setup")).toBe("");
    await app.load();
    // Redirected to the lock (Navigate renders nothing on the server); never the setup page.
    expect(app.render("/setup")).not.toMatch(/Set up this computer|Register this till/);
    expect(app.render("/setup")).toBe("");
  });

  it("the lock screen offers a sign-in with email and password, for a forgotten PIN (12)", async () => {
    savedSession();
    const app = await start(fakeDesktop().api);
    await app.load();
    const html = app.render("/pos");
    expect(html).toContain("Sign in with email instead");
    expect(html).toContain("Mara Manager");
    expect(html).toContain("Cid Cashier");
  });

  it("with no staff list saved on the till: still locked, the email sign-in is the way in (12)", async () => {
    savedSession();
    const app = await start(fakeDesktop({ staff: [] }).api);
    await app.load();
    const html = app.render("/pos");
    expect(html).not.toMatch(PROTECTED);
    expect(html).toMatch(LOCK_SCREEN);
    expect(html).toContain("Sign in with email instead");
  });

  it("a session that ended (expired or revoked) goes to sign-in, not into the till (12)", async () => {
    savedSession({ accessToken: null, offline: false, user: null });
    const app = await start(fakeDesktop().api);
    await app.load();
    expect(app.render("/pos")).not.toMatch(PROTECTED);
    expect(app.render("/pos")).not.toMatch(LOCK_SCREEN);
  });
});

describe("unlocking with a PIN", () => {
  it("online: the right PIN signs in; a different cashier gets their own session and rights, not the last person's (5, 10)", async () => {
    savedSession();
    const { api, signIn } = fakeDesktop({
      signIn: async (userId, pin) =>
        userId === CASHIER.id && pin === "2468"
          ? { ok: true, mode: "online", session: { accessToken: "cashier-token", user: CASHIER, stores: [STORE], business: BUSINESS } }
          : { ok: false, code: "wrong", error: "Wrong PIN" },
    });
    const app = await start(api);
    await app.load();
    const result = await app.session.signInWithPin(CASHIER.id, "2468");
    expect(result).toMatchObject({ ok: true, user: { id: CASHIER.id, role: "CASHIER" } });
    expect(signIn).toHaveBeenCalledWith(CASHIER.id, "2468");
    const state = app.auth.useAuthStore.getState();
    expect(state).toMatchObject({ accessToken: "cashier-token", offline: false, user: { id: CASHIER.id } });
    // The manager's rights are gone; the cashier's are fetched for them.
    expect(state.permissions).toBeNull();
  });

  it("a wrong PIN is refused: the same person stays signed in, the till stays locked (6)", async () => {
    savedSession();
    const app = await start(fakeDesktop().api);
    await app.load();
    expect(await app.session.signInWithPin(CASHIER.id, "0000")).toEqual({ ok: false, code: "wrong" });
    expect(app.auth.useAuthStore.getState()).toMatchObject({ accessToken: "token-from-last-run", user: { id: MANAGER.id } });
    expect(app.lock.useLockStore.getState().locked).toBe(true);
    expect(app.render("/pos")).toMatch(LOCK_SCREEN);
  });

  it("after too many wrong PINs the till refuses (the lockout is the desktop app's, see pin-check.ts) (6)", async () => {
    savedSession();
    const app = await start(
      fakeDesktop({ signIn: async () => ({ ok: false, code: "locked", error: "Too many wrong PINs. Try again in a few minutes." }) }).api,
    );
    await app.load();
    expect(await app.session.signInWithPin(CASHIER.id, "2468")).toEqual({ ok: false, code: "locked" });
    expect(app.lock.useLockStore.getState().locked).toBe(true);
  });

  it("offline: the PIN checked on the till signs in with that person's saved rights; the old token is dropped (7, 10)", async () => {
    savedSession();
    const app = await start(
      fakeDesktop({
        signIn: async () => ({
          ok: true,
          mode: "offline",
          user: { id: CASHIER.id, firstName: "Cid", lastName: "Cashier", role: "CASHIER", permissions: CASHIER_RIGHTS },
        }),
      }).api,
    );
    await app.load();
    expect(await app.session.signInWithPin(CASHIER.id, "2468")).toMatchObject({ ok: true, user: { id: CASHIER.id } });
    const state = app.auth.useAuthStore.getState();
    expect(state).toMatchObject({ offline: true, accessToken: null, user: { id: CASHIER.id, role: "CASHIER" }, permissions: CASHIER_RIGHTS });
    // A cashier only gets the till's own store.
    expect(state.stores.map((s) => s.id)).toEqual([TERMINAL.storeId]);
  });

  it("offline with nothing saved on the till to sign in with: refused, stays locked (12)", async () => {
    savedSession({ tillCache: null });
    const app = await start(
      fakeDesktop({
        signIn: async () => ({ ok: true, mode: "offline", user: { id: CASHIER.id, firstName: "Cid", lastName: "Cashier", role: "CASHIER", permissions: {} } }),
      }).api,
    );
    await app.load();
    expect(await app.session.signInWithPin(CASHIER.id, "2468")).toEqual({ ok: false, code: "no-business" });
    expect(app.auth.useAuthStore.getState().user?.id).toBe(MANAGER.id);
    expect(app.lock.useLockStore.getState().locked).toBe(true);
  });

  it("a desktop app without PIN sign-in can't sign anyone in with a PIN (12)", async () => {
    savedSession();
    const app = await start(fakeDesktop({ noPin: true }).api);
    await app.load();
    expect(await app.session.signInWithPin(CASHIER.id, "2468")).toEqual({ ok: false, code: "not-registered" });
    expect(app.render("/pos")).toMatch(LOCK_SCREEN);
  });
});

describe("unchanged elsewhere (11)", () => {
  it("an unregistered Windows app (first-time setup) isn't locked once it knows it has no till", async () => {
    savedSession();
    const app = await start(fakeDesktop({ terminal: null }).api);
    // Still blank until it knows.
    expect(app.render("/dashboard")).not.toMatch(PROTECTED);
    await app.load();
    expect(app.lock.useLockStore.getState().locked).toBe(false);
    expect(app.render("/dashboard")).toMatch(PROTECTED);
  });

  it("registering the till later in the same run doesn't suddenly lock it", async () => {
    savedSession();
    const app = await start(fakeDesktop({ terminal: null }).api);
    await app.load();
    app.bridge.useDeviceStore.setState({ terminal: TERMINAL });
    expect(app.lock.useLockStore.getState().locked).toBe(false);
    expect(app.render("/device")).toMatch(PROTECTED);
  });

  it("a browser is never put behind the till's PIN lock", async () => {
    savedSession();
    const app = await start(null);
    expect(app.bridge.isDesktop).toBe(false);
    expect(app.lock.useLockStore.getState().locked).toBe(false);
    expect(app.render("/dashboard")).toMatch(PROTECTED);
  });

  it("a browser without a session still goes to sign-in", async () => {
    const app = await start(null);
    expect(app.render("/dashboard")).not.toMatch(PROTECTED);
  });
});

describe("signing out while an offline session is being resumed", () => {
  it("the sign-out stands: a resume that finishes afterwards doesn't bring the session back", async () => {
    savedSession({ accessToken: null, offline: true });
    let answer!: (r: unknown) => void;
    const { api } = fakeDesktop();
    (api.pin as unknown as { resume: () => Promise<unknown> }).resume = () => new Promise((resolve) => (answer = resolve));
    const app = await start(api);
    await app.load();
    const resuming = app.session.resumeOfflineSession();
    // "Sign in with email instead" on the lock screen while the server answers.
    app.auth.useAuthStore.getState().clearSession();
    answer({ ok: true, session: { accessToken: "late-token", user: MANAGER, stores: [STORE], business: BUSINESS } });
    expect(await resuming).toBe("rejected");
    expect(app.auth.useAuthStore.getState()).toMatchObject({ accessToken: null, user: null });
  });

  it("without a sign-out, the resume goes through as before", async () => {
    savedSession({ accessToken: null, offline: true });
    const { api } = fakeDesktop();
    (api.pin as unknown as { resume: () => Promise<unknown> }).resume = async () => ({
      ok: true,
      session: { accessToken: "fresh-token", user: MANAGER, stores: [STORE], business: BUSINESS },
    });
    const app = await start(api);
    await app.load();
    expect(await app.session.resumeOfflineSession()).toBe("resumed");
    expect(app.auth.useAuthStore.getState()).toMatchObject({ accessToken: "fresh-token", offline: false, user: { id: MANAGER.id } });
  });
});
