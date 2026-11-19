// Telegraph escrow rail (EIP-191 personal_sign against a once-funded Diamond balance).
// Docs: https://docs.telegraphprotocol.com/docs/using/escrow-inference
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { randomUUID } from "node:crypto";
import { SEPOLIA_USDC, SEPOLIA_RPC, SEPOLIA_CAIP, sepoliaClient } from "./chain.js";
import { redact, safeError } from "./redact.js";

export const DIAMOND = "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";
export const NODE = "https://devnode.telegraphprotocol.com";
export const ENGINE_ASK_URL =
  process.env.TELEGRAPH_ENGINE_URL || `${NODE}/engine/v1/ask`;

export function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  const hex = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    const err = new Error("EOA key is not a 32-byte hex key");
    err.code = "BAD_KEY_FORMAT";
    throw err;
  }
  return hex;
}

export async function ledgerAccount(address, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`${NODE}/v1/ledger/account/${String(address).toLowerCase()}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function depositEscrow(privateKey, amountUusdc) {
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
  const pub = sepoliaClient();
  const approveTx = await wallet.writeContract({
    address: SEPOLIA_USDC,
    abi: parseAbi(["function approve(address,uint256) returns (bool)"]),
    functionName: "approve",
    args: [DIAMOND, BigInt(amountUusdc)],
  });
  const a = await pub.waitForTransactionReceipt({ hash: approveTx });
  const depositTx = await wallet.writeContract({
    address: DIAMOND,
    abi: parseAbi(["function depositUSDC(uint256)"]),
    functionName: "depositUSDC",
    args: [BigInt(amountUusdc)],
  });
  const d = await pub.waitForTransactionReceipt({ hash: depositTx });
  return {
    approveTx,
    approveStatus: a.status,
    approveBlock: String(a.blockNumber),
    depositTx,
    depositStatus: d.status,
    depositBlock: String(d.blockNumber),
  };
}

export function escrowEntry(accepts = []) {
  return accepts.find((x) => x.scheme === "escrow" && x.network === "eip155:11155111");
}

export function quotedUsdc(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0.01;
  return Math.round((n / 1e6) * 1e6) / 1e6;
}

export function quotedValueFromEntry(entry) {
  const tpl = entry?.extra?.message || "";
  return (tpl.match(/Amount:\s*(\d+)/) || [])[1] || null;
}

export async function escrowChallenge(body, url = ENGINE_ASK_URL, { fetchImpl = fetch } = {}) {
  const first = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await first.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: first.status, body: parsed, text, headers: first.headers };
}

export async function escrowPay(privateKey, body, challenge, url = ENGINE_ASK_URL, { fetchImpl = fetch } = {}) {
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  const from = account.address.toLowerCase();
  const accepts = challenge?.accepts || challenge?.body?.accepts || [];
  const entry = escrowEntry(accepts);
  if (!entry) {
    return {
      stage: "challenge",
      error: "no escrow entry",
      status: challenge?.status,
      body: challenge?.body ?? challenge?.text ?? challenge,
    };
  }
  const value = quotedValueFromEntry(entry);
  const tpl = entry.extra.message;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = String(now - 10);
  const validBefore = String(now + 100);
  const nonce = randomUUID();
  const message = tpl
    .replace("{from}", from)
    .replace("{nonce}", nonce)
    .replace("{validAfter}", validAfter)
    .replace("{validBefore}", validBefore);
  const signature = await account.signMessage({ message });
  const envelope = {
    x402Version: 2,
    scheme: "escrow",
    network: "eip155:11155111",
    payload: {
      signature,
      authorization: {
        from,
        to: entry.payTo.toLowerCase(),
        value,
        validAfter,
        validBefore,
        nonce,
      },
    },
  };
  const paid = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-PAYMENT": Buffer.from(JSON.stringify(envelope)).toString("base64"),
    },
    body: JSON.stringify(body),
  });
  const hdr = paid.headers.get("x-payment-response") || paid.headers.get("X-PAYMENT-RESPONSE");
  const receipt = hdr ? JSON.parse(Buffer.from(hdr, "base64").toString("utf8")) : null;
  return {
    stage: "paid",
    status: paid.status,
    quotedValue: value,
    nonce,
    receipt,
    body: await paid.text(),
  };
}

/**
 * Backward-compatible helper used by one-off scripts.
 * Optional 4th argument: { fetchImpl, beforePay }.
 * beforePay runs after the unpaid 402 challenge and before any signature.
 */
export async function escrowAsk(privateKey, body, url = ENGINE_ASK_URL, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const first = await escrowChallenge(body, url, { fetchImpl });
  if (first.status !== 402) {
    const raw = typeof first.body === "string" ? first.body : JSON.stringify(first.body);
    return { stage: "challenge", status: first.status, body: raw };
  }
  const challengeBody = typeof first.body === "object" && first.body ? first.body : {};
  const entry = escrowEntry(challengeBody.accepts);
  const value = quotedValueFromEntry(entry);
  if (typeof opts.beforePay === "function") {
    await opts.beforePay({
      quotedValue: value,
      quotedUsdc: quotedUsdc(value),
      challenge: challengeBody,
      entry,
    });
  }
  return escrowPay(privateKey, body, challengeBody, url, { fetchImpl });
}

/**
 * Live SpendGuard rail: pay a Telegraph ask from a once-funded Diamond escrow
 * balance. getPrivateKey is called only when a payment is about to be signed.
 * The session cap is checked before any engine request, and again against the
 * quoted amount before signing, so an over-budget call never spends.
 */
export class EscrowEngineClient {
  constructor({
    getPrivateKey,
    engineUrl = ENGINE_ASK_URL,
    sessionCapUsd = 0.05,
    minCallUsd = 0.01,
    fetchImpl = fetch,
    askImpl = null,
  } = {}) {
    if (typeof getPrivateKey !== "function") throw new Error("getPrivateKey is required");
    this.getPrivateKey = getPrivateKey;
    this.engineUrl = engineUrl;
    this.sessionCapUsd = sessionCapUsd;
    this.minCallUsd = minCallUsd;
    this.fetchImpl = fetchImpl;
    this.askImpl = askImpl;
    this.spentUsd = 0;
    this.calls = [];
  }

  remainingCapUsd() {
    return Math.round((this.sessionCapUsd - this.spentUsd) * 1e6) / 1e6;
  }

  wouldExceedCap(costUsd = this.minCallUsd) {
    return this.remainingCapUsd() + 1e-12 < Number(costUsd);
  }

  assertWithinCap(costUsd = this.minCallUsd) {
    if (this.wouldExceedCap(costUsd)) {
      const err = new Error("session spend cap would be exceeded");
      err.code = "SPEND_CAP";
      err.sessionCapUsd = this.sessionCapUsd;
      err.spentUsd = this.spentUsd;
      err.attemptedUsd = Number(costUsd);
      err.remainingCapUsd = this.remainingCapUsd();
      throw err;
    }
  }

  async ask({ intent, params = {}, query, maxBudgetUsdc } = {}) {
    if (!intent && !query) throw new Error("send query, or intent and params");
    this.assertWithinCap(this.minCallUsd);

    const body = {};
    if (intent) {
      body.intent = intent;
      body.params = params;
    }
    if (query) body.query = query;
    if (maxBudgetUsdc != null) body.max_budget_usdc = maxBudgetUsdc;

    const runAsk = this.askImpl || ((pk, b, url, opts) => escrowAsk(pk, b, url, opts));
    let raw;
    try {
      raw = await runAsk(this.getPrivateKey(), body, this.engineUrl, {
        fetchImpl: this.fetchImpl,
        beforePay: ({ quotedUsdc: q }) => this.assertWithinCap(q || this.minCallUsd),
      });
    } catch (err) {
      if (err?.code === "SPEND_CAP") throw err;
      const wrapped = new Error(safeError(err).message);
      wrapped.code = err?.code || "ESCROW_FETCH";
      throw wrapped;
    }

    this.calls.push({ intent, params, query, maxBudgetUsdc: body.max_budget_usdc ?? null });

    if (raw.stage !== "paid" || raw.status !== 200) {
      const message =
        raw.error ||
        (typeof raw.body === "string" ? raw.body.slice(0, 200) : `escrow ask HTTP ${raw.status}`);
      const err = new Error(message);
      err.status = raw.status;
      err.body = redact(raw);
      throw err;
    }

    let parsed = {};
    if (raw.body) {
      try {
        parsed = typeof raw.body === "string" ? JSON.parse(raw.body) : raw.body;
      } catch {
        parsed = { raw: String(raw.body).slice(0, 400) };
      }
    }
    const receipt = raw.receipt ? redact(raw.receipt) : null;
    const cost = Number(parsed.cost_usd ?? parsed.costUsd ?? quotedUsdc(raw.quotedValue) ?? 0.01) || 0.01;
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
      paymentResponsePresent: Boolean(receipt),
      network: SEPOLIA_CAIP,
      rail: "escrow",
      paid: true,
    };
  }
}
