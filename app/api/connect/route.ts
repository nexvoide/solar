import {
  connect,
  KnoxError,
} from "@/lib/knox";
import { apiJson, withRequestKnoxState } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withRequestKnoxState(request, async () => {
   try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiJson({ ok: false, error: "Invalid request" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const pn = typeof input.pn === "string" ? input.pn : "";
    const username = typeof input.username === "string" ? input.username : undefined;
    const password = typeof input.password === "string" ? input.password : undefined;

    if (pn.length > 128 || (username?.length ?? 0) > 128 || (password?.length ?? 0) > 512) {
      return apiJson({ ok: false, error: "Invalid request" }, { status: 400 });
    }

    const result = await connect({
      pn,
      username,
      password,
    });

    return apiJson({ ok: true, ...result }, { saveSession: true });
  } catch (error) {
    const message =
      error instanceof KnoxError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Connection failed";

    return apiJson({ ok: false, error: message }, { status: 400 });
   }
  });
}
