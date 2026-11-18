import { INTENTS } from "./intents.js";
import { screenPayment } from "./presettle.js";
import { collectReceipts } from "./ledger.js";

/**
 * Screen a proposed payment, optionally quote gas, and write a ledger row.
 * Settlement in this skeleton is a recorded decision only (no chain send to a vendor).
 * The Telegraph purchase is the screening (and optional gas quote) itself.
 */
export async function considerPayment(client, ledger, proposal) {
  const screening = await screenPayment(client, proposal);
  let gas = null;
  if (proposal.quoteGas) {
    gas = await client.ask({
      intent: INTENTS.gasPrice,
      params: { chain: proposal.chain || "ethereum" },
    });
  }

  const intelligenceCostUsd =
    screening.screeningCostUsd + Number(gas?.cost_usd || 0);
  const receipts = collectReceipts(screening.proof, gas);
  const rail = receipts.find((r) => r.rail)?.rail || null;

  if (!screening.allowed) {
    const row = ledger.record({
      status: "blocked",
      category: proposal.category,
      task: proposal.task,
      payeeName: proposal.payeeName,
      amountUsdc: 0,
      intelligenceCostUsd,
      reasons: screening.reasons,
      proof: screening.proof,
      gas,
      receipts,
      rail,
    });
    return { ...screening, settled: false, gas, entry: row };
  }

  const row = ledger.record({
    status: "settled",
    category: proposal.category,
    task: proposal.task,
    payeeName: proposal.payeeName,
    amountUsdc: proposal.amountUsdc,
    intelligenceCostUsd,
    reasons: [],
    proof: screening.proof,
    gas,
    receipts,
    rail,
  });
  return { ...screening, settled: true, gas, entry: row };
}
