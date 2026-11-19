// One-off escrow helper. Do not run unless a new paid call is explicitly approved.
// Deposits require TELEGRAPH_ALLOW_DEPOSIT=1. Paid asks require TELEGRAPH_ALLOW_NEW_SPEND=1.
import { readSecretFile, DEFAULT_EOA_KEY_PATH } from "../src/secrets.js";
import { depositEscrow, escrowAsk, ledgerAccount } from "../src/escrow.js";
import { writeFileSync } from "node:fs";

const addr = "0xC11FBCbE43baF505F37dD6B95054C5eB380A9965";
const out = { at: new Date().toISOString(), rail: "escrow", payer: addr };
out.ledgerBefore = await ledgerAccount(addr);

if (process.env.TELEGRAPH_ALLOW_DEPOSIT !== "1") {
  if (BigInt(out.ledgerBefore.body?.available ?? 0) < 10000n) {
    console.error("HOLD: escrow balance does not cover a $0.01 call and deposits are disabled (set TELEGRAPH_ALLOW_DEPOSIT=1 only with explicit approval). No top-up, no ask.");
    process.exit(2);
  }
  out.deposit = { skipped: true, reason: "TELEGRAPH_ALLOW_DEPOSIT is not set; no top-up" };
} else {
  const pk = readSecretFile(DEFAULT_EOA_KEY_PATH);
  const key = pk.startsWith("0x") ? pk : "0x" + pk;
  out.deposit = BigInt(out.ledgerBefore.body?.available ?? 0) >= 50000n ? null : await depositEscrow(key, 1000000);
}
out.ledgerAfterDeposit = await ledgerAccount(addr);

if (process.env.TELEGRAPH_ALLOW_NEW_SPEND !== "1") {
  out.ask = { skipped: true, reason: "TELEGRAPH_ALLOW_NEW_SPEND is not set; existing evidence files were left unchanged" };
  console.log(JSON.stringify(out, null, 1).slice(0, 4000));
  process.exit(0);
}

const pk = readSecretFile(DEFAULT_EOA_KEY_PATH);
const key = pk.startsWith("0x") ? pk : "0x" + pk;
out.ask = await escrowAsk(key, { intent: "SANCTIONS_SCREENING_MATCH_GENERAL", params: { name: "Circle Internet Financial" }, max_budget_usdc: 10000 });
out.ledgerAfterAsk = await ledgerAccount(addr);
writeFileSync("../evidence/escrow-live-ask.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
