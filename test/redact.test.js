import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redact, redactString } from "../src/redact.js";

describe("redact", () => {
  it("strips bearer tokens, anjoman keys, and 32-byte hex keys, but keeps addresses", () => {
    const addr = "0xC11FBCbE43baF505F37dD6B95054C5eB380A9965";
    const key = "0x" + "ab".repeat(32);
    const s = `Authorization: Bearer anjoman_live_exampletoken Authorization: Bearer ${key} payer ${addr}`;
    const out = redactString(s);
    assert.match(out, /0xC11FBCbE43baF505F37dD6B95054C5eB380A9965/);
    assert.equal(out.includes("anjoman_live_exampletoken"), false);
    assert.equal(out.includes(key), false);
    assert.match(out, /\[redacted\]/);
  });

  it("redacts Authorization fields in objects", () => {
    const out = redact({ Authorization: "Bearer anjoman_abc", cost: 0.01 });
    assert.equal(out.Authorization, "[redacted]");
    assert.equal(out.cost, 0.01);
  });
});
