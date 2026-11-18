import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TelegraphClient, fixtureKey } from "../src/telegraph.js";
import { INTENTS } from "../src/intents.js";

describe("TelegraphClient", () => {
  it("requires query or intent", async () => {
    const client = new TelegraphClient({ mode: "mock", fixtures: {} });
    await assert.rejects(() => client.ask({}), /query, or intent/);
  });

  it("returns a mock answer keyed by intent and params", async () => {
    const intent = INTENTS.gasPrice;
    const params = { chain: "ethereum" };
    const client = new TelegraphClient({
      mode: "mock",
      fixtures: {
        [fixtureKey(intent, params)]: {
          result: { gas_price_gwei: 2 },
          cost_usd: 0.01,
          signal_hash: "abc",
        },
      },
    });
    const answer = await client.ask({ intent, params });
    assert.equal(answer.result.gas_price_gwei, 2);
    assert.equal(answer.network, "mock");
    assert.equal(answer.paid, false);
    assert.equal(client.calls.length, 1);
  });

  it("errors when a mock fixture is missing", async () => {
    const client = new TelegraphClient({ mode: "mock", fixtures: {} });
    await assert.rejects(
      () => client.ask({ intent: INTENTS.gasPrice, params: { chain: "ethereum" } }),
      /no mock fixture/,
    );
  });
});
