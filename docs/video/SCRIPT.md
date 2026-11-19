# SpendGuard demo video script

Silent, captioned recording, 2:30–3:00. File: `submit/video/spendguard-escrow-demo.mp4`. Recreate with `python3 docs/video/record-demo.py`.

This is a testnet demo. No new paid Telegraph call and no escrow top-up are made. The allow case reuses the already-confirmed epoch 15 receipt. Secrets are never shown. Captions only, no voice.

Recorded length (ffprobe): **179.600 seconds (2:59.6)**, 1280×720, h264, 30 fps, no audio.

## Runtime and shots

| Time (approx.) | Shot | On-screen | Caption |
|---|---|---|---|
| 0:00–0:08 | Title | SpendGuard · Telegraph Season II · Mission 02 Stablecoin. Default live rail: escrow (`TELEGRAPH_PAY=key`). x402 is experimental. Repo URL. | Pre-settlement compliance gate. Testnet only. No new spend in this recording. |
| 0:08–0:24 | Problem and the user | The problem (agents pay vendors; checks are easy to skip), who it is for (a hard gate before funds move), and what SpendGuard does. | Agents that pay vendors need a hard gate before any funds move. |
| 0:24–0:36 | Policy engine: denylist | `src/presettle.js`: `LOCAL_DENYLIST`, `isLocallyDenied`, early return with `skippedPurchase: true`. | A name on the local denylist is refused before any Telegraph call. |
| 0:36–0:49 | Policy engine: cap | `src/escrow.js`: `wouldExceedCap`, `assertWithinCap` (`SPEND_CAP`), and `ask` checking the cap before the request and again in `beforePay` before signing. | A session cap is checked before the request, and again before any signature. |
| 0:49–1:02 | Policy engine: allow path | `src/presettle.js` allow decision plus `src/flow.js` ledger record (`blocked` vs `settled` with receipts). | If the screens clear, SpendGuard buys the intelligence and records a ledger row with the proof. |
| 1:02–1:13 | Tests | `$ npm test` and the Node summary: 29 passed, 0 failed. | All 29 unit tests are green, including the escrow cap and the three evidence cases. |
| 1:13–1:31 | Deny | `$ node src/cli.js cases`, then the DENY JSON: `local_denylist`, `skippedPurchase` true, `telegraphCalls` 0, `spentUsd` 0, `keyLoads` 0. | Deny: a denylisted payee is blocked before any Telegraph call. Zero spend. |
| 1:31–1:46 | Spend limit | The SPEND LIMIT JSON: `blocked` true, `SPEND_CAP`, `sessionCapUsd` 0.005, `attemptedUsd` 0.01, `telegraphCalls` 0, `spentUsd` 0. | Cap: a $0.005 session limit refuses a $0.01 ask before any signature or spend. |
| 1:46–2:02 | Allow | The ALLOW JSON: `reusedExistingReceipt` true, `newSpend` false, receipt `0x99ca…fbf8`, epoch 15, $0.01 test USDC, Circle Internet Financial, ChainSight. | Allow: the judged purchase is the confirmed escrow receipt in epoch 15, reused, no new spend. |
| 2:02–2:17 | Epoch-15 receipt | `evidence/escrow-receipt-epoch15.json`: full receipt hash, epoch 15, intent, miner, payer, 10000 uUSDC, ledger charged/balance, block window, reuse note. | The judged purchase is this epoch-15 escrow receipt, $0.01 test USDC, reused so nothing new is spent. |
| 2:17–2:32 | Merkle proof | `deliveries_root`, `block_data_root`, `protocol_state_root`, and all 7 `merkle_proof` hashes from the epoch 15 block (67 deliveries). | The receipt is committed in the epoch 15 block. The Merkle proof shows it is in deliveries_root. |
| 2:32–2:48 | Architecture | Agent → SpendGuard policy (denylist, cap, allow) → Telegraph Diamond escrow on Sepolia (signal and receipt) → ledger outcome. | Policy first, then a Telegraph escrow purchase, then a ledger row with the receipt as the signal. |
| 2:48–2:59.6 | End card | `github.com/halfabillion/spendguard`, paths for allow / deny / limit / proof evidence, default rail, no new spend. | Source, evidence, and this demo: github.com/halfabillion/spendguard |

## Honesty

- x402 verified a signature but `/settle` timed out; no x402 settlement transaction exists, and it is not the judged purchase.
- The remaining escrow balance of 0.99 test USDC would cover another $0.01 call; that call was not made.
- Do not show private keys, seed phrases, or API keys.
