# Windows till: PIN lock, offline lockout and withdrawn tills

What protects a registered Windows till, what doesn't, and how a till that
was withdrawn gets back into service. Introduced in PR #15.

## What is protected

- **Every start is locked.** The signed-in session is kept between runs of
  the app, but a registered till starts locked (restart, reload, crash). Until
  someone types their PIN (online: checked by the server; offline: checked on
  the till) or signs in with email and password, nothing behind sign-in is
  shown. Sync and the heartbeat keep running while locked.
- **Wrong PINs.** Online, the server allows 5 wrong PINs in a row, then locks
  that person for 5 minutes. Offline, the till does the same, and keeps the
  count in `pin-lockout.json` (counts and times only, never a PIN), so a
  restart doesn't reset it. Each try is saved before the PIN is checked; if it
  can't be saved, the PIN isn't checked.
- **Lockout file damaged or removed.** If `pin-lockout.json` can't be read, or
  it disappeared after it had been created on this till (`config.json`
  records `pinLockoutKept`), offline PINs are refused for everyone for 5
  minutes. This lock always ends; a new till, or one upgraded from a version
  without the file, simply starts counting.
- **The till's business only.** When a registered till's key comes with a
  request (the Windows app adds it to every request), the server hands out no
  session in another business: not by email and password, sign-up, an
  accountant's company switch, or refreshing an old session.
- **A withdrawn till stays withdrawn.** A till key that is sent but no longer
  counts (malformed, replaced by a new key, the till switched off) is refused
  for sign-in and session refresh, and for managing tills (new key, switching
  a till on or off, registering or pairing tills), so a session saved on the
  till can't put it back into service by itself. Browsers send no key and
  are unchanged.
- **No DevTools** in the installed app.

## Limits (outside what the till can enforce)

The Windows user account the till runs under can read and change the app's
own files in `%APPDATA%\POS`. Anyone who can do that, with a file editor or by
copying files, can:

- remove or roll back the offline wrong-PIN count, for example by deleting
  `pin-lockout.json` **and** removing `pinLockoutKept` from `config.json`, or
  by restoring older copies of both. Deleting `pin-lockout.json` alone locks
  offline PINs for 5 minutes, and each new deletion does the same.
- move the Windows clock forward, which shortens a lockout.

None of this gets past the PIN lock itself, or past the server's own lockout
online. It only gives more offline guesses at a 4-6 digit PIN. Protecting
against someone who can edit the app's data needs the operating system:

- Run the till in Fullscreen till mode (This device) and under Windows Assigned
  Access, so cashiers have no File Explorer or command prompt.
- Don't give cashiers a Windows administrator account, or the Windows password
  of the account the till runs under.
- Use 6-digit PINs, and keep the till online where possible (the server's
  lockout can't be edited on the till).

## A withdrawn till: getting it back safely

When a manager switches a till off, or gives it a new key from another device,
that till can no longer sign anyone in. It shows "This till isn't registered
any more".

1. **Switched off by mistake:** a manager turns it back on from another
   device: Settings → Tills → Turn on. The till works again with its own key.
   Nothing on the till changes.
2. **Key replaced, or the till should be set up again:** on the till, choose
   **Set up this till again** (offered on the lock screen and the sign-in page
   when the server refuses the till). The app first asks the server; only if
   the server confirms the key was withdrawn does it forget the registration
   (the till, its key, its staff list and its signing key). The server
   address, printers, drawer and display settings, the PIN lockout and every
   saved sale or other queued work stay on the till. The setup wizard opens:
   type a till code from a manager (Settings → Tills → Add a till → Get a
   code), or have a manager sign in and register it on This device. Work saved
   earlier uploads once the till is set up again; work saved under the old till
   is kept and flagged for managers, never rewritten.

Nothing in this recovery path works without a manager: a till code, or a
manager's own sign-in.
