import { ENGINE_URL, USDC_PER_MINER } from "./intents.js";

/**
 * Telegraph Engine client.
 *
 * mock (default): returns fixture intelligence, no network.
 * live: will POST to the Engine, but this first commit refuses to attach a
 * payment, so a 402 is surfaced rather than spent. That keeps tests and the
 * demo off-chain until a throwaway key and faucet route are approved.
 */
export class TelegraphClient {
  constructor({ mode = "mock", fixtures = {}, engineUrl = ENGINE_URL } = {}) {
    this.mode = mode;
    this.fixtures = fixtures;
    this.engineUrl = engineUrl;
    this.calls = [];
  }

  async ask({ intent, params = {}, query, maxBudgetUsdc = USDC_PER_MINER } = {}) {
    if (!intent && !query) {
      throw new Error("send query, or intent and params");
    }
    const request = { intent, params, query, max_budget_usdc: maxBudgetUsdc };
    this.calls.push(request);
    if (this.mode === "mock") {
      return this.#mockAnswer(request);
    }
    if (this.mode === "live") {
      return this.#liveUnpaid(request);
    }
    throw new Error(`unknown TELEGRAPH_MODE: ${this.mode}`);
  }

  #mockAnswer(request) {
    const key = fixtureKey(request.intent, request.params);
    const fixture = this.fixtures[key] ?? this.fixtures[request.intent];
    if (!fixture) {
      const err = new Error(`no mock fixture for ${key}`);
      err.code = "NO_FIXTURE";
      throw err;
    }
    return {
      intent: request.intent,
      miner_id: fixture.miner_id || "mock-miner",
      miner_name: fixture.miner_name || "mock",
      result: fixture.result,
      result_shape: "intent",
      cost_usd: fixture.cost_usd ?? 0.01,
      signal_hash: fixture.signal_hash || `mock-${key}`,
      network: "mock",
      paid: false,
    };
  }

  async #liveUnpaid(request) {
    const res = await fetch(this.engineUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: request.intent,
        params: request.params,
        ...(request.query ? { query: request.query } : {}),
        max_budget_usdc: request.max_budget_usdc,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 402) {
      const err = new Error("payment required");
      err.code = "PAYMENT_REQUIRED";
      err.status = 402;
      err.accepts = body.accepts || [];
      err.body = body;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(body.message || body.error || `engine HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return { ...body, network: "live", paid: false };
  }
}

export function fixtureKey(intent, params = {}) {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return parts.length ? `${intent}|${parts.join("&")}` : intent;
}
