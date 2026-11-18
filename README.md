# SpendGuard

A **pre-settlement compliance gate** and **agent expense ledger** for machine stablecoin payments. It buys ranked intelligence through Telegraph, attaches the verified result to the payment as a proof, and records burn per category and cost per completed task.

Built for [Telegraph Hackathon Season II](https://hackathon.telegraphprotocol.com/), Apps & Agents track, [Mission 02 Stablecoin](https://hackathon.telegraphprotocol.com/missions/stablecoin). Local, private, not submitted.

This is a **testnet** project (Ethereum Sepolia). Default commands use a mock client and need no wallet, faucet, or network.

## Quick start

```bash
node --test test/*.test.js   # or: npm test
node src/cli.js demo         # allow path + denied (local denylist) path, then a ledger summary
```

Requires Node 20+ and `npm ci` (or `npm install`) for the live path's `@x402/*` and `viem` dependencies. Mock tests and `demo` run against source only.

## What the demo shows

1. A proposed USDC payment to a **clear** counterparty is screened (sanctions, transaction risk, fraud risk). It is allowed. A ledger entry is written, including the proof bundle and a gas-price quote.
2. A proposed payment to a **local-denylist** payee (`Blocked Entity Example`) is **denied before any Telegraph purchase**. No settlement and no spend.
3. The summary prints burn by category, cost per completed task, settlement count, and blocked count.

## Live run (feature flags, off by default)

Tests always use the mock client. A real run is:

```bash
TELEGRAPH_MODE=live TELEGRAPH_PAY=x402 node src/cli.js live-once
```

That command, in order:

1. Denies a sanctioned-name fixture (`Blocked Entity Example`) via the local denylist, with **no** x402 call and **$0** spend.
2. Buys one `SANCTIONS_SCREENING_MATCH_GENERAL` screen of `Circle Internet Financial` through wallet-signed x402 exact on Ethereum Sepolia, session cap **$0.05**. The body **omits** `max_budget_usdc`, so the quoted price is one call, **$0.01**.
3. Writes redacted evidence under `evidence/` (ledger + `x402-live.json`), including Etherscan Sepolia links. Secrets are never logged or written there.

`TELEGRAPH_PAY=x402` (default for live-once) loads the throwaway Sepolia EOA from `../.secrets/sepolia-eoa.key` and the public address from `../.secrets/sepolia-eoa.address`. The key is never printed. `TELEGRAPH_PAY=key` uses the Anjoman API-key path when `../.secrets/anjoman_api_key` exists. RPC: `https://ethereum-sepolia-rpc.publicnode.com` (`SEPOLIA_RPC_URL` to override). Diamond / x402 receiver: `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`. Test USDC: `0xcc194e1a843B658526D0D5C431f670028582Ae17` (6 decimals). See `docs/PAYMENT_PATH.md`.

### Mint (already done on this EOA)

The throwaway EOA is `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965`. Sepolia ETH came from the PoW faucet (0.25 ETH), then ~5 test USDC was minted with `mint(address,uint256)`:

| Step | Tx | Etherscan |
|---|---|---|
| Faucet 0.25 SepETH | `0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b` | [sepolia.etherscan.io](https://sepolia.etherscan.io/tx/0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b) |
| Mint 5 test USDC | `0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5` | [sepolia.etherscan.io](https://sepolia.etherscan.io/tx/0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5) |

Do not mint again unless the USDC balance is gone. The payer does not need ETH for the x402 payment itself (EIP-3009; the facilitator submits settlement).

### Live purchase status (18 Nov 2026, evening UK)

The denylist failure case ran as intended (deny, skipped purchase, $0). The live x402 payment **signature verifies** at `https://facilitator.x402.rs/verify` (`isValid: true`). Settlement does **not** complete: Telegraph's engine reports that `POST https://facilitator.x402.rs/settle` hits a context deadline (~30s), and a direct `/settle` from this box was aborted after 180s with **no** on-chain USDC transfer. The EOA still holds 5 test USDC. There is not yet a settlement tx, Telegraph receipt, or `signal_hash`. Re-run `live-once` when the official testnet facilitator can settle Ethereum Sepolia exact payments.

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

Built with AI coding assistance. All tests and the mock demo are real and reproducible on this box. A live x402 payment was signed and verified, but settlement was not completed because the official testnet facilitator `/settle` endpoint did not return. No settlement transaction is claimed. Major reused components are listed above.

## Holds

Do not publish this repo, star `telegraphprotocol/bounties`, create an Anjoman account, hit a login faucet, move funds on Ali's wallets, post on X, or submit the entry, without Ali's own OK.
