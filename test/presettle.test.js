import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TelegraphClient } from "../src/telegraph.js";
import { screenPayment } from "../src/presettle.js";
import { demoFixtures } from "../src/fixtures.js";

describe("screenPayment", () => {
  it("allows a clear payee", async () => {
    const client = new TelegraphClient({ mode: "mock", fixtures: demoFixtures() });
    const result = await screenPayment(client, {
      payeeName: "Acme Treasury Ltd",
      subject: "Acme Treasury Ltd",
      transaction: "pay-acme-001",
    });
    assert.equal(result.decision, "allow");
    assert.equal(result.allowed, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.proof.sanctions.result.matched, false);
    assert.equal(result.screeningCostUsd, 0.03);
  });

  it("denies a local-denylist payee before any Telegraph purchase", async () => {
    const client = new TelegraphClient({ mode: "mock", fixtures: demoFixtures() });
    const result = await screenPayment(client, {
      payeeName: "Blocked Entity Example",
      subject: "Blocked Entity Example",
      transaction: "pay-blocked-001",
    });
    assert.equal(result.decision, "deny");
    assert.equal(result.allowed, false);
    assert.deepEqual(result.reasons, ["local_denylist"]);
    assert.equal(result.skippedPurchase, true);
    assert.equal(result.screeningCostUsd, 0);
    assert.equal(client.calls.length, 0);
  });

  it("denies a sanctions match even if residual risk is only MEDIUM", async () => {
    const client = new TelegraphClient({ mode: "mock", fixtures: demoFixtures() });
    const result = await screenPayment(client, {
      payeeName: "Flagged Vendor GmbH",
      subject: "Flagged Vendor GmbH",
      transaction: "pay-flagged-001",
    });
    assert.equal(result.decision, "deny");
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes("sanctions_match"));
    assert.equal(result.proof.sanctions.result.matched, true);
    assert.equal(result.skippedPurchase, false);
  });

  it("denies HIGH transaction risk", async () => {
    const fixtures = demoFixtures();
    const client = new TelegraphClient({ mode: "mock", fixtures });
    // Override the clear payee's tx risk to HIGH.
    const { fixtureKey } = await import("../src/telegraph.js");
    const { INTENTS } = await import("../src/intents.js");
    fixtures[fixtureKey(INTENTS.transactionRisk, { transaction: "pay-acme-001" })] = {
      result: { risk_level: "HIGH", risk_score: 0.9, signals: ["anomaly"], summary: "high" },
      cost_usd: 0.01,
    };
    const result = await screenPayment(client, {
      payeeName: "Acme Treasury Ltd",
      subject: "Acme Treasury Ltd",
      transaction: "pay-acme-001",
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes("transaction_risk:HIGH"));
  });
});
