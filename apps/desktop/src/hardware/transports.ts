import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";

/**
 * How raw ESC/POS bytes reach a device. Drawer, cutter and customer display
 * code only ever sees this interface, so the connection (USB printer in
 * Windows, network printer, COM port) is a setting, not a code path.
 */
export interface EscPosTransport {
  /** For logs and error messages, e.g. `printer "EPSON TM-T20III"`. */
  readonly label: string;
  send(data: Uint8Array): Promise<void>;
}

export class TransportError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new TransportError(`${what} didn't respond within ${ms / 1000} s`)), ms);
    }),
  ]);
}

/** Network printers: raw bytes to TCP port 9100 on the shop LAN (no internet needed). */
export class Tcp9100Transport implements EscPosTransport {
  readonly label: string;

  constructor(
    private readonly host: string,
    private readonly port = 9100,
    private readonly timeoutMs = 5000,
  ) {
    this.label = `network printer ${host}:${port}`;
  }

  send(data: Uint8Array): Promise<void> {
    const attempt = new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host: this.host, port: this.port });
      socket.once("error", (err: NodeJS.ErrnoException) => {
        socket.destroy();
        const reason =
          err.code === "ECONNREFUSED"
            ? "refused the connection"
            : err.code === "EHOSTUNREACH" || err.code === "ENETUNREACH"
              ? "can't be reached"
              : err.message;
        reject(new TransportError(`The ${this.label} ${reason}`));
      });
      socket.once("connect", () => {
        socket.end(Buffer.from(data), () => resolve());
      });
    });
    return withTimeout(attempt, this.timeoutMs, `The ${this.label}`);
  }
}

/** Seams for tests: the real ones run `mode.com` and write to the port. */
export interface SerialIo {
  configure(port: string, baudRate: number): Promise<void>;
  write(port: string, data: Uint8Array): Promise<void>;
}

export const windowsSerialIo: SerialIo = {
  configure: (port, baudRate) =>
    new Promise((resolve, reject) => {
      execFile(
        "mode.com",
        [`${port}:`, `BAUD=${baudRate}`, "PARITY=N", "DATA=8", "STOP=1"],
        { windowsHide: true, timeout: 5000 },
        (err, stdout) => {
          if (err || /illegal|cannot|not found|invalid/i.test(stdout)) {
            reject(new TransportError(`${port} isn't available (is the device plugged in?)`));
          } else resolve();
        },
      );
    }),
  write: async (port, data) => {
    const handle = await fs.open(`\\\\.\\${port}`, "w");
    try {
      await handle.write(data);
    } finally {
      await handle.close();
    }
  },
};

/**
 * Serial/COM devices (older printers, RS-232 drawers, pole displays). Uses
 * Windows' own `mode` and the port device directly: no native module.
 */
export class SerialTransport implements EscPosTransport {
  readonly label: string;

  constructor(
    private readonly port: string,
    private readonly baudRate = 9600,
    private readonly io: SerialIo = windowsSerialIo,
    private readonly timeoutMs = 5000,
  ) {
    if (!/^COM\d{1,3}$/i.test(port)) throw new TransportError(`"${port}" isn't a COM port name`);
    this.label = `${port.toUpperCase()} (${baudRate} baud)`;
  }

  async send(data: Uint8Array): Promise<void> {
    const port = this.port.toUpperCase();
    const run = async () => {
      await this.io.configure(port, this.baudRate);
      try {
        await this.io.write(port, data);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        throw new TransportError(
          code === "ENOENT" ? `${port} doesn't exist` : code === "EBUSY" || code === "EACCES" ? `${port} is in use by another program` : `${port}: ${(err as Error).message}`,
        );
      }
    };
    return withTimeout(run(), this.timeoutMs, port);
  }
}

/**
 * Sends RAW jobs through the Windows spooler (OpenPrinter/WritePrinter with
 * datatype RAW), for printers installed in Windows: USB, and network
 * printers set up with a TCP/IP port. One long-lived PowerShell helper
 * compiles the winspool calls once, then takes one JSON job per line.
 * Kept behind EscPosTransport so it can be swapped (FFI, native module,
 * helper exe) without touching anything else.
 */
const RAW_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PosRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERR " + Marshal.GetLastWin32Error();
    try {
      DOCINFO info = new DOCINFO();
      info.pDocName = "POS";
      info.pDataType = "RAW";
      if (StartDocPrinter(h, 1, info) == 0) return "ERR " + Marshal.GetLastWin32Error();
      try {
        StartPagePrinter(h);
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        if (!ok || written != data.Length) return "ERR " + Marshal.GetLastWin32Error();
      } finally { EndDocPrinter(h); }
      return "OK";
    } finally { ClosePrinter(h); }
  }
}
"@
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try {
    $job = $line | ConvertFrom-Json
    $result = [PosRaw]::Send($job.printer, [Convert]::FromBase64String($job.data))
  } catch { $result = 'EXC ' + ($_.Exception.Message -replace '\s+', ' ') }
  [Console]::Out.WriteLine($result)
}
`;

const WIN32_ERRORS: Record<string, string> = {
  "1801": "isn't installed in Windows",
  "5": "refused access",
  "1722": "can't be reached (print spooler/RPC unavailable)",
  "1726": "can't be reached (print spooler/RPC unavailable)",
};

class RawPrintHelper {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private buffer = "";
  private waiters: ((line: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  start(): Promise<void> {
    if (this.ready && this.child && this.child.exitCode === null) return this.ready;
    const encoded = Buffer.from(RAW_HELPER, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true },
    );
    this.child = child;
    this.buffer = "";
    this.waiters = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line) this.waiters.shift()?.(line);
      }
    });
    child.on("exit", () => {
      for (const w of this.waiters.splice(0)) w("EXC print helper stopped");
      if (this.child === child) this.child = null;
    });
    this.ready = new Promise<void>((resolve, reject) => {
      this.waiters.push((line) => (line === "READY" ? resolve() : reject(new TransportError(line))));
    });
    return this.ready;
  }

  private nextLine(): Promise<string> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  send(printer: string, data: Uint8Array, timeoutMs: number): Promise<string> {
    const job = this.queue.then(async () => {
      await withTimeout(this.start(), 20_000, "The Windows print helper");
      const line = this.nextLine();
      this.child!.stdin.write(`${JSON.stringify({ printer, data: Buffer.from(data).toString("base64") })}\n`);
      try {
        return await withTimeout(line, timeoutMs, `Printer "${printer}"`);
      } catch (err) {
        // A stuck helper is replaced on the next job.
        this.stop();
        throw err;
      }
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  stop() {
    this.child?.kill();
    this.child = null;
    this.ready = null;
  }
}

const rawHelper = new RawPrintHelper();

export function stopRawPrintHelper() {
  rawHelper.stop();
}

/** Starts the helper ahead of the first job (it takes ~1 s to compile). */
export function warmRawPrintHelper() {
  rawHelper.start().catch(() => undefined);
}

export class WindowsRawTransport implements EscPosTransport {
  readonly label: string;

  constructor(
    private readonly printerName: string,
    private readonly timeoutMs = 10_000,
  ) {
    this.label = `printer "${printerName}"`;
  }

  async send(data: Uint8Array): Promise<void> {
    const result = await rawHelper.send(this.printerName, data, this.timeoutMs);
    if (result === "OK") return;
    const code = result.startsWith("ERR ") ? result.slice(4) : null;
    const reason = code ? (WIN32_ERRORS[code] ?? `failed (Windows error ${code})`) : result.replace(/^EXC /, "failed: ");
    throw new TransportError(`Printer "${this.printerName}" ${reason}`);
  }
}

/** COM ports Windows knows about (HKLM\HARDWARE\DEVICEMAP\SERIALCOMM). */
export function listComPorts(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["query", "HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM"],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve([]);
        const ports = Array.from(stdout.matchAll(/REG_SZ\s+(COM\d+)/gi), (m) => m[1].toUpperCase());
        resolve([...new Set(ports)].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))));
      },
    );
  });
}
