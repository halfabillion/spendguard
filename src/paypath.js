/** Default live rail is Diamond escrow, selected with TELEGRAPH_PAY=key. */
export const DEFAULT_PAY_PATH = "key";

export function resolvePayPath(value = process.env.TELEGRAPH_PAY) {
  const raw = value == null || String(value).trim() === "" ? DEFAULT_PAY_PATH : String(value).trim();
  const p = raw.toLowerCase();
  if (p === "key" || p === "escrow") return "key";
  if (p === "x402") return "x402";
  if (p === "anjoman") return "anjoman";
  throw new Error(`unknown TELEGRAPH_PAY: ${raw}`);
}

export function payPathLabel(path = resolvePayPath()) {
  if (path === "key") return "escrow";
  if (path === "x402") return "x402 (experimental)";
  return path;
}
