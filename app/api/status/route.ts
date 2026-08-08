import {
  getConnectionInfo,
  getDeviceInfo,
  isConnected,
} from "@/lib/knox";
import { apiJson, withRequestKnoxState } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withRequestKnoxState(request, () => apiJson({
      ok: true,
      connected: isConnected(),
      connection: getConnectionInfo(),
      device: getDeviceInfo(),
    }),
  );
}
