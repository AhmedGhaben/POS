/**
 * electron-builder config (Windows installer + auto-update feed).
 *
 * - ALL Windows installer builds must edit STORBIT.exe resources so its taskbar
 *   icon and version details are branded. Disabling this silently leaves the
 *   generic Electron icon even when win.icon is correctly set.
 * - Release builds (GitHub Actions on a `v*` tag) also lock the executable
 *   down with Electron fuses. POS_TEST_BUILD=1 keeps inspection flags available
 *   for Playwright; never ship a test build.
 * - Resource editing needs electron-builder's Windows tools. If a LOCAL build
 *   cannot extract them, enable Windows Developer Mode for symlink support
 *   rather than bypassing icon embedding.
 */
const testBuild = process.env.POS_TEST_BUILD === "1" || process.env.npm_lifecycle_event === "dist:test";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  // appId stays "app.pos.desktop" (from before the app was named STORBIT):
  // it is how Windows and the installer recognise installed tills, so an
  // update replaces the old app instead of installing a second one.
  appId: "app.pos.desktop",
  productName: "STORBIT",
  // Tests only: build a "newer" copy to serve from a local update feed.
  extraMetadata: process.env.POS_VERSION_OVERRIDE ? { version: process.env.POS_VERSION_OVERRIDE } : undefined,
  directories: { output: process.env.POS_RELEASE_DIR || "release", buildResources: "build" },
  files: ["dist/**/*", "static/**/*", "package.json", "!dist/**/*.map", "!dist/**/*.test.js", "!dist/unit-tests.js"],
  extraResources: [{ from: "../web/dist-desktop", to: "web" }],
  win: {
    target: "nsis",
    icon: "build/icon.ico",
    signAndEditExecutable: true,
    artifactName: "STORBIT-Setup-${version}.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "STORBIT",
    deleteAppDataOnUninstall: false,
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
    // Shown in the computer's language: English, European or Brazilian Portuguese.
    multiLanguageInstaller: true,
    installerLanguages: ["en_US", "pt_PT", "pt_BR"],
  },
  // Updates come from this repository's GitHub Releases (public, so the
  // app needs no token). latest.yml + the installer are uploaded there.
  // Published as a pre-release: only computers on the Beta channel take it
  // until it's made a full release (gh release edit v<version> --prerelease=false).
  publish: [{ provider: "github", owner: "AhmedGhaben", repo: "POS", releaseType: "prerelease" }],
  electronFuses: testBuild
    ? undefined
    : {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
        enableCookieEncryption: true,
        // The executable is always resource-edited, including on developer machines.
        enableEmbeddedAsarIntegrityValidation: true,
      },
};
