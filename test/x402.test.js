import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { X402EngineClient, parseTelegraphReceipt } from "../src/x402.js";
import { TelegraphClient } from "../src/telegraph.js";
import { INTENTS } from "../src/intents.js";
import { ExpenseLedger } from "../src/ledger.js";
import { considerPayment } from "../src/flow.js";

function receiptHeader(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("X402EngineClient", () => {
  it("parses X-TELEGRAPH-RECEIPT and records a paid ask", async () => {
    const receipt = {
      receipt_hash: "0xabc123",
      rail: "x402",
      payer: "0xC11FBCbE43baF505F37dD6B95054C5eB380A9965",
      miner: "4664",
      intent: INTENTS.sanctions,
      amount_uusdc: "10000",
      epoch_id: 1954,
      settlement: "onchain",
      chain: "eip155:11155111",
      tx_hash: "0xdef456",
    };
    const paidFetch = async (url, init) => {
      assert.match(url, /engine\/v1\/ask$/);
      const body = JSON.parse(init.body);
      assert.equal(body.intent, INTENTS.sanctions);
      assert.equal(body.max_budget_usdc, undefined);
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) =>
            String(name).toLowerCase() === "x-telegraph-receipt" ? receiptHeader(receipt) : null,
        },
        text: async () =>
          JSON.stringify({
            intent: INTENTS.sanctions,
            miner_id: "m1",
            result: { name: "Circle Internet Financial", matched: false, match_score: 0 },
            cost_usd: 0.01,
            signal_hash: "0xsignal",
          }),
      };
    };
    const inner = new X402EngineClient({ paidFetch, sessionCapUsd: 0.05 });
    const client = new TelegraphClient({ mode: "live", payPath: "x402", inner });
    const ledger = new ExpenseLedger();
    const outcome = await considerPayment(client, ledger, {
      payeeName: "Circle Internet Financial",
      category: "intelligence",
      task: "pre-settle-screen",
      amountUsdc: 0,
      screens: ["sanctions"],
    });
    assert.equal(outcome.decision, "allow");
    assert.equal(outcome.entry.receipts[0].tx_hash, "0xdef456");
    assert.equal(outcome.entry.receipts[0].receipt_hash, "0xabc123");
    assert.equal(outcome.entry.receipts[0].signal_hash, "0xsignal");
    assert.equal(outcome.entry.intelligenceCostUsd, 0.01);
    assert.equal(inner.spentUsd, 0.01);
  });

  it("refuses a call that would exceed the session cap", async () => {
    const inner = new X402EngineClient({
      paidFetch: async () => {
        throw new Error("should not pay");
      },
      sessionCapUsd: 0.005,
    });
    await assert.rejects(() => inner.ask({ intent: INTENTS.sanctions, params: { name: "X" } }), /spend cap/);
  });

  it("parses a base64 telegraph receipt header", () => {
    const parsed = parseTelegraphReceipt({
      headers: {
        get: () => receiptHeader({ receipt_hash: "0x1", tx_hash: "0x2", payer: "0xabc" }),
      },
    });
    assert.equal(parsed.receipt_hash, "0x1");
    assert.equal(parsed.tx_hash, "0x2");
  });
});
