const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function createTemplateSyncSignature(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  return `sha256=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

export async function verifyTemplateSyncAuth(
  secret: string,
  timestamp: string,
  providedSignature: string,
  body: string,
  now = Date.now(),
): Promise<boolean> {
  if (!secret || !/^\d+$/.test(timestamp)) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  const expected = await createTemplateSyncSignature(secret, timestamp, body);
  return timingSafeStringEqual(expected, providedSignature.trim());
}
