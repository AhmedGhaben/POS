import assert from "node:assert/strict";
import net from "node:net";
import { describe, it } from "node:test";
import { concat, cutCommand, drawerKick, feedAndCut, initialize, openDrawerCommand, toHex } from "./escpos";
import { SerialTransport, Tcp9100Transport, TransportError, type SerialIo } from "./transports";

describe("ESC/POS commands", () => {
  it("initialize is ESC @", () => {
    assert.equal(toHex(initialize()), "1b 40");
  });

  it("drawer kick: pin 2 → m=0, pin 5 → m=1, times in 2 ms units", () => {
    assert.equal(toHex(drawerKick(2, 100, 500)), "1b 70 00 32 fa");
    assert.equal(toHex(drawerKick(5, 100, 500)), "1b 70 01 32 fa");
  });

  it("drawer kick clamps times to one byte", () => {
    assert.deepEqual(Array.from(drawerKick(2, 0, 10_000)).slice(3), [1, 255]);
  });

  it("open-drawer command is reset + kick", () => {
    assert.equal(toHex(openDrawerCommand(2, 100)), "1b 40 1b 70 00 32 64");
  });

  it("partial cut after feeding three lines", () => {
    assert.equal(toHex(feedAndCut(0, true)), "1d 56 42 00");
    assert.equal(toHex(cutCommand()), "1b 64 03 1d 56 42 00");
  });

  it("concat keeps order", () => {
    assert.equal(toHex(concat(Uint8Array.of(1), Uint8Array.of(2, 3))), "01 02 03");
  });
});

/** A stand-in network printer on port 0 that records what it receives. */
function fakePrinter(): Promise<{ port: number; received: Promise<Buffer>; close: () => void }> {
  return new Promise((resolve) => {
    let deliver: (b: Buffer) => void;
    const received = new Promise<Buffer>((r) => (deliver = r));
    const server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => deliver(Buffer.concat(chunks)));
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ port: (server.address() as net.AddressInfo).port, received, close: () => server.close() }),
    );
  });
}

describe("Tcp9100Transport", () => {
  it("delivers the exact bytes to a network printer", async () => {
    const printer = await fakePrinter();
    try {
      await new Tcp9100Transport("127.0.0.1", printer.port).send(openDrawerCommand(5, 120));
      assert.equal(toHex(await printer.received), "1b 40 1b 70 01 3c 78");
    } finally {
      printer.close();
    }
  });

  it("a refused connection is a clear TransportError", async () => {
    const closed = await fakePrinter();
    closed.close();
    await assert.rejects(new Tcp9100Transport("127.0.0.1", closed.port).send(initialize()), (err: Error) => {
      assert.ok(err instanceof TransportError);
      assert.match(err.message, /refused the connection/);
      return true;
    });
  });
});

describe("SerialTransport", () => {
  function fakeIo(overrides: Partial<SerialIo> = {}) {
    const calls: string[] = [];
    const io: SerialIo = {
      configure: async (port, baud) => {
        calls.push(`configure ${port} ${baud}`);
      },
      write: async (port, data) => {
        calls.push(`write ${port} ${toHex(data)}`);
      },
      ...overrides,
    };
    return { io, calls };
  }

  it("configures the port, then writes the bytes", async () => {
    const { io, calls } = fakeIo();
    await new SerialTransport("com3", 19200, io).send(drawerKick(2, 100, 500));
    assert.deepEqual(calls, ["configure COM3 19200", "write COM3 1b 70 00 32 fa"]);
  });

  it("rejects names that aren't COM ports", () => {
    assert.throws(() => new SerialTransport("LPT1"), TransportError);
    assert.throws(() => new SerialTransport("COM3; del *"), TransportError);
  });

  it("explains a busy port", async () => {
    const busy = Object.assign(new Error("busy"), { code: "EBUSY" });
    const { io } = fakeIo({ write: async () => Promise.reject(busy) });
    await assert.rejects(new SerialTransport("COM4", 9600, io).send(initialize()), /in use by another program/);
  });

  it("a device that hangs times out", async () => {
    const { io } = fakeIo({ write: () => new Promise(() => undefined) });
    await assert.rejects(new SerialTransport("COM4", 9600, io, 200).send(initialize()), /didn't respond/);
  });
});
