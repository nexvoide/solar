import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  disconnect,
  exportKnoxState,
  restoreKnoxState,
} from "./knox";
import {
  sealKnoxState,
  sessionCookieOptions,
  unsealKnoxState,
  KNOX_SESSION_COOKIE,
} from "./knox-session";

export const dynamic = "force-dynamic";

const NO_CACHE = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

export function apiJson(
  body: unknown,
  init?: { status?: number; clearSession?: boolean; saveSession?: boolean },
): NextResponse {
  const response = NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: NO_CACHE,
  });

  const opts = sessionCookieOptions();

  if (init?.clearSession) {
    response.cookies.set(opts.name, "", { ...opts, maxAge: 0 });
    disconnect();
    return response;
  }

  if (init?.saveSession) {
    const state = exportKnoxState();
    if (state) {
      response.cookies.set(opts.name, sealKnoxState(state), opts);
    }
  }

  return response;
}

export async function hydrateKnoxFromRequest(): Promise<boolean> {
  disconnect();
  const cookieStore = await cookies();
  const value = cookieStore.get(KNOX_SESSION_COOKIE)?.value;
  if (!value) return false;

  const state = unsealKnoxState(value);
  if (!state) return false;

  restoreKnoxState(state);
  return true;
}
