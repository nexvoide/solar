import { NextResponse } from "next/server";
import {
  exportKnoxState,
  type KnoxPersistedState,
  withKnoxState,
} from "./knox";
import {
  sealKnoxState,
  sessionCookieOptions,
  readSessionCookie,
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

export function withRequestKnoxState<T>(
  request: Request,
  operation: (hasSession: boolean) => T,
): T {
  const saved: KnoxPersistedState | null = readSessionCookie(
    request.headers.get("cookie"),
  );
  return withKnoxState(saved, () => operation(saved !== null));
}
