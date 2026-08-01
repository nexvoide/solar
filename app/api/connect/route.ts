import {
  connect,
  KnoxError,
} from "@/lib/knox";
import { apiJson } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      pn?: string;
      username?: string;
      password?: string;
    };

    const result = await connect({
      pn: body.pn ?? "",
      username: body.username,
      password: body.password,
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
}
