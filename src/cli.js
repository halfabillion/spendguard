#!/usr/bin/env node
import { TelegraphClient } from "./telegraph.js";
import { ExpenseLedger } from "./ledger.js";
import { considerPayment } from "./flow.js";
import { demoFixtures } from "./fixtures.js";

const mode = process.env.TELEGRAPH_MODE || "mock";

async function demo() {
  if (mode !== "mock") {
    console.error("This first-commit demo only runs in TELEGRAPH_MODE=mock.");
    process.exit(2);
  }
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

const cmd = process.argv[2] || "demo";
if (cmd === "demo" || cmd === "summary") {
  demo().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error("usage: node src/cli.js demo");
  process.exit(2);
}
