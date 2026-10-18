import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowsPrerelease } from "./update-channel";

describe("update channel", () => {
  it("only Beta installs pre-releases; Stable, and a computer that never chose, wait for full releases", () => {
    assert.equal(allowsPrerelease("beta"), true);
    assert.equal(allowsPrerelease("stable"), false);
    assert.equal(allowsPrerelease(undefined), false);
  });
});
