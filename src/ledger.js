import { writeFileSync, readFileSync, existsSync } from "node:fs";

/** In-memory (optionally file-backed) agent expense ledger. */
export class ExpenseLedger {
  constructor({ path } = {}) {
    this.path = path;
    this.entries = [];
    if (path && existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      this.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    }
  }

  record(entry) {
    const row = {
      id: entry.id || `e-${this.entries.length + 1}`,
      at: entry.at || new Date().toISOString(),
      status: entry.status, // settled | blocked | screening
      category: entry.category,
      task: entry.task,
      payeeName: entry.payeeName,
      amountUsdc: Number(entry.amountUsdc || 0),
      intelligenceCostUsd: Number(entry.intelligenceCostUsd || 0),
      reasons: entry.reasons || [],
      proof: entry.proof || null,
      gas: entry.gas || null,
      quality: entry.quality || null,
      receipts: entry.receipts || collectReceipts(entry.proof, entry.gas),
      rail: entry.rail || null,
    };
    if (!row.status) throw new Error("ledger entry needs status");
    if (!row.category) throw new Error("ledger entry needs category");
    if (!row.task) throw new Error("ledger entry needs task");
    this.entries.push(row);
    this.#persist();
    return row;
  }

  summary() {
    const settled = this.entries.filter((e) => e.status === "settled");
    const blocked = this.entries.filter((e) => e.status === "blocked");
    const burnByCategory = {};
    const costByTask = {};
    for (const e of settled) {
      const burn = e.amountUsdc + e.intelligenceCostUsd;
      burnByCategory[e.category] = round((burnByCategory[e.category] || 0) + burn);
      if (!costByTask[e.task]) costByTask[e.task] = { tasks: 0, total: 0 };
      costByTask[e.task].tasks += 1;
      costByTask[e.task].total = round(costByTask[e.task].total + burn);
    }
    const costPerTask = Object.fromEntries(
      Object.entries(costByTask).map(([task, v]) => [
        task,
        { completed: v.tasks, totalUsd: v.total, averageUsd: round(v.total / v.tasks) },
      ]),
    );
    return {
      settlementCount: settled.length,
      blockedCount: blocked.length,
      entryCount: this.entries.length,
      burnByCategory,
      costPerTask,
      totalSettledUsd: round(settled.reduce((n, e) => n + e.amountUsdc + e.intelligenceCostUsd, 0)),
    };
  }

  #persist() {
    if (!this.path) return;
    writeFileSync(
      this.path,
      JSON.stringify({ entries: this.entries, summary: this.summary() }, null, 2),
    );
  }
}

export function collectReceipts(...bundles) {
  const out = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (v.receipt || v.signal_hash || v.jobId || v.tx_hash) {
      const r = v.receipt || {};
      out.push({
        rail: v.rail || r.rail || null,
        receipt_hash: r.receipt_hash || null,
        tx_hash: r.tx_hash || v.tx_hash || null,
        signal_hash: v.signal_hash || null,
        jobId: v.jobId || null,
        cost_usd: v.cost_usd ?? r.amount_uusdc ?? null,
        payer: r.payer || null,
      });
    }
    for (const child of Object.values(v)) {
      if (child && typeof child === "object" && child !== v.receipt) walk(child);
    }
  };
  for (const b of bundles) walk(b);
  return out;
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}
