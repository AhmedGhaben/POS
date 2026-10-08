# Staff Login Accounts: plan

Item **1b** of `LAUNCH_READINESS.md`. **Status: shipped 2026-10-08**; see
"Notes from building it" at the end. Goal: a self-serve owner can give a
cashier or manager their own login from the browser, choose which stores
they can use, and turn that access off again, without touching the API.

## Current state (2026-10-08)

- `/employees` creates **HR records only** (`Employee`: name, position,
  phone, wage, store). The "Login account" column shows a linked user's
  email or "None", and owners get a "Manage" button that opens the existing
  `PermissionsDialog`. Nothing in the UI creates a login.
- The API has the pieces, but they aren't joined up:
  - `POST /users` (owner only) creates a `User`. Its DTO allows
    `role: OWNER`, so an owner could create a second owner.
  - `POST /stores/:storeId/users` (owner/manager) adds a `StoreUser` row.
    Nothing removes one.
  - `POST /employees` takes an optional `userId` to link an existing user.
  - There is no endpoint to change a user's role, deactivate them, or list
    their stores.
- Cashiers and managers only see stores they have a `StoreUser` row for
  (`login` → `accessibleStoreIds`). A login with no store can't use the POS.
- **Deactivation gap:** `login` and `refresh` check `isActive`, but
  `JwtStrategy.validate` doesn't. A deactivated user keeps working until
  their access token expires (`JWT_ACCESS_TTL`, 30 min).
- In the seed data every user has an `Employee` profile. Owners created
  through `/signup` don't, which is fine because they don't need to appear
  in the staff list.

## Design

**One concept for the owner: a staff member (Employee) who can optionally
sign in.** Logins are created from the employees page, never on their own,
so every cashier or manager appears in the same table as the rest of the
staff.

- Login roles are **CASHIER or MANAGER** only. Additional owners are out of
  scope.
- **Setting the password: the owner chooses either way** (decided
  2026-10-08):
  - *Set a password now* (default): the owner types an initial password and
    tells the employee. This works for staff without an email they check,
    which is common in small shops.
  - *Email an invite link*: the user is created with an unusable random
    password hash, and an invite email links to
    `/reset-password?token=…&invite=1` (72h expiry). This reuses the
    `PasswordResetToken` table, which already stores `expiresAt` per row.
- Staff logins are created already verified, as `UsersService.create` does
  today.

## Backend (`apps/api`)

1. **Create a login for an employee:** `POST /employees/:id/login` (owner
   only)
   - DTO: `email`, `role` (CASHIER | MANAGER), `storeIds` (≥1, all in the
     business), and either `password` (min 8) or `sendInvite: true`.
   - In one `$transaction`: create the `User`, create a `StoreUser` per store,
     and set `employee.userId`. Return 409 if the email is taken, and also if
     the employee already has a login.
   - If `sendInvite` is set, send the invite email after commit, on a
     best-effort basis as sign-up does.
2. **Create an employee with a login in one step:** `POST /employees` gets
   an optional nested `login` object (same fields) that goes through the same
   service method. This keeps the "New employee" dialog to a single atomic
   request.
3. **Change access:** `PATCH /users/:id/access` (owner only)
   - Takes `role?`, `storeIds?` (replaces the set; ≥1), and `isActive?`.
   - The owner can't change their own access or another OWNER's (403).
   - Deactivating also revokes all of the user's refresh tokens.
4. **Close the deactivation gap:** `JwtStrategy.validate` looks the user up
   and rejects inactive ones, so deactivation takes effect on the next
   request. That adds one indexed primary-key query per request; decided
   2026-10-08 that immediate deactivation is worth it.
5. **Listing:** the `GET /employees` include grows from
   `user: { id, email, role }` to also return `isActive` and `storeIds`, so
   the page can render access without extra calls.
6. **Tighten `POST /users`:** reject `role: OWNER`, which plugs the
   second-owner hole. The endpoint stays for API use.
7. **Invite email:** `MailService.sendStaffInviteEmail(to, firstName,
   businessName, token)`, a link-based template like the verification email.

## Frontend (`apps/web`)

1. **Employees table:** the "Login account" column shows email, role badge
   and store names, a "Deactivated" badge when inactive, or a "Create login"
   button (owner only) when there's no login.
2. **"Create login" dialog** (react-hook-form + zod): email (pre-filled from
   the employee's email), role, store checkboxes (pre-checked with the
   employee's store, or the only store), and a radio for "Set password" /
   "Email invite link", plus a password field when "Set password" is chosen.
3. **"New employee" dialog:** add a "Can sign in to the POS" checkbox that
   reveals the same login fields, so one save creates both.
4. **"Manage" dialog:** today this is permissions only. It becomes a
   dialog with tabs: *Access* (role, stores, deactivate/reactivate) and the
   existing *Permissions*.
5. **Invite landing:** `/reset-password?invite=1` shows "Set your password"
   copy in place of "Choose a new password". On success it says "Sign in"
   rather than "signed out on all devices".
6. **Welcome screen:** add the "Add a cashier" card back (→
   `/employees?new=1`, which opens the New employee dialog with "Can sign in"
   ticked).

## Tests

- Unit (`employees.service.spec.ts`, `users.service.spec.ts`): creating a
  login with a password vs an invite; a store from another business → 404;
  an employee who already has a login → 409; OWNER role rejected; the access
  update replaces stores; deactivating revokes refresh tokens; the owner
  can't edit themselves.
- Unit (`jwt.strategy`): an inactive user is rejected.
- E2E (`test/staff-logins.e2e-spec.ts`): register a fresh owner, then add an
  employee with a cashier login. The cashier can log in and sees only the
  assigned store. Moving them to another store, deactivating them (the
  existing token gets 401) and reactivating all work. Cross-tenant check:
  the owner can't change the seed cashier's access. Clean up the created
  business in `afterAll`, as `signup.e2e-spec.ts` does.
- Browser: the owner adds a cashier with a password, logs in as them in a
  private window, rings up a sale, then deactivates them.

## Out of scope

- Multiple owners or transferring ownership.
- PIN or quick-switch login for shared POS terminals. Worth doing later;
  it's a common request for counter staff.
- The owner resetting a staff member's password for them. Staff can use
  "Forgot password?", and an owner can deactivate and recreate the login.
- Seat limits per plan (item #2, billing).
- Deleting users. Deactivate only, so sales history keeps its cashier.

## Done when

A new owner can go from `/welcome` → "Add a cashier" → save. The cashier
signs in (with a password, or via the invite link), sees only their store,
and sells at `/pos`. The owner can then move them to another store or
deactivate them, which takes effect immediately. Unit and e2e tests pass.

## Notes from building it (2026-10-08)

- Built as planned. In addition, `JwtStrategy` now returns the role from the
  database, so a promotion or demotion also takes effect on the next
  request, not just deactivation.
- Token helpers moved to `common/utils/tokens.ts` (shared by auth and
  staff invites). `PermissionsDialog` became `PermissionsPanel`, now shown
  as a tab inside the new "Manage" dialog.
- Known limitation: store checkboxes use the stores in the owner's session,
  which are loaded at login. A store created after login only appears there
  after signing in again. The same is already true of the store switcher.
- Verified with 9 new e2e tests, plus a smoke run through the Vite proxy:
  owner creates an employee with a login, the cashier signs in to their
  store, and deactivation returns 401 on the cashier's next request. The
  browser click-through is pending, because the Chrome extension wasn't
  connected.
