import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { SEPOLIA_CAIP, SEPOLIA_USDC } from "./chain.js";
import { redact, safeError } from "./redact.js";

export const ENGINE_ASK_URL =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine/v1/ask";

/** Hard cap for a single live payment, $0.05 in 6-decimal USDC units. */
export const MAX_AMOUNT_PER_PAYMENT = "50000";

/**
 * Wallet-signed x402 exact payments on Ethereum Sepolia.
 * The payer signs EIP-3009 TransferWithAuthorization; the facilitator settles.
 */
export function createPaidFetch({ getPrivateKey, maxAmountPerPayment = MAX_AMOUNT_PER_PAYMENT, fetchImpl = fetch }) {
  if (typeof getPrivateKey !== "function") throw new Error("getPrivateKey is required");
  const account = privateKeyToAccount(getPrivateKey());
  return wrapFetchWithPaymentFromConfig(fetchImpl, {
    schemes: [{ network: SEPOLIA_CAIP, client: new ExactEvmScheme(account) }],
    spendControls: {
      allowedAssets: [
        {
          network: SEPOLIA_CAIP,
          asset: SEPOLIA_USDC,
          maxAmountPerPayment: String(maxAmountPerPayment),
        },
      ],
    },
  });
}

export class X402EngineClient {
  constructor({
    paidFetch,
    engineUrl = ENGINE_ASK_URL,
    sessionCapUsd = 0.05,
  } = {}) {
    if (typeof paidFetch !== "function") throw new Error("paidFetch is required");
    this.paidFetch = paidFetch;
    this.engineUrl = engineUrl;
    this.sessionCapUsd = sessionCapUsd;
    this.spentUsd = 0;
    this.calls = [];
  }

  remainingCapUsd() {
    return Math.round((this.sessionCapUsd - this.spentUsd) * 1e6) / 1e6;
  }

  async ask({ intent, params = {}, query, maxBudgetUsdc } = {}) {
    if (!intent && !query) throw new Error("send query, or intent and params");
    if (this.remainingCapUsd() < 0.01) {
      const err = new Error("session spend cap would be exceeded");
      err.code = "SPEND_CAP";
      throw err;
    }
    const body = {};
    if (intent) {
      body.intent = intent;
      body.params = params;
    }
    if (query) body.query = query;
    // Official docs: without max_budget_usdc a run pays one call, $0.01.
    // A large budget is charged up front, so live evidence omits it.
    if (maxBudgetUsdc != null) body.max_budget_usdc = maxBudgetUsdc;

    this.calls.push({ intent, params, query, maxBudgetUsdc: body.max_budget_usdc ?? null });
    let res;
    try {
      res = await this.paidFetch(this.engineUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const wrapped = new Error(safeError(err).message);
      wrapped.code = err?.code || "X402_FETCH";
      throw wrapped;
    }

    const text = await res.text();
    let parsed = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 400) };
      }
    }
    const receipt = parseTelegraphReceipt(res);
    const paymentResponsePresent = Boolean(
      res.headers.get("PAYMENT-RESPONSE") || res.headers.get("payment-response"),
    );
    if (!res.ok) {
      const err = new Error(parsed.message || parsed.error || `engine HTTP ${res.status}`);
      err.status = res.status;
      err.body = redact(parsed);
      err.receipt = receipt;
      throw err;
    }
    const cost = Number(parsed.cost_usd ?? parsed.costUsd ?? 0.01) || 0.01;
    this.spentUsd = Math.round((this.spentUsd + cost) * 1e6) / 1e6;
    return {
      intent: parsed.intent || intent || null,
      miner_id: parsed.miner_id || null,
      miner_name: parsed.miner_name || null,
      result: parsed.result ?? parsed,
      result_shape: parsed.result_shape || "intent",
      field_status: parsed.field_status,
      cost_usd: cost,
      signal_hash: parsed.signal_hash || null,
      duration_ms: parsed.duration_ms,
      receipt,
      paymentResponsePresent,
      network: SEPOLIA_CAIP,
      rail: "x402",
      paid: true,
    };
  }
}

export function parseTelegraphReceipt(res) {
  const raw =
    res.headers?.get?.("x-telegraph-receipt") ||
    res.headers?.get?.("X-TELEGRAPH-RECEIPT") ||
    null;
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return redact(json);
  } catch {
    return null;
  }
}
