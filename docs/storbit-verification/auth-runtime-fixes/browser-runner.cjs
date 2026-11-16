const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'browser-runtime.cjs')], {
  env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(__dirname, 'browser-launch.log'));
child.stdout.pipe(log); child.stderr.pipe(log);
const timeout = setTimeout(() => child.kill(), 55000);
child.on('error', error => { log.end(String(error)); clearTimeout(timeout); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timeout); log.end(); console.log(`Sandboxed Chromium exit: ${code}`); process.exitCode = code ?? 1; });
