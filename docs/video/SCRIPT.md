# SpendGuard demo video script

Silent, captioned terminal recording, target ≤ 2 minutes. File: `submit/video/spendguard-escrow-demo.mp4`. Recreate with `python3 docs/video/record-demo.py`.

This is a testnet demo. No new paid Telegraph call and no escrow top-up are made. The allow case reuses the already-confirmed epoch 15 receipt. Secrets are never shown.

## Runtime and shots

| Time (approx.) | Shot | On-screen | Caption |
|---|---|---|---|
| 0:00–0:08 | Title | SpendGuard · Telegraph Season II · Mission 02 Stablecoin. Default live rail: escrow (`TELEGRAPH_PAY=key`). x402 is experimental. | Pre-settlement compliance gate. Testnet only. No new spend in this recording. |
| 0:08–0:22 | Tests | `$ npm test` then the Node test summary: 29 passed, 0 failed. | All unit tests are green, including the escrow cap and the three evidence cases. |
| 0:22–0:44 | Deny | `$ node src/cli.js cases`, then the DENY JSON: local denylist, skippedPurchase true, telegraphCalls 0, spentUsd 0, keyLoads 0. | A denylisted payee is blocked before any Telegraph call. Zero spend. |
| 0:44–1:06 | Spend limit | The SPEND LIMIT JSON: blocked true, code SPEND_CAP, sessionCapUsd 0.005, attemptedUsd 0.01, telegraphCalls 0, spentUsd 0. | A $0.005 cap refuses a $0.01 ask before any engine request, signature, or spend. |
| 1:06–1:40 | Allow | The ALLOW JSON: reusedExistingReceipt true, newSpend false, receipt `0x99ca…fbf8`, epoch 15, cost $0.01 test USDC, Circle Internet Financial, ChainSight, escrow available 990000, covers another call but none was sent. Then the three evidence paths. | The judged purchase is the confirmed escrow receipt in epoch 15. It is reused so this update spends nothing more. |
| 1:40–1:50 | End | Evidence files, default rail, holds: no submit and no new spend without Ali's OK. Demo due 25 Nov 2026. | Local only. Final submit still needs Ali's go. |

## Spoken version (optional, not in this file)

If a later voice-over is added, keep it under two minutes and do not claim an x402 settlement or a new paid call.

1. SpendGuard is a pre-settlement gate. The default live rail is Telegraph escrow on Sepolia testnet.
2. Tests are green.
3. A denylisted payee is refused before any Telegraph call.
4. A spending cap blocks an over-budget ask before any spend.
5. The allowed purchase is the confirmed receipt 0x99ca…fbf8 in epoch 15, for one cent of test USDC. We reused that receipt and did not spend again.
6. The repo is still local and unsubmitted.

## Honesty

- x402 verified a signature but `/settle` timed out; no x402 settlement transaction exists.
- The remaining escrow balance of 0.99 test USDC would cover another $0.01 call; that call was not made.
- Do not show private keys, seed phrases, or API keys.
