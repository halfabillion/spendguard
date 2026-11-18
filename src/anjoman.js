import { redact } from "./redact.js";

export const ANJOMAN_API_URL =
  process.env.TELEGRAPH_API_URL || "https://backend.telegraphprotocol.com";

/**
 * Official API-key path: Authorization Bearer to backend.telegraphprotocol.com.
 * A key cannot call /engine/ask, deposit or withdraw.
 */
export class AnjomanKeyClient {
  constructor({
    baseUrl = ANJOMAN_API_URL,
    getKey,
    fetchImpl = fetch,
    pollMs = 2000,
    pollTimeoutMs = 120_000,
  } = {}) {
    if (typeof getKey !== "function") throw new Error("getKey is required");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.getKey = getKey;
    this.fetchImpl = fetchImpl;
    this.pollMs = pollMs;
    this.pollTimeoutMs = pollTimeoutMs;
    this.calls = [];
  }

  async ask({ intent, params = {}, query, maxSpendUsd = 0.05, message } = {}) {
    const body = {
      message: message || query || describeAsk(intent, params),
      stream: false,
      maxSpendUsd,
    };
    if (intent) {
      body.intent = intent;
      body.params = params;
    }
    const reply = await this.chat(body);
    return {
      intent: intent || reply.intent || null,
      miner_id: reply.miner_id || null,
      miner_name: reply.miner_name || null,
      result: extractIntentResult(reply, intent),
      raw: reply,
      result_shape: "anjoman",
      cost_usd: numberOrNull(reply.costUsd),
      signal_hash: reply.signal_hash || reply.signalHash || null,
      jobId: reply.jobId || null,
      conversationId: reply.conversationId || null,
      status: reply.status,
      sources: reply.sources || [],
      network: "anjoman-escrow",
      rail: "api-key",
      paid: true,
    };
  }

  async chat(body) {
    const res = await this.#request("POST", "/agent/chat", body);
    if (res.status === 202 || res.body?.status === "running") {
      const jobId = res.body?.jobId;
      if (!jobId) throw httpError("running job missing jobId", res);
      return this.waitForJob(jobId);
    }
    if (!res.ok) throw httpError(res.body?.message || `agent/chat HTTP ${res.status}`, res);
    return res.body;
  }

  async waitForJob(jobId) {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      const job = await this.job(jobId);
      if (job.status && job.status !== "running") return job;
      await sleep(this.pollMs);
    }
    const err = new Error("timed out waiting for agent job");
    err.code = "JOB_TIMEOUT";
    err.jobId = jobId;
    throw err;
  }

  async job(id) {
    const res = await this.#request("GET", `/agent/jobs/${id}`);
    if (!res.ok) throw httpError(res.body?.message || `agent/jobs HTTP ${res.status}`, res);
    return res.body;
  }

  async spend(query = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null) qs.set(k, String(v));
    const path = qs.size ? `/agent/spend?${qs}` : "/agent/spend";
    const res = await this.#request("GET", path);
    if (!res.ok) throw httpError(res.body?.message || `agent/spend HTTP ${res.status}`, res);
    return res.body;
  }

  async balance() {
    const res = await this.#request("GET", "/engine/escrow/balance");
    if (!res.ok) throw httpError(res.body?.message || `escrow/balance HTTP ${res.status}`, res);
    return res.body;
  }

  async #request(method, path, body) {
    const key = this.getKey();
    const headers = { Authorization: `Bearer ${key}` };
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    this.calls.push({ method, path, body: body ? redact(body) : undefined });
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    let parsed = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 200) };
      }
    }
    return { ok: res.ok, status: res.status, body: parsed };
  }
}

function describeAsk(intent, params) {
  return `Please answer intent ${intent} with params ${JSON.stringify(params || {})}.`;
}

function extractIntentResult(reply, intent) {
  if (reply?.result && typeof reply.result === "object") return reply.result;
  if (reply?.answer && typeof reply.answer === "object") return reply.answer;
  return {
    answer: reply?.answer ?? null,
    status: reply?.status ?? null,
    intent: intent || null,
  };
}

function numberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function httpError(message, res) {
  const err = new Error(message);
  err.status = res.status;
  err.body = redact(res.body);
  return err;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
