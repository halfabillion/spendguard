# SpendGuard

A **pre-settlement compliance gate** and **agent expense ledger** for machine stablecoin payments. It buys ranked intelligence through Telegraph, attaches the verified result to the payment as a proof, and records burn per category and cost per completed task.

Built for [Telegraph Hackathon Season II](https://hackathon.telegraphprotocol.com/), Apps & Agents track, [Mission 02 Stablecoin](https://hackathon.telegraphprotocol.com/missions/stablecoin). Local, private, not submitted.

This is a **testnet** project (Ethereum Sepolia + Telegraph escrow). Default commands use a mock client and need no wallet, faucet, or network. The default **live** rail is Diamond **escrow** (`TELEGRAPH_PAY=key`). Wallet-signed x402 is kept as an optional experimental flag; the official facilitator `/settle` timed out on 18 Nov 2026 and nothing settled.

## Quick start

```bash
node --test test/*.test.js   # or: npm test
node src/cli.js demo         # mock allow + local-denylist deny, then a ledger summary
node src/cli.js cases        # allow / deny / spend-limit evidence (no new spend)
```

Requires Node 20+ and `npm ci` (or `npm install`) for the live path's `@x402/*` and `viem` dependencies. Mock tests and `demo` run against source only.

## What the demo shows

`node src/cli.js demo` is mock-only:

1. A proposed USDC payment to a **clear** counterparty is screened (sanctions, transaction risk, fraud risk). It is allowed. A ledger entry is written, including the proof bundle and a gas-price quote.
2. A proposed payment to a **local-denylist** payee (`Blocked Entity Example`) is **denied before any Telegraph purchase**. No settlement and no spend.
3. The summary prints burn by category, cost per completed task, settlement count, and blocked count.

`node src/cli.js cases` writes the three judged live cases under `evidence/` **without a new paid call or top-up**:

1. **Allow** — the already-confirmed escrow purchase of one `SANCTIONS_SCREENING_MATCH_GENERAL` screen of `Circle Internet Financial` (receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8`, Telegraph epoch 15, 10000 uUSDC / $0.01 test USDC, miner ChainSight). The receipt is committed in the epoch block with a Merkle proof (`evidence/escrow-receipt-epoch15.json`). A further $0.01 call would be covered by the remaining escrow balance (~0.99 test USDC); it is **not** sent, because this update forbids new spend.
2. **Deny** — a sanctioned / denylisted payee (`Blocked Entity Example`) is blocked locally. **0** Telegraph calls, no key load, **$0** spend.
3. **Spending limit** — a session cap of $0.005 refuses a $0.01 ask **before** any engine request, signature, or spend.

A silent, captioned terminal recording of those cases is at [`submit/video/spendguard-escrow-demo.mp4`](submit/video/spendguard-escrow-demo.mp4). The walkthrough follows [`docs/video/SCRIPT.md`](docs/video/SCRIPT.md).

## Live run (escrow is the default)

Tests always use the mock client. The default live rail is escrow:

```bash
TELEGRAPH_MODE=live TELEGRAPH_PAY=key node src/cli.js cases
# or, same default and still no new spend:
TELEGRAPH_MODE=live node src/cli.js live-once
```

`TELEGRAPH_PAY=key` (aliases: `escrow`; this is the default) signs an EIP-191 escrow payment against the once-funded Diamond balance. Secrets are loaded from `../.secrets/sepolia-eoa.key` and the public address from `../.secrets/sepolia-eoa.address`. The key is never printed. A new paid call is made only if `TELEGRAPH_ALLOW_NEW_SPEND=1` is set **and** the existing escrow balance already covers $0.01. There is no automatic top-up (`TELEGRAPH_ALLOW_DEPOSIT=1` is required for any deposit script).

`TELEGRAPH_PAY=x402` is **experimental**. The official testnet facilitator at `facilitator.x402.rs` verified a signature (`isValid: true`) but `/settle` timed out; no settlement transaction was observed. Do not use it as the judged purchase.

`TELEGRAPH_PAY=anjoman` is the official API-key path (`../.secrets/anjoman_api_key`). It is implemented and unit-tested; no Anjoman key is provisioned on this box.

RPC: `https://ethereum-sepolia-rpc.publicnode.com` (`SEPOLIA_RPC_URL` to override). Diamond / escrow receiver: `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`. Test USDC: `0xcc194e1a843B658526D0D5C431f670028582Ae17` (6 decimals). See `docs/PAYMENT_PATH.md`.

### Funding (already done on this throwaway EOA)

The throwaway EOA is `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965`. Do not remint or redeposit unless a later approved step says so.

| Step | Tx / receipt | Evidence |
|---|---|---|
| Faucet 0.25 SepETH | `0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b` | [Etherscan](https://sepolia.etherscan.io/tx/0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b) |
| Mint 5 test USDC | `0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5` | [Etherscan](https://sepolia.etherscan.io/tx/0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5) |
| Approve 1 test USDC to Diamond | `0x58177298a1fccf0ec1547d9524971f549d711216e1694d013caa8c1057287a18` | Sepolia block 12167292 |
| `depositUSDC(1)` | `0x71271c4c7c2072d1b4c23db0bee7025dca0f3abf6ee51a20df19efe17475dc13` | Sepolia block 12167293 |
| First paid escrow ask | receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8` | Epoch 15, 10000 uUSDC charged, Merkle proof in `evidence/escrow-receipt-epoch15.json` |

### x402 attempt (not the judged purchase)

A wallet-signed x402 exact payment **signature verifies** at `https://facilitator.x402.rs/verify` (`isValid: true`). Settlement did **not** complete: `POST https://facilitator.x402.rs/settle` timed out, and no outbound USDC transfer was observed. There is no x402 settlement tx. See `evidence/x402-live.json`.

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

Engine (testnet): `https://devnode.telegraphprotocol.com/engine/v1/ask`. Unpaid calls return HTTP 402, as documented. Escrow settlement is recorded in the Telegraph epoch block (`settlement: "epoch"`). See `../RULES.md` and `../PLAN.md`.

## Reused components

- Receipt / evidence-hash ideas from [AgentReceipts](https://github.com/halfabillion/agent-receipts) (our earlier BLI work).
- HTTP 402 / x402 client patterns from our UK Postcode Intel MCP and related x402 tools.

The Telegraph integration, policy, and ledger in this repo are new. Licenses of reused code will be followed if any files are copied later; none were copied into this first commit.

## Disclosure

Built with AI coding assistance. All tests, the mock demo, and the three evidence cases are real and reproducible on this box. The judged purchase is the confirmed Telegraph escrow receipt in epoch 15 (test USDC only). A live x402 payment was signed and verified, but settlement was not completed because the official testnet facilitator `/settle` endpoint did not return. No x402 settlement transaction is claimed. Major reused components are listed above.

## Holds

Do not publish this repo, star `telegraphprotocol/bounties`, create an Anjoman account, hit a login faucet, move funds on Ali's wallets, post on X, or submit the entry, without Ali's own OK. Do not make a new paid Telegraph call or escrow top-up without an explicit spend approval.
