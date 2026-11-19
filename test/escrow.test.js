import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EscrowEngineClient, escrowEntry, quotedUsdc, quotedValueFromEntry } from "../src/escrow.js";
import { TelegraphClient } from "../src/telegraph.js";
import { INTENTS } from "../src/intents.js";
import { ExpenseLedger } from "../src/ledger.js";
import { considerPayment } from "../src/flow.js";
import { resolvePayPath, DEFAULT_PAY_PATH } from "../src/paypath.js";
import { runDenyCase, runSpendLimitCase, writeCaseEvidence } from "../src/cases.js";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function receiptHeader(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

const receipt = {
  receipt_hash: "0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8",
  rail: "escrow",
  payer: "0xc11fbcbe43baf505f37dd6b95054c5eb380a9965",
  miner: "6119",
  intent: INTENTS.sanctions,
  amount_uusdc: "10000",
  epoch_id: 15,
  settlement: "epoch",
  chain: "telegraph",
};

describe("pay path defaults", () => {
  it("defaults TELEGRAPH_PAY to key (escrow)", () => {
    assert.equal(DEFAULT_PAY_PATH, "key");
    assert.equal(resolvePayPath(""), "key");
    assert.equal(resolvePayPath("escrow"), "key");
    assert.equal(resolvePayPath("x402"), "x402");
    assert.equal(resolvePayPath("anjoman"), "anjoman");
  });

  it("uses key as the live TelegraphClient default rail", () => {
    const client = new TelegraphClient({ mode: "live", inner: { ask: async () => ({ rail: "escrow" }) } });
    assert.equal(client.payPath, "key");
  });
});

describe("EscrowEngineClient", () => {
  it("parses a paid escrow ask and records cost", async () => {
    let fetches = 0;
    const fetchImpl = async (url, init) => {
      fetches += 1;
      assert.match(String(url), /engine\/v1\/ask$/);
      const payment = init.headers["X-PAYMENT"] || init.headers["x-payment"];
      if (!payment) {
        return {
          ok: false,
          status: 402,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              accepts: [
                {
                  scheme: "escrow",
                  network: "eip155:11155111",
                  payTo: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
                  extra: { message: "Pay Amount: 10000 from {from} nonce {nonce} {validAfter} {validBefore}" },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) =>
            String(name).toLowerCase() === "x-payment-response" ? receiptHeader(receipt) : null,
        },
        text: async () =>
          JSON.stringify({
            intent: INTENTS.sanctions,
            miner_id: "302",
            miner_name: "ChainSight",
            result: { name: "Circle Internet Financial", matched: false, match_score: 0 },
            cost_usd: 0.01,
            signal_hash: "0xsignal",
          }),
      };
    };

    const inner = new EscrowEngineClient({
      getPrivateKey: () => "0x" + "11".repeat(32),
      fetchImpl,
      sessionCapUsd: 0.05,
    });
    const client = new TelegraphClient({ mode: "live", payPath: "key", inner });
    const ledger = new ExpenseLedger();
    const outcome = await considerPayment(client, ledger, {
      payeeName: "Circle Internet Financial",
      category: "intelligence",
      task: "pre-settle-screen",
      amountUsdc: 0,
      screens: ["sanctions"],
    });
    assert.equal(outcome.decision, "allow");
    assert.equal(outcome.entry.receipts[0].receipt_hash, receipt.receipt_hash);
    assert.equal(outcome.entry.intelligenceCostUsd, 0.01);
    assert.equal(inner.spentUsd, 0.01);
    assert.equal(inner.calls.length, 1);
    assert.equal(fetches, 2);
    assert.equal(outcome.proof.sanctions.rail, "escrow");
  });

  it("refuses a call that would exceed the session cap before any fetch or key load", async () => {
    let keyLoads = 0;
    let fetches = 0;
    const inner = new EscrowEngineClient({
      getPrivateKey: () => {
        keyLoads += 1;
        return "0x" + "11".repeat(32);
      },
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("should not pay");
      },
      sessionCapUsd: 0.005,
    });
    await assert.rejects(
      () => inner.ask({ intent: INTENTS.sanctions, params: { name: "X" } }),
      /spend cap/,
    );
    assert.equal(inner.calls.length, 0);
    assert.equal(inner.spentUsd, 0);
    assert.equal(keyLoads, 0);
    assert.equal(fetches, 0);
  });

  it("refuses a quoted amount over the remaining cap before signing", async () => {
    let signed = 0;
    const fetchImpl = async (_url, init) => {
      const payment = init.headers["X-PAYMENT"] || init.headers["x-payment"];
      if (payment) {
        signed += 1;
        throw new Error("should not sign or pay");
      }
      return {
        ok: false,
        status: 402,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            accepts: [
              {
                scheme: "escrow",
                network: "eip155:11155111",
                payTo: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
                extra: { message: "Pay Amount: 20000 from {from} nonce {nonce} {validAfter} {validBefore}" },
              },
            ],
          }),
      };
    };
    const inner = new EscrowEngineClient({
      getPrivateKey: () => "0x" + "11".repeat(32),
      fetchImpl,
      sessionCapUsd: 0.015,
    });
    await assert.rejects(
      () => inner.ask({ intent: INTENTS.sanctions, params: { name: "X" } }),
      /spend cap/,
    );
    assert.equal(inner.calls.length, 0);
    assert.equal(inner.spentUsd, 0);
    assert.equal(signed, 0);
  });

  it("reads the quoted amount from an escrow 402 entry", () => {
    const entry = escrowEntry([
      { scheme: "exact", network: "eip155:11155111" },
      {
        scheme: "escrow",
        network: "eip155:11155111",
        extra: { message: "Amount: 10000 units" },
      },
    ]);
    assert.equal(quotedValueFromEntry(entry), "10000");
    assert.equal(quotedUsdc("10000"), 0.01);
  });
});

describe("evidence cases", () => {
  it("denies a denylisted payee with zero Telegraph calls or key loads", async () => {
    const deny = await runDenyCase();
    assert.equal(deny.decision, "deny");
    assert.equal(deny.skippedPurchase, true);
    assert.deepEqual(deny.reasons, ["local_denylist"]);
    assert.equal(deny.telegraphCalls, 0);
    assert.equal(deny.innerCalls, 0);
    assert.equal(deny.spentUsd, 0);
    assert.equal(deny.keyLoads, 0);
    assert.equal(deny.telegraphFetches, 0);
  });

  it("blocks an over-budget ask before any spend", async () => {
    const limit = await runSpendLimitCase();
    assert.equal(limit.blocked, true);
    assert.equal(limit.error.code, "SPEND_CAP");
    assert.equal(limit.telegraphCalls, 0);
    assert.equal(limit.spentUsd, 0);
    assert.equal(limit.keyLoads, 0);
    assert.equal(limit.telegraphFetches, 0);
  });

  it("reuses the confirmed epoch 15 receipt as allow evidence without a new paid call", async () => {
    const root = mkdtempSync(join(tmpdir(), "spendguard-cases-"));
    mkdirSync(join(root, "evidence"));
    const fixtureAsk = {
      ask: {
        stage: "paid",
        status: 200,
        receipt,
        body: JSON.stringify({
          miner_id: "302",
          miner_name: "ChainSight",
          result: { name: "Circle Internet Financial", matched: false },
          cost_usd: 0.01,
          signal_hash: "0xabc",
        }),
      },
    };
    const fixtureEpoch = {
      receipt_hash: receipt.receipt_hash,
      epoch_id: 15,
      merkle_proof: ["0x1"],
      deliveries_root: "0xroot",
      delivery: { receipt_hash: receipt.receipt_hash, usdc: 10000 },
      ledgerAfterEpoch: { available: "990000" },
    };
    writeFileSync(join(root, "evidence/escrow-live-ask.json"), JSON.stringify(fixtureAsk));
    writeFileSync(join(root, "evidence/escrow-receipt-epoch15.json"), JSON.stringify(fixtureEpoch));
    const out = await writeCaseEvidence(root, {
      fetchLedger: true,
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({ available: "990000", balance: "990000", charged: "10000", deposited: "1000000", active_root: { epoch_id: 15 } }),
      }),
    });
    assert.equal(out.allow.reusedExistingReceipt, true);
    assert.equal(out.allow.newSpend, false);
    assert.equal(out.allow.receipt_hash, receipt.receipt_hash);
    assert.equal(out.allow.epoch_id, 15);
    assert.equal(out.allow.escrowCoversAnotherCall, true);
    const written = JSON.parse(readFileSync(out.files.allow, "utf8"));
    assert.equal(written.receipt_hash, receipt.receipt_hash);
  });
});
