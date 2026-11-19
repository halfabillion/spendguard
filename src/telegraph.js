import { ENGINE_URL, USDC_PER_MINER } from "./intents.js";

/**
 * Telegraph client.
 *
 * mode=mock (default): fixture answers, no network.
 * mode=live + payPath=key (default): Diamond escrow rail (injected EscrowEngineClient).
 * mode=live + payPath=anjoman: Anjoman API-key path (injected AnjomanKeyClient).
 * mode=live + payPath=x402: experimental wallet-signed x402 exact (injected X402EngineClient).
 */
export class TelegraphClient {
  constructor({
    mode = "mock",
    payPath = null,
    fixtures = {},
    engineUrl = ENGINE_URL,
    inner = null,
  } = {}) {
    this.mode = mode;
    this.payPath = payPath || (mode === "live" ? "key" : null);
    this.fixtures = fixtures;
    this.engineUrl = engineUrl;
    this.inner = inner;
    this.calls = [];
  }

  async ask({ intent, params = {}, query, maxBudgetUsdc = USDC_PER_MINER, maxSpendUsd, message } = {}) {
    if (!intent && !query && !message) {
      throw new Error("send query, or intent and params");
    }
    const request = { intent, params, query, max_budget_usdc: maxBudgetUsdc, maxSpendUsd, message };
    this.calls.push(request);
    if (this.mode === "mock") return this.#mockAnswer(request);
    if (this.mode === "live") return this.#liveAsk(request);
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
      rail: "mock",
      paid: false,
    };
  }

  async #liveAsk(request) {
    if (!this.inner || typeof this.inner.ask !== "function") {
      throw new Error(`live mode (${this.payPath}) needs an inner client`);
    }
    return this.inner.ask(request);
  }
}

export function fixtureKey(intent, params = {}) {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return parts.length ? `${intent}|${parts.join("&")}` : intent;
}
