# Payment path recommendation (H2 Apps & Agents)

Updated **Wed 18 Nov 2026, evening UK**. Official rules: `../RULES.md`. Sepolia ETH and 5 test USDC are on the throwaway EOA (mint already confirmed). The live x402 signature verifies; official facilitator `/settle` is currently hanging, so no settlement tx yet (see README).

## Recommendation: **both**, with wallet-signed x402 as the judged purchase when it can be completed

Implement and keep the Anjoman **API-key escrow** path, and use **wallet-signed x402 exact** on Ethereum Sepolia as the purchase we put in front of judges if we can settle one. A separate throwaway testnet EOA is required only for the x402 path (already generated). The key path does not need an EOA.

## Does the API-key path count as the required purchase?

The Official Competition Rules (Apps & Agents) say:

> "Your app must make at least one genuinely autonomous machine-to-machine purchase or sale using the supported Telegraph flow, then use the intelligence to perform a meaningful task. A supported testnet implementation can qualify."

And:

> "Use the supported interfaces and show genuine evidence for any claims about registration, requests, rankings, payment, accounting, or rewards."

Mission acceptance also requires a reviewer to "Inspect the real Telegraph request and its available transaction or accounting evidence."

Official docs treat the API key as a first-class supported way to call Telegraph from an agent:

> "An API key lets a script, a server or an AI agent use Telegraph through your Anjoman account. You sign up, deposit once from the website, create a key, and send requests with it."
> ([Use an API Key](https://docs.telegraphprotocol.com/docs/using/api-keys))

Start Here says:

> "No wallet? Create an Anjoman account, deposit from the website and call Telegraph with an API key instead. You send a plain-language question and Anjoman picks the miners and pays for them."

So the key path is a **supported Telegraph flow**, it is paid from account escrow, and `GET /agent/spend` plus job IDs are **accounting evidence**. A script calling `POST /agent/chat` with `Authorization: Bearer` and no human in the loop is reasonably "autonomous machine-to-machine."

The same docs, however, weaken it for this mission and for the technical score:

> "There is no wallet to manage, no signing and no x402 or escrow transaction on your side: Anjoman pays for each call from your account's balance."
> "A key cannot deposit, withdraw, change your account or create other keys."
> "`/engine/ask`: a key asks through `/agent/chat`, which chooses the miners for you."

A strict reviewer could treat this as Anjoman purchasing on our behalf, with weaker on-chain evidence than an x402 receipt.

## Would wallet-signed x402 score better on the 24/35 technical minimum?

**Yes, likely.** Scoring awards 35 points to "Technical quality and mainnet readiness," with a **minimum of 24/35**, "plus a working Telegraph purchase." Judges "will also consider how close the app is to real-world use, given the features the network currently supports."

The Stablecoin mission wants "every settlement countable on chain." Official x402 receipts include `rail: "x402"`, `settlement: "onchain"`, and a `tx_hash` on Ethereum Sepolia, where "Only Ethereum Sepolia pays the Diamond, where the network settles."

The app still has to clear 24/35 either way. x402 is the closer match to mainnet machine payments and to this mission. The key path is the right fallback if escrow is later funded and x402 cannot be settled in time, and it remains useful as a second supported interface in the repo.

## Do we need a separate EOA?

- **API-key path: no.** Anjoman pays from the account escrow; the key cannot deposit or withdraw.
- **x402 path: yes.** A throwaway Ethereum Sepolia EOA, not one of Ali's wallets. Address (public): `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965`. Key file is gitignored and is never printed.

## Is x402 settlement on Sepolia gasless for the payer? **Yes**

Official Pay per Request (x402) docs:

> "The signature is EIP-712 typed data over the token's own domain, not a plain `transfer` call."
> "The node forwards the payment proof to its x402 facilitator (`https://facilitator.x402.rs` on the testnet) for verification."
> "the facilitator batches concurrent payments from one wallet into a single settlement transaction"

The official `@x402/evm` package (v2.31.0, the library those docs tell us to use) states:

> "EVM (Ethereum Virtual Machine) implementation of the x402 payment protocol using the **Exact** payment scheme with EIP-3009 TransferWithAuthorization."
> "Facilitator - For payment processors that verify and execute on-chain transactions"

On-chain check today against test USDC `0xcc194e1a843B658526D0D5C431f670028582Ae17`: `TRANSFER_WITH_AUTHORIZATION_TYPEHASH()` and `RECEIVE_WITH_AUTHORIZATION_TYPEHASH()` both return a `bytes32`. The payer signs; the facilitator (not the payer) submits the settlement transaction, so the payer does not need Sepolia ETH for the x402 payment itself.

We still need a little Sepolia ETH **once**, to `mint` test USDC to the EOA (a normal `mint(address,uint256)` transaction). After that, x402 purchases can be gasless for the payer.

The official "What You Need" list for x402 is USDC, an x402 client library, Node 20+, and the node URL — it does not list ETH for the payment step.

## Faucet status (18 Nov ~18:05 UK)

The Anjoman faucet is blocked (MMG). Test USDC is open-mint, but the mint needs Sepolia ETH.

Tried from the shell, no login, no mainnet ETH, no spend:

- Official PoW faucet API: `POST https://www.sepolia-faucet.pk910.de/api/startSession` with our EOA returned `{"status":"failed","failedCode":"INVALID_CAPTCHA","failedReason":"captcha check failed: captcha token missing"}`. Config says `captcha.requiredForStart: true`. There is no official CLI/API miner that bypasses the captcha. Mining happens in the browser after a captcha.
- No Ethereum Sepolia ETH was found on the throwaway EOA or on other box addresses checked read-only (qday deployer, biq-payer, frantic-payout, Ali's Phantom payout, steward deployer). The steward deployer still holds only ~0.0000936 ETH on **Base** Sepolia, which cannot pay Ethereum Sepolia gas. No funds were moved.

**Browser unblocker for the parent:** open [https://www.sepolia-faucet.pk910.de/](https://www.sepolia-faucet.pk910.de/), paste `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965`, complete the captcha, mine a small amount, and claim. A few times 0.001 ETH is enough to mint 5 test USDC. Then we can mint and run the capped x402 purchase without spending real money.


## Faucet / mint / live settle (18 Nov 2026, evening UK)

PoW faucet and mint are done. Do not remint.

- Faucet 0.25 SepETH: [0xe3fb7c05…f16b](https://sepolia.etherscan.io/tx/0xe3fb7c05a813d4fb1f20c2fc983885e2eca8b8fa083da0c002646f3fd0cef16b), block 12163102
- Mint 5 test USDC: [0x8230b068…acb5](https://sepolia.etherscan.io/tx/0x8230b068ab9ab4ce180f7027d5bec83f242fc7dc0dfdb506a05ec6f6c5f4acb5), block 12163110
- EOA `0xC11FBCbE43baF505F37dD6B95054C5eB380A9965` still holds 5 USDC after verified-but-unsettled x402 attempts. `POST https://facilitator.x402.rs/verify` returns `isValid: true`. `POST https://facilitator.x402.rs/settle` did not return in 180s from this box, and the Telegraph engine hits a ~30s context deadline calling the same URL. No outbound USDC transfer was observed.
