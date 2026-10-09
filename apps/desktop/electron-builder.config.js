/**
 * electron-builder config (Windows installer + auto-update feed).
 *
 * - Release builds (GitHub Actions on a `v*` tag) embed the icon and
 *   version info in POS.exe and lock the binary down with Electron fuses.
 * - POS_TEST_BUILD=1: same app, but the fuses that stop Playwright from
 *   driving it (inspect flags) stay off. Never ship a test build.
 * - Editing POS.exe needs electron-builder's Windows tools, which only
 *   unpack where symlinks are allowed (CI, or Windows Developer Mode):
 *   set POS_EDIT_EXE=1 locally to try.
 */
const testBuild = process.env.POS_TEST_BUILD === "1" || process.env.npm_lifecycle_event === "dist:test";
const editExe = process.env.CI === "true" || process.env.POS_EDIT_EXE === "1";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "app.pos.desktop",
  productName: "POS",
  // Tests only: build a "newer" copy to serve from a local update feed.
  extraMetadata: process.env.POS_VERSION_OVERRIDE ? { version: process.env.POS_VERSION_OVERRIDE } : undefined,
  directories: { output: process.env.POS_RELEASE_DIR || "release", buildResources: "build" },
  files: ["dist/**/*", "static/**/*", "package.json", "!dist/**/*.map", "!dist/**/*.test.js", "!dist/unit-tests.js"],
  extraResources: [{ from: "../web/dist-desktop", to: "web" }],
  win: {
    target: "nsis",
    icon: "build/icon.png",
    signAndEditExecutable: editExe,
    artifactName: "POS-Setup-${version}.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "POS",
    deleteAppDataOnUninstall: false,
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
  },
  // Updates come from this repository's GitHub Releases (public, so the
  // app needs no token). latest.yml + the installer are uploaded there.
  publish: [{ provider: "github", owner: "AhmedGhaben", repo: "POS", releaseType: "release" }],
  electronFuses: testBuild
    ? undefined
    : {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
        enableCookieEncryption: true,
        // Needs the integrity hash written into POS.exe (exe editing).
        enableEmbeddedAsarIntegrityValidation: editExe,
      },
};
