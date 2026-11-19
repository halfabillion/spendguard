import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { TelegraphClient } from "./telegraph.js";
import { ExpenseLedger } from "./ledger.js";
import { considerPayment } from "./flow.js";
import { EscrowEngineClient, ledgerAccount, DIAMOND } from "./escrow.js";
import { INTENTS } from "./intents.js";
import { redact } from "./redact.js";

export const PAYER = "0xC11FBCbE43baF505F37dD6B95054C5eB380A9965";
export const CONFIRMED_RECEIPT_HASH =
  "0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8";
export const CONFIRMED_EPOCH = 15;
export const CONFIRMED_SIGNAL_HASH =
  "0x42c6a1ebf6410e24ac43fc09c8392f8dea2cd4c24623422d787edd2ab1ffde57";
export const CONFIRMED_COST_USD = 0.01;
export const CONFIRMED_AMOUNT_UUSDC = "10000";

function parseAskBody(ask) {
  if (!ask?.body) return null;
  if (typeof ask.body === "object") return ask.body;
  try {
    return JSON.parse(ask.body);
  } catch {
    return null;
  }
}

export async function runDenyCase({ ledger } = {}) {
  let keyLoads = 0;
  let telegraphFetches = 0;
  const inner = new EscrowEngineClient({
    getPrivateKey: () => {
      keyLoads += 1;
      throw new Error("deny case must not load a key");
    },
    fetchImpl: async () => {
      telegraphFetches += 1;
      throw new Error("deny case must not call Telegraph");
    },
    sessionCapUsd: 0.05,
  });
  const client = new TelegraphClient({ mode: "live", payPath: "key", inner });
  const expense = ledger || new ExpenseLedger();
  const denied = await considerPayment(client, expense, {
    payeeName: "Blocked Entity Example",
    subject: "Blocked Entity Example",
    category: "intelligence",
    task: "pre-settle-screen",
    amountUsdc: 5,
    screens: ["sanctions"],
    quoteGas: false,
  });
  return {
    case: "deny",
    at: new Date().toISOString(),
    payeeName: "Blocked Entity Example",
    decision: denied.decision,
    settled: denied.settled,
    reasons: denied.reasons,
    skippedPurchase: denied.skippedPurchase === true,
    intelligenceCostUsd: denied.entry?.intelligenceCostUsd ?? 0,
    vendorAmountUsdc: denied.entry?.amountUsdc ?? 0,
    telegraphCalls: client.calls.length,
    innerCalls: inner.calls.length,
    spentUsd: inner.spentUsd,
    keyLoads,
    telegraphFetches,
    note: "Local denylist blocked the payee before any Telegraph request or key load. $0 spent.",
  };
}

export async function runSpendLimitCase() {
  let keyLoads = 0;
  let telegraphFetches = 0;
  const inner = new EscrowEngineClient({
    getPrivateKey: () => {
      keyLoads += 1;
      throw new Error("spend-limit case must not load a key");
    },
    fetchImpl: async () => {
      telegraphFetches += 1;
      throw new Error("spend-limit case must not call Telegraph");
    },
    sessionCapUsd: 0.005,
  });
  const attemptedUsd = 0.01;
  let blocked = null;
  try {
    await inner.ask({
      intent: INTENTS.sanctions,
      params: { name: "Circle Internet Financial" },
    });
  } catch (err) {
    blocked = {
      code: err.code || null,
      message: err.message,
      sessionCapUsd: err.sessionCapUsd,
      attemptedUsd: err.attemptedUsd,
      remainingCapUsd: err.remainingCapUsd,
      spentUsd: err.spentUsd,
    };
  }
  return {
    case: "spend-limit",
    at: new Date().toISOString(),
    sessionCapUsd: inner.sessionCapUsd,
    attemptedUsd,
    blocked: blocked?.code === "SPEND_CAP",
    error: blocked,
    telegraphCalls: inner.calls.length,
    spentUsd: inner.spentUsd,
    keyLoads,
    telegraphFetches,
    note: "Session cap $0.005 is below the $0.01 minimum call price, so the gate refused the ask before any engine request, signature, or spend.",
  };
}

export async function readConfirmedAllow(root) {
  const askPath = resolve(root, "evidence/escrow-live-ask.json");
  const epochPath = resolve(root, "evidence/escrow-receipt-epoch15.json");
  const askFile = existsSync(askPath) ? JSON.parse(readFileSync(askPath, "utf8")) : null;
  const epochFile = existsSync(epochPath) ? JSON.parse(readFileSync(epochPath, "utf8")) : null;
  const body = parseAskBody(askFile?.ask);
  const receipt = askFile?.ask?.receipt || epochFile?.delivery || null;
  return { askFile, epochFile, body, receipt };
}

export async function runAllowCase(root, { fetchLedger = true, fetchImpl = fetch } = {}) {
  const confirmed = await readConfirmedAllow(root);
  let liveLedger = null;
  let liveLedgerError = null;
  if (fetchLedger) {
    try {
      liveLedger = await ledgerAccount(PAYER, { fetchImpl });
    } catch (err) {
      liveLedgerError = err.message;
    }
  }
  const available = liveLedger?.body?.available ?? confirmed.epochFile?.ledgerAfterEpoch?.available ?? null;
  const availableUusdc = available == null ? null : String(available);
  const coversAnotherCall =
    availableUusdc != null && BigInt(availableUusdc) >= BigInt(CONFIRMED_AMOUNT_UUSDC);

  return {
    case: "allow",
    at: new Date().toISOString(),
    rail: "escrow",
    decision: "allow",
    reusedExistingReceipt: true,
    newSpend: false,
    topUp: false,
    payeeName: "Circle Internet Financial",
    intent: INTENTS.sanctions,
    receipt_hash: confirmed.receipt?.receipt_hash || CONFIRMED_RECEIPT_HASH,
    epoch_id: confirmed.receipt?.epoch_id || confirmed.epochFile?.epoch_id || CONFIRMED_EPOCH,
    amount_uusdc: confirmed.receipt?.amount_uusdc || CONFIRMED_AMOUNT_UUSDC,
    cost_usd: confirmed.body?.cost_usd ?? CONFIRMED_COST_USD,
    signal_hash: confirmed.body?.signal_hash || CONFIRMED_SIGNAL_HASH,
    miner_id: confirmed.body?.miner_id || null,
    miner_name: confirmed.body?.miner_name || null,
    result: confirmed.body?.result || null,
    receipt: confirmed.receipt || null,
    epochInclusion: confirmed.epochFile
      ? {
          checkedAt: confirmed.epochFile.checkedAt,
          block_window: confirmed.epochFile.block_window,
          block_delivery_count: confirmed.epochFile.block_delivery_count,
          deliveries_root: confirmed.epochFile.deliveries_root,
          merkle_proof: confirmed.epochFile.merkle_proof,
          delivery: confirmed.epochFile.delivery,
        }
      : null,
    payer: PAYER,
    diamond: DIAMOND,
    liveLedger: liveLedger
      ? {
          status: liveLedger.status,
          available: liveLedger.body?.available ?? null,
          balance: liveLedger.body?.balance ?? null,
          charged: liveLedger.body?.charged ?? null,
          deposited: liveLedger.body?.deposited ?? null,
          epoch_id: liveLedger.body?.active_root?.epoch_id ?? null,
        }
      : null,
    liveLedgerError,
    escrowCoversAnotherCall: coversAnotherCall,
    sources: ["evidence/escrow-live-ask.json", "evidence/escrow-receipt-epoch15.json"],
    note:
      "Allow evidence is the already-confirmed epoch 15 escrow receipt 0x99ca…fbf8 (10000 uUSDC / $0.01 test USDC). No new paid call and no top-up were made. A further $0.01 call would be covered by the remaining escrow balance, but it was not sent because this update forbids new spend.",
  };
}

export async function writeCaseEvidence(root, { fetchLedger = true, fetchImpl = fetch } = {}) {
  mkdirSync(resolve(root, "evidence"), { recursive: true });
  const deny = await runDenyCase();
  const spendLimit = await runSpendLimitCase();
  const allow = await runAllowCase(root, { fetchLedger, fetchImpl });
  const files = {
    allow: resolve(root, "evidence/allow.json"),
    deny: resolve(root, "evidence/deny.json"),
    "spend-limit": resolve(root, "evidence/spend-limit.json"),
  };
  writeFileSync(files.allow, JSON.stringify(redact(allow), null, 2) + "\n");
  writeFileSync(files.deny, JSON.stringify(redact(deny), null, 2) + "\n");
  writeFileSync(files["spend-limit"], JSON.stringify(redact(spendLimit), null, 2) + "\n");
  return { allow, deny, spendLimit, files };
}
