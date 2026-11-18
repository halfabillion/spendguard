import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AnjomanKeyClient } from "../src/anjoman.js";
import { TelegraphClient } from "../src/telegraph.js";
import { INTENTS } from "../src/intents.js";

function mockFetch(handler) {
  return async (url, init = {}) => {
    const res = handler(url, init);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => JSON.stringify(res.body ?? {}),
    };
  };
}

describe("AnjomanKeyClient", () => {
  it("posts /agent/chat with stream false, maxSpendUsd, intent and params", async () => {
    let captured;
    const client = new AnjomanKeyClient({
      getKey: () => "anjoman_test_key",
      fetchImpl: mockFetch((url, init) => {
        captured = { url, init };
        assert.match(init.headers.Authorization, /^Bearer /);
        return {
          status: 200,
          body: {
            status: "complete",
            jobId: "job-1",
            costUsd: 0.01,
            answer: "clear",
            result: { name: "Circle", matched: false, matches: [], lists: ["OFAC SDN"], match_score: 0 },
          },
        };
      }),
    });
    const answer = await client.ask({
      intent: INTENTS.sanctions,
      params: { name: "Circle Internet Financial" },
      maxSpendUsd: 0.05,
    });
    const body = JSON.parse(captured.init.body);
    assert.equal(body.stream, false);
    assert.equal(body.maxSpendUsd, 0.05);
    assert.equal(body.intent, INTENTS.sanctions);
    assert.deepEqual(body.params, { name: "Circle Internet Financial" });
    assert.equal(captured.url, "https://backend.telegraphprotocol.com/agent/chat");
    assert.equal(answer.rail, "api-key");
    assert.equal(answer.paid, true);
    assert.equal(answer.result.matched, false);
    assert.equal(answer.jobId, "job-1");
    assert.equal(answer.cost_usd, 0.01);
  });

  it("polls GET /agent/jobs/{id} after a 202", async () => {
    const hits = [];
    const client = new AnjomanKeyClient({
      getKey: () => "anjoman_test_key",
      pollMs: 1,
      fetchImpl: mockFetch((url) => {
        hits.push(url);
        if (url.endsWith("/agent/chat")) {
          return { status: 202, body: { status: "running", jobId: "job-2" } };
        }
        if (url.endsWith("/agent/jobs/job-2")) {
          return {
            status: 200,
            body: { status: "complete", jobId: "job-2", costUsd: 0.01, result: { matched: false } },
          };
        }
        return { status: 404, body: { message: "not found" } };
      }),
    });
    const answer = await client.ask({ intent: INTENTS.sanctions, params: { name: "Circle" } });
    assert.equal(answer.status, "complete");
    assert.ok(hits.some((u) => u.endsWith("/agent/jobs/job-2")));
  });

  it("reads spend and balance", async () => {
    const client = new AnjomanKeyClient({
      getKey: () => "anjoman_test_key",
      fetchImpl: mockFetch((url) => {
        if (url.endsWith("/agent/spend")) {
          return { status: 200, body: { jobs: [{ jobId: "job-1", costUsd: 0.01 }], total: 0.01 } };
        }
        if (url.endsWith("/engine/escrow/balance")) {
          return { status: 200, body: { effectiveBalance: "1.5", escrowBalance: "2", agentDebt: "0" } };
        }
        return { status: 404, body: {} };
      }),
    });
    const spend = await client.spend();
    const balance = await client.balance();
    assert.equal(spend.total, 0.01);
    assert.equal(balance.effectiveBalance, "1.5");
  });

  it("wires into TelegraphClient live key mode", async () => {
    const inner = new AnjomanKeyClient({
      getKey: () => "anjoman_test_key",
      fetchImpl: mockFetch(() => ({
        status: 200,
        body: { status: "complete", jobId: "j", costUsd: 0.01, result: { matched: false } },
      })),
    });
    const client = new TelegraphClient({ mode: "live", payPath: "key", inner });
    const answer = await client.ask({ intent: INTENTS.sanctions, params: { name: "Circle" } });
    assert.equal(answer.rail, "api-key");
    assert.equal(answer.jobId, "j");
  });
});
