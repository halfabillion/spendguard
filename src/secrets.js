import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SECRETS_DIR = resolve(EVENT_ROOT, ".secrets");
export const DEFAULT_ANJOMAN_KEY_PATH = resolve(SECRETS_DIR, "anjoman_api_key");
export const DEFAULT_EOA_KEY_PATH = resolve(SECRETS_DIR, "sepolia-eoa.key");
export const DEFAULT_EOA_ADDRESS_PATH = resolve(SECRETS_DIR, "sepolia-eoa.address");

export function secretPathExists(path) {
  return Boolean(path) && existsSync(path) && statSync(path).isFile();
}

/** Read a secret file. Never log or return this from a CLI in the clear. */
export function readSecretFile(path) {
  if (!secretPathExists(path)) {
    const err = new Error("secret file is not present");
    err.code = "SECRET_MISSING";
    throw err;
  }
  const value = readFileSync(path, "utf8").trim();
  if (!value) {
    const err = new Error("secret file is empty");
    err.code = "SECRET_EMPTY";
    throw err;
  }
  return value;
}

export function readAddressFile(path = DEFAULT_EOA_ADDRESS_PATH) {
  const value = readSecretFile(path);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    const err = new Error("address file is not a 20-byte hex address");
    err.code = "BAD_ADDRESS";
    throw err;
  }
  return value;
}

export function readEoaPrivateKey(path = process.env.TELEGRAPH_EOA_KEY_PATH || DEFAULT_EOA_KEY_PATH) {
  const value = readSecretFile(path);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    const err = new Error("EOA key file is not a 32-byte hex key");
    err.code = "BAD_KEY_FORMAT";
    throw err;
  }
  return value;
}

export function readAnjomanKey(path = process.env.TELEGRAPH_API_KEY_PATH || DEFAULT_ANJOMAN_KEY_PATH) {
  if (process.env.TELEGRAPH_API_KEY) return process.env.TELEGRAPH_API_KEY.trim();
  return readSecretFile(path);
}

export function anjomanKeyAvailable() {
  if (process.env.TELEGRAPH_API_KEY) return true;
  return secretPathExists(process.env.TELEGRAPH_API_KEY_PATH || DEFAULT_ANJOMAN_KEY_PATH);
}

export function eoaKeyAvailable() {
  return secretPathExists(process.env.TELEGRAPH_EOA_KEY_PATH || DEFAULT_EOA_KEY_PATH);
}
