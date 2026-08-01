import {
  getConnectionInfo,
  getDeviceInfo,
  isConnected,
} from "@/lib/knox";
import { apiJson, hydrateKnoxFromRequest } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function GET() {
  await hydrateKnoxFromRequest();

  return apiJson({
    ok: true,
    connected: isConnected(),
    connection: getConnectionInfo(),
    device: getDeviceInfo(),
  });
}
