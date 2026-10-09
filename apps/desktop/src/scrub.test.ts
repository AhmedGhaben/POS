import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scrub } from "./scrub";

describe("log scrubbing", () => {
  it("removes bearer tokens, JWTs and secret fields", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123";
    const header = scrub(`Authorization: Bearer ${jwt}`);
    assert.ok(!header.includes("eyJ") && header.includes("[redacted]"), header);
    assert.equal(scrub(`token ${jwt} here`), "token [jwt] here");
    assert.equal(scrub('{"password":"hunter2","name":"x"}'), '{"password":[redacted],"name":"x"}');
    assert.equal(scrub("refreshToken=abc123; path=/"), "refreshToken=[redacted]; path=/");
  });

  it("removes card numbers but keeps barcodes and timestamps", () => {
    assert.equal(scrub("card 4111 1111 1111 1111 ok"), "card [card] ok");
    assert.equal(scrub("barcode 5012345678900"), "barcode 5012345678900");
    assert.equal(scrub("at 1791555095572"), "at 1791555095572");
  });
});
