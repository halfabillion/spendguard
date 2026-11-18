#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TelegraphClient } from "./telegraph.js";
import { ExpenseLedger } from "./ledger.js";
import { considerPayment } from "./flow.js";
import { demoFixtures } from "./fixtures.js";
import { AnjomanKeyClient } from "./anjoman.js";
import { X402EngineClient, createPaidFetch, MAX_AMOUNT_PER_PAYMENT } from "./x402.js";
import {
  anjomanKeyAvailable,
  eoaKeyAvailable,
  readAnjomanKey,
  readEoaPrivateKey,
  readAddressFile,
  DEFAULT_EOA_ADDRESS_PATH,
} from "./secrets.js";
import { readBalances } from "./chain.js";
import { INTENTS } from "./intents.js";
import { redact, safeError } from "./redact.js";

const mode = process.env.TELEGRAPH_MODE || "mock";
const payPath = process.env.TELEGRAPH_PAY || "x402";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function demo() {
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
    chain: "ethereum",
  });

  const denied = await considerPayment(client, ledger, {
    payeeName: "Blocked Entity Example",
    subject: "Blocked Entity Example",
    transaction: "pay-blocked-001",
    category: "intelligence",
    task: "screen-and-pay-vendor",
    amountUsdc: 5,
    quoteGas: true,
    chain: "ethereum",
  });

  console.log("SpendGuard demo (mock, no network, no spend)");
  console.log("allow:", allowed.decision, "settled=", allowed.settled, "reasons=", allowed.reasons);
  console.log("deny: ", denied.decision, "settled=", denied.settled, "reasons=", denied.reasons);
  console.log("summary:", JSON.stringify(ledger.summary(), null, 2));
}

async function liveOnce() {
  if (payPath === "key") {
    if (!anjomanKeyAvailable()) {
      console.log("WAITING: Anjoman API key is not present at .secrets/anjoman_api_key (embedded wallet not provisioned). Key path is implemented and mock-tested only.");
      return { waiting: "anjoman-api-key" };
    }
    const inner = new AnjomanKeyClient({
      getKey: () => readAnjomanKey(),
    });
    const client = new TelegraphClient({ mode: "live", payPath: "key", inner });
    return runLiveScreen(client, { rail: "api-key" });
  }

  if (payPath === "x402") {
    if (!eoaKeyAvailable()) {
      console.log("WAITING: throwaway Sepolia EOA key is not present.");
      return { waiting: "eoa-key" };
    }
    const address = readAddressFile(DEFAULT_EOA_ADDRESS_PATH);
    const balances = await readBalances(address);
    console.log(
      "balances:",
      JSON.stringify({
        address: balances.address,
        ethWei: balances.ethWei,
        usdc: balances.usdc,
        token: balances.token,
        network: balances.network,
      }),
    );
    if (Number(balances.usdc) < 0.05) {
      console.log(
        "WAITING: Ethereum Sepolia test USDC is still 0 (or under $0.05) on the throwaway EOA. Need a little Sepolia ETH to mint, then one capped x402 purchase.",
      );
      return { waiting: "sepolia-eth-or-usdc", balances };
    }
    const inner = new X402EngineClient({
      paidFetch: createPaidFetch({
        getPrivateKey: () => readEoaPrivateKey(),
        maxAmountPerPayment: MAX_AMOUNT_PER_PAYMENT,
      }),
      sessionCapUsd: 0.05,
    });
    const client = new TelegraphClient({ mode: "live", payPath: "x402", inner });
    return runLiveScreen(client, {
      rail: "x402",
      balancesBefore: balances,
      address,
      faucet: {
        tx: "0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b",
        blockNumber: "12163102",
        amountEth: "0.25",
        explorer: "https://sepolia.etherscan.io/tx/0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b",
      },
      mint: {
        tx: "0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5",
        amountUsdc: "5",
        usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
        explorer: "https://sepolia.etherscan.io/tx/0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5",
      },
    });
  }

  throw new Error(`unknown TELEGRAPH_PAY: ${payPath}`);
}

function explorerTx(hash) {
  return hash ? `https://sepolia.etherscan.io/tx/${hash}` : null;
}

function explorerAddress(addr) {
  return addr ? `https://sepolia.etherscan.io/address/${addr}` : null;
}

async function runLiveScreen(client, meta) {
  const ledgerPath = resolve(ROOT, "evidence", `${meta.rail}-ledger.json`);
  mkdirSync(resolve(ROOT, "evidence"), { recursive: true });
  const ledger = new ExpenseLedger({ path: ledgerPath });
  const callsBeforeDeny = client.calls.length;
  const innerCallsBeforeDeny = client.inner?.calls?.length ?? 0;
  const spentBeforeDeny = client.inner?.spentUsd ?? 0;

  const denied = await considerPayment(client, ledger, {
    payeeName: "Blocked Entity Example",
    subject: "Blocked Entity Example",
    category: "intelligence",
    task: "pre-settle-screen",
    amountUsdc: 5,
    screens: ["sanctions"],
    quoteGas: false,
  });

  const denial = {
    payeeName: "Blocked Entity Example",
    decision: denied.decision,
    settled: denied.settled,
    reasons: denied.reasons,
    skippedPurchase: denied.skippedPurchase === true,
    intelligenceCostUsd: denied.entry?.intelligenceCostUsd ?? 0,
    vendorAmountUsdc: denied.entry?.amountUsdc ?? 0,
    telegraphCallsDuringDeny: (client.inner?.calls?.length ?? client.calls.length) - (innerCallsBeforeDeny || callsBeforeDeny),
    spentUsdDuringDeny: (client.inner?.spentUsd ?? 0) - spentBeforeDeny,
  };
  console.log("failure case (denied before payment):", JSON.stringify(denial, null, 2));

  const outcome = await considerPayment(client, ledger, {
    payeeName: "Circle Internet Financial",
    subject: "Circle Internet Financial",
    category: "intelligence",
    task: "pre-settle-screen",
    amountUsdc: 0,
    screens: ["sanctions"],
    quoteGas: false,
  });

  let balancesAfter = null;
  if (meta.address) {
    try {
      balancesAfter = await readBalances(meta.address);
    } catch (err) {
      balancesAfter = { error: safeError(err).message };
    }
  }

  const receipt = outcome.proof?.sanctions?.receipt ?? null;
  const settlementTx = receipt?.tx_hash || null;
  const receipts = (outcome.entry?.receipts ?? []).map((r) => ({
    ...r,
    explorer: explorerTx(r.tx_hash),
  }));

  const evidence = redact({
    at: new Date().toISOString(),
    rail: meta.rail,
    network: "eip155:11155111",
    diamond: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
    usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
    payer: meta.address || receipt?.payer || null,
    payerExplorer: explorerAddress(meta.address || receipt?.payer),
    faucet: meta.faucet || null,
    mint: meta.mint || null,
    failureCase: denial,
    livePurchase: {
      intent: INTENTS.sanctions,
      params: { name: "Circle Internet Financial" },
      decision: outcome.decision,
      settled: outcome.settled,
      reasons: outcome.reasons,
      cost_usd: outcome.entry?.intelligenceCostUsd ?? null,
      spendCapUsd: 0.05,
      receipts,
      signal_hash: outcome.proof?.sanctions?.signal_hash ?? null,
      miner_id: outcome.proof?.sanctions?.miner_id ?? null,
      miner_name: outcome.proof?.sanctions?.miner_name ?? null,
      result: outcome.proof?.sanctions?.result ?? null,
      receipt,
      settlementTx,
      settlementExplorer: explorerTx(settlementTx),
      paymentResponsePresent: outcome.proof?.sanctions?.paymentResponsePresent ?? null,
    },
    balancesBefore: meta.balancesBefore
      ? { address: meta.balancesBefore.address, ethWei: meta.balancesBefore.ethWei, usdc: meta.balancesBefore.usdc }
      : null,
    balancesAfter: balancesAfter
      ? { address: balancesAfter.address, ethWei: balancesAfter.ethWei, usdc: balancesAfter.usdc }
      : null,
    ledgerSummary: ledger.summary(),
    ledgerPath: "evidence/" + (meta.rail) + "-ledger.json",
  });

  const file = resolve(ROOT, "evidence", `${meta.rail}-live.json`);
  writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
  console.log("live screen:", outcome.decision, "cost_usd=", evidence.livePurchase.cost_usd);
  console.log("settlement:", settlementTx, evidence.livePurchase.settlementExplorer);
  console.log("receipts:", JSON.stringify(receipts, null, 2));
  console.log("evidence written:", file);
  return evidence;
}

const cmd = process.argv[2] || "demo";
if (cmd === "demo" || cmd === "summary") {
  if (mode !== "mock" && cmd === "demo") {
    console.error("demo is mock-only. Use: node src/cli.js live-once");
    process.exit(2);
  }
  demo().catch((err) => {
    console.error(safeError(err).message);
    process.exit(1);
  });
} else if (cmd === "live-once") {
  liveOnce().catch((err) => {
    console.error(safeError(err).message);
    process.exit(1);
  });
} else {
  console.error("usage: node src/cli.js demo|live-once");
  process.exit(2);
}
