import crypto from "crypto";
import type { KnoxPersistedState } from "./knox";

const ALGO = "aes-256-gcm";
export const KNOX_SESSION_COOKIE = "knox_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET ??
    "knox-local-dev-secret-change-this-on-vercel";
  return crypto.createHash("sha256").update(secret).digest();
}

export function sealKnoxState(state: KnoxPersistedState): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const payload = JSON.stringify(state);
  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function unsealKnoxState(token: string): KnoxPersistedState | null {
  try {
    const buffer = Buffer.from(token, "base64url");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as KnoxPersistedState;
  } catch {
    return null;
  }
}

export function readSessionCookie(
  cookieHeader: string | null | undefined,
): KnoxPersistedState | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${KNOX_SESSION_COOKIE}=([^;]+)`),
  );
  if (!match?.[1]) return null;
  return unsealKnoxState(decodeURIComponent(match[1]));
}

export function sessionCookieOptions() {
  return {
    name: KNOX_SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}
