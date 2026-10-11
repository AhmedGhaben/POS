import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toHex } from "./escpos";
import { centered, leftRight, poleBytes, poleLines, toDisplayAscii } from "./pole-display";

describe("pole display text", () => {
  it("strips accents and replaces what a VFD can't show", () => {
    assert.equal(toDisplayAscii("Café crème – 2€"), "Cafe creme - 2?");
    assert.equal(toDisplayAscii("خبز"), "???");
  });

  it("left/right lines are exactly 20 wide, value wins over label", () => {
    assert.equal(leftRight("TOTAL", "AOA 12.50"), "TOTAL      AOA 12.50");
    assert.equal(leftRight("Very long product name here", "$3.99"), "Very long prod $3.99");
  });

  it("centres short text", () => {
    assert.equal(centered("Welcome"), "      Welcome       ");
  });

  it("cart: last item on top, total below", () => {
    const [a, b] = poleLines({
      mode: "cart",
      lastItem: { name: "Bagel", quantity: 2, price: "$5.98" },
      lines: [],
      itemCount: 2,
      total: "$5.98",
    });
    assert.equal(a, "2x Bagel       $5.98");
    assert.equal(b, "TOTAL          $5.98");
  });

  it("paid: change for cash, thank you otherwise", () => {
    assert.deepEqual(poleLines({ mode: "paid", total: "$5.98", paid: "$10.00", change: "$4.02" }), [
      "PAID          $10.00",
      "CHANGE         $4.02",
    ]);
    assert.deepEqual(poleLines({ mode: "paid", total: "$5.98", paid: "$5.98", change: null }), [
      "TOTAL          $5.98",
      "     THANK YOU      ",
    ]);
  });

  it("uses the business language's words, folded to plain ASCII", () => {
    const labels = { total: "TOTAL", paid: "PAGO", change: "TROCO", thanks: "OBRIGADO" };
    assert.deepEqual(poleLines({ mode: "paid", total: "$5,98", paid: "$10,00", change: "$4,02", labels }), [
      "PAGO          $10,00",
      "TROCO          $4,02",
    ]);
    assert.deepEqual(poleLines({ mode: "paid", total: "$5,98", paid: "$5,98", change: null, labels }), [
      "TOTAL          $5,98",
      "      OBRIGADO      ",
    ]);
    // Accents can't be shown on a pole: they're dropped, not turned into "?".
    assert.deepEqual(poleLines({ mode: "cart", lastItem: null, lines: [], itemCount: 0, total: "$1", labels: { ...labels, total: "TOTAL À PAGAR" } })[1], "TOTAL A PAGAR     $1");
  });

  it("idle: a long welcome is split at a space", () => {
    assert.deepEqual(poleLines({ mode: "idle", message: "Welcome to Demo Retail Co." }), [
      "  Welcome to Demo   ",
      "     Retail Co.     ",
    ]);
  });
});

describe("pole display bytes", () => {
  const lines: [string, string] = ["A".padEnd(20), "B".padEnd(20)];

  it("epson: init, clear, then cursor to each line", () => {
    const hex = toHex(poleBytes(lines, "epson"));
    assert.ok(hex.startsWith("1b 40 0c 1f 24 01 01 41"), hex);
    assert.ok(hex.includes("1f 24 01 02 42"), hex);
  });

  it("cd5220: ESC Q A line CR, ESC Q B line CR", () => {
    const hex = toHex(poleBytes(lines, "cd5220"));
    assert.ok(hex.startsWith("1b 51 41 41"), hex);
    assert.ok(hex.includes("0d 1b 51 42 42"), hex);
    assert.ok(hex.endsWith("0d"));
  });

  it("plain: form feed then exactly 40 characters", () => {
    const bytes = poleBytes(lines, "plain");
    assert.equal(bytes[0], 0x0c);
    assert.equal(bytes.length, 41);
  });
});
