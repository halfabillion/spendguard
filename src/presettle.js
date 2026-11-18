import { INTENTS } from "./intents.js";

const BLOCKING_RISK = new Set(["HIGH", "CRITICAL"]);

/**
 * Buy screening intelligence, then decide whether a proposed payment may settle.
 * The proof bundle is attached either way so the ledger can show blocked attempts.
 *
 * proposal.screens defaults to all three official pre-settle intents.
 * A capped live run may pass screens: ["sanctions"] to stay under $0.05.
 */
export async function screenPayment(client, proposal) {
  const { payeeName, subject, transaction } = proposal;
  const screens = proposal.screens || ["sanctions", "transactionRisk", "fraudRisk"];
  const proof = {};
  const asks = [];

  if (screens.includes("sanctions")) {
    asks.push(
      client.ask({ intent: INTENTS.sanctions, params: { name: payeeName } }).then((a) => {
        proof.sanctions = a;
      }),
    );
  }
  if (screens.includes("transactionRisk")) {
    asks.push(
      client.ask({
        intent: INTENTS.transactionRisk,
        params: { transaction: transaction || subject || payeeName },
      }).then((a) => {
        proof.transactionRisk = a;
      }),
    );
  }
  if (screens.includes("fraudRisk")) {
    asks.push(
      client.ask({
        intent: INTENTS.fraudRisk,
        params: { subject: subject || payeeName },
      }).then((a) => {
        proof.fraudRisk = a;
      }),
    );
  }
  await Promise.all(asks);

  const reasons = [];
  if (proof.sanctions?.result?.matched === true) reasons.push("sanctions_match");
  const txLevel = String(proof.transactionRisk?.result?.risk_level || "").toUpperCase();
  const fraudLevel = String(proof.fraudRisk?.result?.risk_level || "").toUpperCase();
  if (BLOCKING_RISK.has(txLevel)) reasons.push(`transaction_risk:${txLevel}`);
  if (BLOCKING_RISK.has(fraudLevel)) reasons.push(`fraud_risk:${fraudLevel}`);

  const allowed = reasons.length === 0;
  const screeningCostUsd = Object.values(proof).reduce(
    (n, a) => n + Number(a?.cost_usd || 0),
    0,
  );
  return {
    allowed,
    reasons,
    decision: allowed ? "allow" : "deny",
    proof,
    screeningCostUsd,
  };
}
