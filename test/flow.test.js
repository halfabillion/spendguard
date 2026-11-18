import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TelegraphClient } from "../src/telegraph.js";
import { ExpenseLedger } from "../src/ledger.js";
import { considerPayment } from "../src/flow.js";
import { demoFixtures } from "../src/fixtures.js";

describe("considerPayment", () => {
  it("settles a clear payment and records burn, then blocks a sanctioned one", async () => {
    const client = new TelegraphClient({ mode: "mock", fixtures: demoFixtures() });
    const ledger = new ExpenseLedger();

    const allowed = await considerPayment(client, ledger, {
      payeeName: "Acme Treasury Ltd",
      subject: "Acme Treasury Ltd",
      transaction: "pay-acme-001",
      category: "intelligence",
      task: "screen-and-pay-vendor",
      amountUsdc: 1.25,
      quoteGas: true,
    });
    assert.equal(allowed.settled, true);
    assert.equal(allowed.entry.status, "settled");
    assert.equal(allowed.entry.amountUsdc, 1.25);
    // 3 screening calls + 1 gas quote
    assert.equal(allowed.entry.intelligenceCostUsd, 0.04);
    assert.equal(allowed.gas.result.gas_price_gwei, 1.2);

    const denied = await considerPayment(client, ledger, {
      payeeName: "Flagged Vendor GmbH",
      subject: "Flagged Vendor GmbH",
      transaction: "pay-flagged-001",
      category: "intelligence",
      task: "screen-and-pay-vendor",
      amountUsdc: 5,
      quoteGas: true,
    });
    assert.equal(denied.settled, false);
    assert.equal(denied.entry.status, "blocked");
    assert.equal(denied.entry.amountUsdc, 0);
    assert.ok(denied.reasons.includes("sanctions_match"));

    const summary = ledger.summary();
    assert.equal(summary.settlementCount, 1);
    assert.equal(summary.blockedCount, 1);
    assert.equal(summary.burnByCategory.intelligence, 1.29);
    assert.equal(summary.costPerTask["screen-and-pay-vendor"].completed, 1);
  });
});
