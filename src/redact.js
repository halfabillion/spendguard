/** Strip secrets from objects and strings before logging or writing evidence. */
const SECRET_RES = [
  /\banjoman_[A-Za-z0-9_-]+\b/g,
  /\btgk_[A-Za-z0-9_-]+\b/g,
  /\bBearer\s+\S+/gi,
  /\b0x[0-9a-fA-F]{64}\b/g, // private keys (not 40-char addresses)
  /\b(TELEGRAPH_API_KEY|EVM_PRIVATE_KEY|TELEGRAPH_PRIVATE_KEY)\s*=\s*\S+/g,
];

export function redact(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/authorization|private[_-]?key|api[_-]?key|secret|password/i.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export function redactString(s) {
  let out = String(s);
  for (const re of SECRET_RES) out = out.replace(re, "[redacted]");
  return out;
}

export function safeError(err) {
  const message = redactString(err?.message || String(err));
  const code = err?.code;
  const status = err?.status;
  return { message, code, status };
}
