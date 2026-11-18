/** Live Telegraph Intent IDs for Mission 02 (Stablecoin), as of 18 Nov 2026. */
export const INTENTS = {
  sanctions: "SANCTIONS_SCREENING_MATCH_GENERAL",
  transactionRisk: "TRANSACTION_RISK_GENERAL",
  fraudRisk: "FRAUD_RISK_GENERAL",
  gasPrice: "GAS_PRICE_GENERAL",
  taskQuality: "TASK_EXECUTION_QUALITY_GENERAL",
  transferVerify: "CRYPTO_TRANSFER_VERIFY_GENERAL",
  regulatoryFiling: "REGULATORY_FILING_MONITOR_GENERAL",
};

export const ENGINE_URL =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine/v1/ask";

/** $0.01 per miner, in USDC base units (6 decimals), as used by max_budget_usdc. */
export const USDC_PER_MINER = 10_000;
