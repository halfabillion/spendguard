// Telegraph escrow rail (EIP-191 personal_sign against a once-funded Diamond balance).
// Docs: https://docs.telegraphprotocol.com/docs/using/escrow-inference
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { randomUUID } from "node:crypto";
import { SEPOLIA_USDC, SEPOLIA_RPC, sepoliaClient } from "./chain.js";

export const DIAMOND = "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b";
export const NODE = "https://devnode.telegraphprotocol.com";

export async function ledgerAccount(address) {
  const r = await fetch(`${NODE}/v1/ledger/account/${address.toLowerCase()}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function depositEscrow(privateKey, amountUusdc) {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
  const pub = sepoliaClient();
  const approveTx = await wallet.writeContract({ address: SEPOLIA_USDC, abi: parseAbi(["function approve(address,uint256) returns (bool)"]), functionName: "approve", args: [DIAMOND, BigInt(amountUusdc)] });
  const a = await pub.waitForTransactionReceipt({ hash: approveTx });
  const depositTx = await wallet.writeContract({ address: DIAMOND, abi: parseAbi(["function depositUSDC(uint256)"]), functionName: "depositUSDC", args: [BigInt(amountUusdc)] });
  const d = await pub.waitForTransactionReceipt({ hash: depositTx });
  return { approveTx, approveStatus: a.status, approveBlock: String(a.blockNumber), depositTx, depositStatus: d.status, depositBlock: String(d.blockNumber) };
}

export function escrowEntry(accepts = []) {
  return accepts.find((x) => x.scheme === "escrow" && x.network === "eip155:11155111");
}

export async function escrowAsk(privateKey, body, url = `${NODE}/engine/v1/ask`) {
  const account = privateKeyToAccount(privateKey);
  const from = account.address.toLowerCase();
  const first = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (first.status !== 402) return { stage: "challenge", status: first.status, body: await first.text() };
  const challenge = await first.json();
  const entry = escrowEntry(challenge.accepts);
  if (!entry) return { stage: "challenge", error: "no escrow entry" };
  const tpl = entry.extra.message;
  const value = (tpl.match(/Amount:\s*(\d+)/) || [])[1];
  const now = Math.floor(Date.now() / 1000);
  const validAfter = String(now - 10), validBefore = String(now + 100), nonce = randomUUID();
  const message = tpl.replace("{from}", from).replace("{nonce}", nonce).replace("{validAfter}", validAfter).replace("{validBefore}", validBefore);
  const signature = await account.signMessage({ message });
  const envelope = { x402Version: 2, scheme: "escrow", network: "eip155:11155111", payload: { signature, authorization: { from, to: entry.payTo.toLowerCase(), value, validAfter, validBefore, nonce } } };
  const paid = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "X-PAYMENT": Buffer.from(JSON.stringify(envelope)).toString("base64") }, body: JSON.stringify(body) });
  const hdr = paid.headers.get("x-payment-response");
  const receipt = hdr ? JSON.parse(Buffer.from(hdr, "base64").toString("utf8")) : null;
  return { stage: "paid", status: paid.status, quotedValue: value, nonce, receipt, body: await paid.text() };
}
