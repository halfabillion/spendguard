import { INTENTS } from "./intents.js";

const BLOCKING_RISK = new Set(["HIGH", "CRITICAL"]);

/**
 * Buy screening intelligence, then decide whether a proposed payment may settle.
 * The proof bundle is attached either way so the ledger can show blocked attempts.
 */
export async function screenPayment(client, proposal) {
  const { payeeName, subject, transaction } = proposal;
  const [sanctions, txRisk, fraud] = await Promise.all([
    client.ask({
      intent: INTENTS.sanctions,
      params: { name: payeeName },
    }),
    client.ask({
      intent: INTENTS.transactionRisk,
      params: { transaction: transaction || subject || payeeName },
    }),
    client.ask({
      intent: INTENTS.fraudRisk,
      params: { subject: subject || payeeName },
    }),
  ]);

  const reasons = [];
  if (sanctions.result?.matched === true) {
    reasons.push("sanctions_match");
  }
  const txLevel = String(txRisk.result?.risk_level || "").toUpperCase();
  const fraudLevel = String(fraud.result?.risk_level || "").toUpperCase();
  if (BLOCKING_RISK.has(txLevel)) reasons.push(`transaction_risk:${txLevel}`);
  if (BLOCKING_RISK.has(fraudLevel)) reasons.push(`fraud_risk:${fraudLevel}`);

  const allowed = reasons.length === 0;
  return {
    allowed,
    reasons,
    decision: allowed ? "allow" : "deny",
    proof: { sanctions, transactionRisk: txRisk, fraudRisk: fraud },
    screeningCostUsd: sumCost(sanctions, txRisk, fraud),
  };
}

function sumCost(...answers) {
  return answers.reduce((n, a) => n + Number(a.cost_usd || 0), 0);
}
