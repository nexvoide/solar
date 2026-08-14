import { apiJson, withRequestKnoxState } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withRequestKnoxState(request, () =>
    apiJson({ ok: true }, { clearSession: true }),
  );
}
