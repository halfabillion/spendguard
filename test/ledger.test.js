import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExpenseLedger } from "../src/ledger.js";

describe("ExpenseLedger", () => {
  it("aggregates burn per category and cost per task", () => {
    const ledger = new ExpenseLedger();
    ledger.record({
      status: "settled",
      category: "intelligence",
      task: "screen-and-pay-vendor",
      amountUsdc: 1,
      intelligenceCostUsd: 0.03,
    });
    ledger.record({
      status: "settled",
      category: "intelligence",
      task: "screen-and-pay-vendor",
      amountUsdc: 2,
      intelligenceCostUsd: 0.03,
    });
    ledger.record({
      status: "blocked",
      category: "intelligence",
      task: "screen-and-pay-vendor",
      amountUsdc: 0,
      intelligenceCostUsd: 0.03,
      reasons: ["sanctions_match"],
    });
    const s = ledger.summary();
    assert.equal(s.settlementCount, 2);
    assert.equal(s.blockedCount, 1);
    assert.equal(s.burnByCategory.intelligence, 3.06);
    assert.equal(s.costPerTask["screen-and-pay-vendor"].completed, 2);
    assert.equal(s.costPerTask["screen-and-pay-vendor"].averageUsd, 1.53);
    assert.equal(s.totalSettledUsd, 3.06);
  });

  it("rejects incomplete entries", () => {
    const ledger = new ExpenseLedger();
    assert.throws(() => ledger.record({ status: "settled", category: "x" }), /task/);
  });
});
