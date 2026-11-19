# Payment path recommendation (H2 Apps & Agents)

Updated **Thu 19 Nov 2026, late morning UK**. Official rules: `../RULES.md`.

## Recommendation: **Diamond escrow is the default judged purchase**

Use wallet-signed **escrow** on Ethereum Sepolia (`TELEGRAPH_PAY=key`, also accepted as `escrow`) as the default live rail and as the purchase we put in front of judges. The first paid escrow ask is already confirmed:

- Receipt `0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8`
- Telegraph epoch 15, 10000 uUSDC ($0.01 test USDC), payer `0xC11F…9965`, miner 6119 / ChainSight, intent `SANCTIONS_SCREENING_MATCH_GENERAL`
- Inclusion proof in `evidence/escrow-receipt-epoch15.json` (67 deliveries in the 06:06–09:06 UTC window; `deliveries_root` `0x3451…e093`)
- Ledger after the epoch: charged 10000, available 990000

Keep the Anjoman **API-key** path implemented as `TELEGRAPH_PAY=anjoman` (no key is provisioned on this box). Keep wallet-signed **x402 exact** as `TELEGRAPH_PAY=x402`, documented as **experimental**: `facilitator.x402.rs /verify` returned `isValid: true`, but `/settle` timed out on 18 Nov 2026 and again on the 19 Nov retry, and `/supported` listed no signer for `eip155:11155111`. No x402 settlement transaction exists. Do not keep retrying x402 for this entry unless the facilitator later supports Sepolia settlement.

## Does the escrow path count as the required purchase?

The Official Competition Rules (Apps & Agents) say:

> "Your app must make at least one genuinely autonomous machine-to-machine purchase or sale using the supported Telegraph flow, then use the intelligence to perform a meaningful task. A supported testnet implementation can qualify."

Mission acceptance also requires a reviewer to "Inspect the real Telegraph request and its available transaction or accounting evidence."

Official escrow docs treat this as a first-class supported flow: the payer signs an EIP-191 message over a 402 challenge; the node charges the once-funded Diamond escrow balance; the receipt is committed in the epoch block (`settlement: "epoch"`) with a Merkle inclusion proof. SpendGuard used that receipt to allow a clear payee (`Circle Internet Financial`, `matched: false`).

## Why escrow, not x402, is the default

x402 exact (EIP-3009, facilitator settlement) would have been the closer on-chain match, but the official testnet facilitator cannot settle Ethereum Sepolia payments from this box. Escrow already produced a real paid receipt, epoch inclusion, and a remaining test-USDC balance. That is the evidence a reviewer can inspect today.

The API-key path remains a supported fallback if an Anjoman key is later provisioned, but a strict reviewer could treat it as Anjoman purchasing on our behalf, with weaker on-chain evidence than an escrow receipt.

## Holds for any further payment

- No new paid Telegraph call unless `TELEGRAPH_ALLOW_NEW_SPEND=1` is explicitly set.
- No escrow top-up unless `TELEGRAPH_ALLOW_DEPOSIT=1` is explicitly set.
- If a further $0.01 call is ever approved, the remaining escrow balance already covers it (0.99 test USDC as of the epoch 15 ledger). Do not remint or redeposit by default.
- Secrets stay in `../.secrets/` and are never printed.

## Network references

- Engine: `https://devnode.telegraphprotocol.com/engine/v1/ask`
- Ledger: `https://devnode.telegraphprotocol.com/v1/ledger/account/<address>`
- Diamond: `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`
- Test USDC: `0xcc194e1a843B658526D0D5C431f670028582Ae17`
- Throwaway EOA (public): `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965`
- Deposit: approve `0x58177298…7a18` + `depositUSDC` `0x71271c4c…dc13` (Sepolia blocks 12167292/3)
- Faucet / mint (do not repeat): `0xe3fb7c05…f16b` / `0x8230b068…acb5`
