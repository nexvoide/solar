import { apiJson } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function POST() {
  return apiJson({ ok: true }, { clearSession: true });
}
