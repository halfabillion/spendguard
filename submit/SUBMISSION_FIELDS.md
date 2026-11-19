# Telegraph Season II — SpendGuard submission fields

Ready-to-paste answers for the official H2 entry form. **Do not submit this form yet.**

Deadline: **Tuesday 1 December 2026, 23:59 UTC (23:59 UK)**.

## Where to submit

The Official Competition Rules say: “Submit through the official H2 website by December 1, 2026, at 23:59 UTC.”

- Hackathon site: https://hackathon.telegraphprotocol.com/
- Official rules: https://hackathon.telegraphprotocol.com/rules
- The signed-in dashboard (likely where the form lives): https://anjoman.ai/dashboard/hackathon/season-2

The live form is behind an Anjoman / H2 login, so exact widget labels may differ slightly. The field list below follows the Official Competition Rules (“What to submit by December 1”) plus the Apps & Agents commercial questions. Map each block to the closest form control. Do not create the account or submit the form in this prep step.

A **star on** [github.com/telegraphprotocol/bounties](https://github.com/telegraphprotocol/bounties) is required for every track. That star had not been made when this file was written; it should be done from the `halfabillion` GitHub account as part of the browser submission step.

## 1. Project details

| Field | Value |
|---|---|
| Team / contact name | Ali Ghaedi |
| Contact email | gh.ali7755@gmail.com |
| GitHub username (the account that must star the bounties repo) | `halfabillion` |
| X (optional) | https://x.com/half_abillion |
| Team size | Solo |
| Track | Track 03 — Apps & Agents |
| Mission | Mission 02 — Stablecoin |
| Project name | SpendGuard |
| Chosen Intents (live catalogue names) | `SANCTIONS_SCREENING_MATCH_GENERAL`, `TRANSACTION_RISK_GENERAL`, `FRAUD_RISK_GENERAL` (pre-settle screens); `GAS_PRICE_GENERAL` (ledger cost panel). Also wired, not required for the judged purchase: `TASK_EXECUTION_QUALITY_GENERAL`, `CRYPTO_TRANSFER_VERIFY_GENERAL`. |
| Working / reviewer-access link | https://github.com/halfabillion/spendguard |
| How to run quickly | Clone the repo, `npm ci`, then `npm test` and `node src/cli.js cases`. See section 3. |

## 2. Short demo

A 2–5 minute video or accessible equivalent showing the real input, result, and Telegraph integration. A screen recording is fine.

| Item | Value |
|---|---|
| File in this repo | [`submit/video/spendguard-escrow-demo.mp4`](video/spendguard-escrow-demo.mp4) |
| Direct URL (use this if the form asks for a video link) | https://raw.githubusercontent.com/halfabillion/spendguard/main/submit/video/spendguard-escrow-demo.mp4 |
| GitHub preview | https://github.com/halfabillion/spendguard/blob/main/submit/video/spendguard-escrow-demo.mp4 |
| Duration / format | About **100 seconds**, silent, on-screen captions, title and end cards, no voice |
| What it shows | Allow (confirmed escrow purchase), deny (blocked payee, no spend), and spending-limit (cap stops a $0.01 ask before anything is signed) |

**Hosting note.** The official rules do not name a required video host. If the form accepts a URL, paste the raw GitHub URL above (the mp4 is already in the public repo). If the form requires a YouTube, Loom, or Google Drive link, upload this same file there during the browser step and paste that URL instead. Do not re-encode unless the host rejects the file.

**Duration note.** The recording is a little under the “2–5 minute” ask. It is a complete screen recording of the three judged cases and the Telegraph receipt, offered as an accessible equivalent. If the form or a reviewer wants a longer cut, extend the same captions rather than recording a new spend.

Suggested official demo flow, covered in the video and the evidence files: Problem → Telegraph request → Intelligence and Provider evidence → Observed cost → Completed result → How to try it.

## 3. How to run it

**Prerequisites.** Node.js 20+, git, and a network connection only if you want to inspect live receipts (the default commands do not spend).

```bash
git clone https://github.com/halfabillion/spendguard.git
cd spendguard
npm ci
npm test                 # unit tests, no wallet, no network spend
node src/cli.js demo     # mock allow + local-denylist deny, then a ledger summary
node src/cli.js cases    # allow / deny / spend-limit evidence (no new spend)
```

**Configuration.** Copy `.env.example` to `.env` if you want to override defaults. `TELEGRAPH_MODE=mock` (the usual local default for `demo`) needs no secrets. The default **live** rail is Diamond escrow (`TELEGRAPH_PAY=key` or `escrow`). Secret files, if you ever run a new live payment, belong *outside* the repo (locally we use `../.secrets/`, which is gitignored). Never paste keys into `.env` in a way that could be committed.

**Sample request / expected result.**

- `node src/cli.js cases` reprints the three judged cases from `evidence/` and does **not** make a new paid call.
- Allow: the already-confirmed escrow purchase of one `SANCTIONS_SCREENING_MATCH_GENERAL` screen of `Circle Internet Financial`, receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8`, Telegraph epoch 15, 10000 uUSDC ($0.01 test USDC), miner ChainSight.
- Deny: payee `Blocked Entity Example` is blocked locally; 0 Telegraph calls; $0 spend.
- Spending limit: a $0.005 session cap refuses a $0.01 ask before any engine request, signature, or spend.

**Actual network.** Ethereum Sepolia (Telegraph testnet) for the judged purchase. Mock mode for the default `demo` command.

**Spending limits or costs.** A request costs $0.01 test USDC per miner whose answer is used. The judged purchase already spent $0.01 test USDC from a once-funded escrow. Remaining escrow was about 0.99 test USDC; **no further spend is made** unless `TELEGRAPH_ALLOW_NEW_SPEND=1` is set on purpose. `SPENDGUARD_MAX_COST_USD` defaults to `0.05` in `.env.example`.

**Known limitations.** Wallet-signed x402 is experimental: the official facilitator verified a signature but `/settle` timed out, and no settlement transaction is claimed. The Anjoman API-key path is implemented and unit-tested; no Anjoman key is provisioned in this package. This is testnet only. The default live commands reuse existing evidence and do not send a new paid call.

## 4. Evidence

Public, already in the repository (no private keys):

| Case | File | What it proves |
|---|---|---|
| Judged purchase (allow) | `evidence/escrow-receipt-epoch15.json` | Receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8`, epoch 15, 10000 uUSDC, Merkle proof in the epoch block |
| Allow write-up | `evidence/allow.json` | Allow-path record for the same purchase |
| Live escrow ask | `evidence/escrow-live.json`, `evidence/escrow-live-ask.json` | Deposit and ask context on Sepolia |
| Deny | `evidence/deny.json` | Blocked payee; 0 Telegraph calls; $0 |
| Spending limit | `evidence/spend-limit.json` | $0.005 cap blocked a $0.01 ask pre-signature |
| x402 attempt (not judged) | `evidence/x402-live.json`, `evidence/x402-ledger.json` | Signature verified; settle timed out; no settlement tx claimed |
| Tests | `npm test` (`test/*.test.js`) | Policy, ledger, escrow, redact, and rail unit tests |

Engine: `https://devnode.telegraphprotocol.com/engine/v1/ask`. Diamond / escrow receiver: `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`. Test USDC: `0xcc194e1a843B658526D0D5C431f670028582Ae17`. Throwaway test EOA (public address only): `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965`.

Sensitive material: none to share privately. Private keys and any API keys stay out of the repository.

## 5. Short public summary

SpendGuard is a pre-settlement compliance gate and agent expense ledger for machine stablecoin payments, built for Telegraph Season II, Apps & Agents, Mission 02 Stablecoin.

Before an agent pays a vendor, it buys ranked sanctions, transaction-risk, and fraud-risk intelligence through Telegraph, allows or denies the payment, and records burn per category and cost per completed task. A confirmed testnet escrow purchase (receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8`, epoch 15, $0.01 test USDC) screens `Circle Internet Financial`. A denylisted payee is blocked with no Telegraph call and no spend. A spending cap stops an over-budget ask before anything is signed.

Source and reviewer instructions: https://github.com/halfabillion/spendguard

Optional growth links (none claimed yet): leave blank unless later posts are made on separate dates and disclosed as a hackathon entry.

## 6. Showcase permission

- The public README, this submission text, the repository, the demo video, and the evidence JSON (which contain no private keys) **may be shared publicly** by Telegraph / Anjoman for showcasing Season II work.
- Buyer introductions: **yes**.
- Do **not** share private keys, `.secrets`, `.env` files, or any future customer data. None of those are in the public repository.

These choices do not affect technical scores.

## Apps & Agents: working app identity

| Item | Value |
|---|---|
| Working app | SpendGuard (CLI compliance gate + expense ledger) |
| Mission | 02 Stablecoin |
| Intents purchased / used for the judged result | `SANCTIONS_SCREENING_MATCH_GENERAL` (confirmed paid escrow receipt in epoch 15). The allow path also models transaction-risk and fraud-risk screens; the recorded purchase is the sanctions screen above. |
| Outcome | A proposed $ payment to a clear counterparty was allowed and backed by a verified Telegraph receipt; a blocked payee was denied with no spend; an over-cap ask was refused pre-signature. |

## Apps & Agents: five commercial questions

**1. Who is it for?**

Teams that let software agents pay vendors in stablecoins and need a hard policy gate — sanctions / denylist, risk screens, and a spending cap — before any funds move.

**2. What it improves?**

Today those checks are easy to skip or to do after the payment. SpendGuard runs them first, buys the ranked Telegraph intelligence it needs, and writes an expense ledger with proof attached to each allowed payment.

**3. What it does today (with proof of Telegraph use, spending, and latency)?**

On Ethereum Sepolia it already completed one paid Diamond escrow purchase: receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8`, Telegraph epoch 15, 10000 uUSDC ($0.01 test USDC), miner ChainSight, Merkle-proved in the epoch block (`evidence/escrow-receipt-epoch15.json`). That result was used to allow a screen of `Circle Internet Financial`. Deny and cap cases complete locally with no extra spend. Latency for the judged purchase is the recorded escrow ask / epoch settlement (not a real-time x402 settle; x402 `/settle` timed out and is not claimed).

**4. Why would someone adopt it?**

It fails closed: a denylisted payee never reaches Telegraph, and a cap is enforced before a signature. Allowed payments carry a verifiable receipt and a ledger line, so an operator can see burn per category and cost per task.

**5. How can someone try it?**

Clone https://github.com/halfabillion/spendguard, run `npm ci`, `npm test`, and `node src/cli.js cases`. That reprints the three judged cases with no new spend. The captioned demo is at https://raw.githubusercontent.com/halfabillion/spendguard/main/submit/video/spendguard-escrow-demo.mp4.

## Still required in the browser (not done in this prep)

1. Sign in or register on the official H2 / Anjoman dashboard (https://anjoman.ai/dashboard/hackathon/season-2) if that has not already been done.
2. Star https://github.com/telegraphprotocol/bounties from the `halfabillion` GitHub account.
3. Paste the fields above into the form, attach or link the demo video as the form requires, and submit before 1 Dec 2026, 23:59 UK.
