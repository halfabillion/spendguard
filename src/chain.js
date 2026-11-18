import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
export const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_CAIP = "eip155:11155111";

const usdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)",
]);

export function sepoliaClient(rpc = SEPOLIA_RPC) {
  return createPublicClient({ chain: sepolia, transport: http(rpc) });
}

export async function readBalances(address, { client } = {}) {
  const c = client || sepoliaClient();
  const [ethWei, usdcRaw] = await Promise.all([
    c.getBalance({ address }),
    c.readContract({ address: SEPOLIA_USDC, abi: usdcAbi, functionName: "balanceOf", args: [address] }),
  ]);
  return {
    address,
    ethWei: ethWei.toString(),
    usdcRaw: usdcRaw.toString(),
    usdc: formatUnits(usdcRaw, 6),
    token: SEPOLIA_USDC,
    network: SEPOLIA_CAIP,
  };
}
