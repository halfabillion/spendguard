# SpendGuard

A **pre-settlement compliance gate** and **agent expense ledger** for machine stablecoin payments. It buys ranked intelligence through Telegraph, attaches the verified result to the payment as a proof, and records burn per category and cost per completed task.

Built for [Telegraph Hackathon Season II](https://hackathon.telegraphprotocol.com/), Apps & Agents track, [Mission 02 Stablecoin](https://hackathon.telegraphprotocol.com/missions/stablecoin). Local, private, not submitted.

This is a **testnet** project (Ethereum Sepolia). It has not made a live paid Telegraph purchase yet. Default commands use a mock client and need no wallet, faucet, or network.

## Quick start

```bash
node --test test/*.test.js   # or: npm test
node src/cli.js demo         # allow path + denied (sanctions) path, then a ledger summary
```

Requires Node 20+. No other dependencies.

## What the demo shows

1. A proposed USDC payment to a **clear** counterparty is screened (sanctions, transaction risk, fraud risk). It is allowed. A ledger entry is written, including the proof bundle and a gas-price quote.
2. A proposed payment to a **sanctioned** fixture is screened, **blocked**, and recorded as a denied attempt. No settlement.
3. The summary prints burn by category, cost per completed task, settlement count, and blocked count.

Live mode is behind feature flags and is **off by default**. Tests always use the mock client.

```bash
TELEGRAPH_MODE=live TELEGRAPH_PAY=x402 node src/cli.js live-once
```

`TELEGRAPH_PAY=x402` (default for live-once) signs an EIP-3009 x402 payment from the throwaway Sepolia EOA (key loaded from `../.secrets/sepolia-eoa.key`, never printed). `TELEGRAPH_PAY=key` uses the Anjoman API-key path when `../.secrets/anjoman_api_key` exists. Each live call is capped at $0.05 (`maxAmountPerPayment` 50000 units, or `maxSpendUsd` on the key path). See `docs/PAYMENT_PATH.md`.


## Live Intent IDs

The mission brief uses unsuffixed names. The live Telegraph catalogue (18 Nov 2026) serves them as `*_GENERAL`. SpendGuard uses the live IDs:

| Mission brief | Live intent | Role |
|---|---|---|
| `SANCTIONS_SCREENING_MATCH` | `SANCTIONS_SCREENING_MATCH_GENERAL` | Pre-settle: name match |
| `TRANSACTION_RISK` | `TRANSACTION_RISK_GENERAL` | Pre-settle: risk level |
| `FRAUD_RISK` | `FRAUD_RISK_GENERAL` | Pre-settle: fraud level |
| `GAS_PRICE` | `GAS_PRICE_GENERAL` | Ledger cost panel |
| `TASK_EXECUTION_QUALITY` | `TASK_EXECUTION_QUALITY_GENERAL` | Score a completed task |
| `CRYPTO_TRANSFER_VERIFY` | `CRYPTO_TRANSFER_VERIFY_GENERAL` | Post-settle verify (no published schema today; query form later) |

Engine (testnet): `https://devnode.telegraphprotocol.com/engine/v1/ask`. Unpaid calls return HTTP 402, as documented. Prefer Ethereum Sepolia for judged payments so they settle on the Diamond. See `../RULES.md` and `../PLAN.md`.

## Reused components

- Receipt / evidence-hash ideas from [AgentReceipts](https://github.com/halfabillion/agent-receipts) (our earlier BLI work).
- HTTP 402 / x402 client patterns from our UK Postcode Intel MCP and related x402 tools.

The Telegraph integration, policy, and ledger in this repo are new. Licenses of reused code will be followed if any files are copied later; none were copied into this first commit.

## Disclosure

Built with AI coding assistance. All tests and the mock demo are real and reproducible on this box. No live Telegraph purchase is claimed until one exists with receipts. Major reused components are listed above.

## Holds

Do not publish this repo, star `telegraphprotocol/bounties`, create an Anjoman account, hit a login faucet, move funds on Ali's wallets, post on X, or submit the entry, without Ali's own OK.
