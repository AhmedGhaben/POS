const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const buildConfigPath = path.join(__dirname, "electron-builder.config.js");

function loadConfig() {
  delete require.cache[require.resolve(buildConfigPath)];
  return require(buildConfigPath);
}

test("Windows installers always embed the STORBIT executable icon", () => {
  const config = loadConfig();
  assert.equal(config.appId, "app.pos.desktop", "Preserve existing installation identity");
  assert.equal(config.productName, "STORBIT");
  assert.equal(config.win.icon, "build/icon.ico");
  assert.equal(config.win.signAndEditExecutable, true, "Never ship a generic Electron icon");
  assert.equal(config.nsis.shortcutName, "STORBIT");
  assert.equal(config.nsis.deleteAppDataOnUninstall, false, "Preserve till data");
  assert.ok(fs.statSync(path.join(__dirname, config.win.icon)).size > 0);
});

test("local installer builds embed the icon even without CI or opt-in flags", () => {
  const priorCI = process.env.CI;
  const priorOptIn = process.env.POS_EDIT_EXE;
  try {
    delete process.env.CI;
    delete process.env.POS_EDIT_EXE;
    const config = loadConfig();
    assert.equal(config.win.signAndEditExecutable, true);
    assert.equal(config.electronFuses.enableEmbeddedAsarIntegrityValidation, true);
  } finally {
    if (priorCI === undefined) delete process.env.CI;
    else process.env.CI = priorCI;
    if (priorOptIn === undefined) delete process.env.POS_EDIT_EXE;
    else process.env.POS_EDIT_EXE = priorOptIn;
    delete require.cache[require.resolve(buildConfigPath)];
  }
});
