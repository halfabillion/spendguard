import { x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { SEPOLIA_CAIP, SEPOLIA_USDC, SEPOLIA_RPC } from "./chain.js";
import { redact, safeError } from "./redact.js";

export const ENGINE_ASK_URL =
  process.env.TELEGRAPH_ENGINE_URL ||
  "https://devnode.telegraphprotocol.com/engine/v1/ask";

/** Hard cap for a single live payment, $0.05 in 6-decimal USDC units. */
export const MAX_AMOUNT_PER_PAYMENT = "50000";

const UNPAID_TIMEOUT_MS = Number(process.env.TELEGRAPH_UNPAID_TIMEOUT_MS || 20000);
const PAID_TIMEOUT_MS = Number(process.env.TELEGRAPH_PAID_TIMEOUT_MS || 90000);

/** Prefer Ethereum Sepolia exact test USDC so settlement lands on the Diamond. */
export function selectSepoliaExactUsdc(_x402Version, accepts = []) {
  const hit = accepts.find(
    (item) =>
      item?.scheme === "exact" &&
      item?.network === SEPOLIA_CAIP &&
      String(item?.asset || "").toLowerCase() === SEPOLIA_USDC.toLowerCase(),
  );
  if (!hit) {
    throw new Error("no Ethereum Sepolia exact USDC option in the 402 challenge");
  }
  return hit;
}

export function decodePaymentRequired(res) {
  const raw = res?.headers?.get?.("PAYMENT-REQUIRED") || res?.headers?.get?.("payment-required");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function paymentHeaderSent(headers) {
  return (
    headers.has("PAYMENT-SIGNATURE") ||
    headers.has("payment-signature") ||
    headers.has("X-PAYMENT") ||
    headers.has("x-payment")
  );
}

async function fetchWithTimeout(fetchImpl, request, timeoutMs) {
  const ctrl = AbortSignal.timeout(timeoutMs);
  const signal =
    request.signal && !request.signal.aborted ? AbortSignal.any([request.signal, ctrl]) : ctrl;
  const paid = paymentHeaderSent(request.headers);
  const t0 = Date.now();
  const res = await fetchImpl(new Request(request, { signal }));
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ hop: "x402", status: res.status, ms, paidHeaderSent: paid }));
  return res;
}

/**
 * Wallet-signed x402 exact payments on Ethereum Sepolia.
 * The payer signs EIP-3009 TransferWithAuthorization; the facilitator settles.
 *
 * Implemented as an explicit 402-then-retry so we can time each hop and
 * surface a verify failure instead of a bare "payment required".
 */
export function createPaidFetch({ getPrivateKey, maxAmountPerPayment = MAX_AMOUNT_PER_PAYMENT, fetchImpl = fetch }) {
  if (typeof getPrivateKey !== "function") throw new Error("getPrivateKey is required");
  const account = privateKeyToAccount(getPrivateKey());
  const client = x402Client.fromConfig({
    schemes: [
      {
        network: SEPOLIA_CAIP,
        client: new ExactEvmScheme(account, { rpcUrl: SEPOLIA_RPC }),
      },
    ],
    spendControls: {
      allowedAssets: [
        {
          network: SEPOLIA_CAIP,
          asset: SEPOLIA_USDC,
          maxAmountPerPayment: String(maxAmountPerPayment),
        },
      ],
    },
    paymentRequirementsSelector: selectSepoliaExactUsdc,
  });
  const httpClient = new x402HTTPClient(client);

  return async (input, init) => {
    const request = new Request(input, init);
    const retryBase = request.clone();
    const first = await fetchWithTimeout(fetchImpl, request, UNPAID_TIMEOUT_MS);
    if (first.status !== 402) return first;

    const firstText = await first.text();
    let firstBody;
    try {
      firstBody = firstText ? JSON.parse(firstText) : undefined;
    } catch {
      firstBody = undefined;
    }
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => first.headers.get(name),
      firstBody,
    );
    const maxPaidAttempts = Math.max(1, Number(process.env.TELEGRAPH_X402_SETTLE_RETRIES || 1));
    let last = first;
    for (let attempt = 1; attempt <= maxPaidAttempts; attempt += 1) {
      const paymentPayload = await client.createPaymentPayload(paymentRequired);
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
      const retry = retryBase.clone();
      for (const [key, value] of Object.entries(paymentHeaders)) {
        retry.headers.set(key, value);
      }
      last = await fetchWithTimeout(fetchImpl, retry, PAID_TIMEOUT_MS);
      if (last.status !== 402) return last;
      const text = await last.clone().text();
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      const reason = String(body.reason || body.hint || "");
      const settleTimeout = /deadline exceeded|could not be settled|settlement failed/i.test(reason);
      console.log(JSON.stringify({
        hop: "x402-settle",
        attempt,
        status: last.status,
        reason: body.reason || null,
        retrying: settleTimeout && attempt < maxPaidAttempts,
      }));
      if (!settleTimeout) return last;
    }
    return last;
  };
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
    const paymentRequired = decodePaymentRequired(res);
    const paymentResponsePresent = Boolean(
      res.headers.get("PAYMENT-RESPONSE") || res.headers.get("payment-response"),
    );
    if (!res.ok) {
      const reason =
        parsed.reason ||
        parsed.hint ||
        parsed.message ||
        (paymentRequired?.error && paymentRequired.error !== "Payment required" && paymentRequired.error !== "payment required"
          ? paymentRequired.error
          : null) ||
        parsed.error ||
        `engine HTTP ${res.status}`;
      const err = new Error(reason);
      err.status = res.status;
      err.body = redact(parsed);
      err.receipt = receipt;
      err.paymentRequiredError = paymentRequired?.error || null;
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
