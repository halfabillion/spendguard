import { INTENTS } from "./intents.js";
import { fixtureKey } from "./telegraph.js";

/** Deterministic mock intelligence for tests and the demo. Not live network data. */
export function demoFixtures() {
  const f = {};
  const add = (intent, params, result, extra = {}) => {
    f[fixtureKey(intent, params)] = { result, cost_usd: 0.01, ...extra };
  };

  add(INTENTS.sanctions, { name: "Acme Treasury Ltd" }, {
    name: "Acme Treasury Ltd",
    matched: false,
    matches: [],
    lists: ["OFAC SDN"],
    match_score: 0,
  });
  add(INTENTS.sanctions, { name: "Blocked Entity Example" }, {
    name: "Blocked Entity Example",
    matched: true,
    matches: ["Example SDN entry (fixture)"],
    lists: ["OFAC SDN"],
    match_score: 0.99,
  });

  add(INTENTS.transactionRisk, { transaction: "pay-acme-001" }, {
    risk_level: "LOW",
    risk_score: 0.05,
    signals: [],
    summary: "Routine testnet payment (fixture).",
  });
  add(INTENTS.transactionRisk, { transaction: "pay-blocked-001" }, {
    risk_level: "MEDIUM",
    risk_score: 0.4,
    signals: ["sanctions_name_overlap"],
    summary: "Name overlaps a sanctions fixture; wait for sanctions result.",
  });

  add(INTENTS.fraudRisk, { subject: "Acme Treasury Ltd" }, {
    risk_level: "LOW",
    risk_score: 0.02,
    signals: [],
    summary: "No fraud signals (fixture).",
  });
  add(INTENTS.fraudRisk, { subject: "Blocked Entity Example" }, {
    risk_level: "MEDIUM",
    risk_score: 0.35,
    signals: ["watchlist_name"],
    summary: "Watchlist overlap (fixture).",
  });

  add(INTENTS.gasPrice, { chain: "ethereum" }, {
    chain: "ethereum",
    gas_price_gwei: 1.2,
    transfer_fee_usd: 0.04,
    as_of: "2026-11-18T17:40:00Z",
  });

  return f;
}
