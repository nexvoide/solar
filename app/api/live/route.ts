import {
  getLiveData,
  isConnected,
  KnoxError,
} from "@/lib/knox";
import { apiJson, hydrateKnoxFromRequest } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await hydrateKnoxFromRequest();

  try {
    if (!isConnected()) {
      return apiJson(
        { ok: false, error: "Not connected", offline: true },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    console.log(
      `[/api/live] Request at ${new Date().toISOString()} (t=${url.searchParams.get("_") ?? "none"})`,
    );

    const data = await getLiveData();
    return apiJson({ ok: true, ...data }, { saveSession: true });
  } catch (error) {
    const message =
      error instanceof KnoxError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fetch live data";

    const offline =
      message.toLowerCase().includes("offline") ||
      message.toLowerCase().includes("no record") ||
      message.toLowerCase().includes("not found");

    return apiJson(
      { ok: false, error: message, offline },
      { status: offline ? 503 : 500 },
    );
  }
}
