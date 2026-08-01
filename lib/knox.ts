import axios from "axios";
import crypto from "crypto";

/** ShineMonitor cloud API base used by the Knox Android app. */
const API_BASE = "http://android.shinemonitor.com/public/";

/** Knox vendor credentials observed from the KNOXHYBRID Android app. */
const COMPANY_KEY = "bnrl_frRFjEz8Mkn";
const APP_ID = "com.eybond.smartclient.knoxhybrid";
const APP_CLIENT = "android";
const APP_VERSION = "1.2.2.1";
const SOURCE = "1"; // 1 = energy storage / hybrid

/** Auth error codes that should trigger a token refresh + retry. */
const TOKEN_ERROR_CODES = new Set([
  0x0003, // token invalid / expired (common)
  0x0004,
  0x0005,
  3,
  4,
  5,
  401,
]);

export interface ConnectionConfig {
  pn: string;
  username?: string;
  password?: string;
}

export interface FieldReading {
  value: string;
  unit: string;
}

export interface LiveData {
  pvPower: FieldReading;
  loadPower: FieldReading;
  gridPower: FieldReading;
  pvVoltage: FieldReading;
  pvCurrent: FieldReading;
  outputVoltage: FieldReading;
  outputCurrent: FieldReading;
  outputFrequency: FieldReading;
  gridVoltage: FieldReading;
  gridFrequency: FieldReading;
  gridConnected: boolean;
  todayEnergy: FieldReading;
  temperature: FieldReading;
  faultCode: FieldReading;
  warningCode: FieldReading;
  statusCode: number | null;
  statusText: string;
  isGenerating: boolean;
  lastUpdated: string;
  fetchedAt: string;
}

interface Session {
  token: string;
  secret: string;
  expiresAt: number;
}

interface DeviceInfo {
  pn: string;
  sn: string;
  devcode: string;
  devaddr: string;
}

interface ApiResponse<T = unknown> {
  err: number;
  desc: string;
  dat?: T;
}

type FlowEntry = { par?: string; val?: string | number; unit?: string };
type LastDataEntry = { title?: string; val?: string | number; unit?: string };

/** In-memory session — token/secret are never exposed to the client. */
let session: Session | null = null;
let connection: ConnectionConfig | null = null;
let device: DeviceInfo | null = null;

const http = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent": "Knox-PV9000-Dashboard/1.0",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
});

function sha1Hex(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function nowMillis(): string {
  return Date.now().toString();
}

function appSuffix(): string {
  return `&source=${SOURCE}&_app_client_=${APP_CLIENT}&_app_id_=${APP_ID}&_app_version_=${APP_VERSION}`;
}

function isTokenError(error: unknown): boolean {
  if (!(error instanceof KnoxError)) return false;
  if (error.code !== undefined && TOKEN_ERROR_CODES.has(error.code)) return true;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("token") ||
    msg.includes("expire") ||
    msg.includes("auth") ||
    msg.includes("secret")
  );
}

function toKw(value: string, unit: string): number {
  if (value === "—") return 0;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return 0;
  const u = unit.toLowerCase();
  if (u === "kw") return num;
  if (u === "w") return num / 1000;
  return num;
}

function formatLogPower(reading: FieldReading): string {
  const kw = toKw(reading.value, reading.unit);
  return `${(kw * 1000).toFixed(0)} W`;
}

function formatLogTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return iso;
  }
}

const AUTH_FAIL_CODES = new Set([0x0010, 16]); // ERR_PASSWORD_VERIF_FAIL

async function applyAuthResponse(data: ApiResponse, label: string): Promise<void> {
  if (data.err !== 0) {
    console.log(`[Knox] Auth rejected (err=${data.err}): ${data.desc}`);
    throw new KnoxError(data.desc || "Authentication failed", data.err);
  }

  const expire = (data.dat as { expire?: number })?.expire ?? 3600;
  const dat = data.dat as { token?: string; secret?: string };

  if (!dat?.token || !dat?.secret) {
    throw new KnoxError("Authentication response missing token or secret");
  }

  session = {
    token: dat.token,
    secret: dat.secret,
    expiresAt: Date.now() + expire * 1000 - 60_000,
  };

  console.log(`[Knox] Authenticated (${label}), token expires in ${expire}s`);
}

/**
 * Knox KNOXHYBRID Android app signing — this is what worked before the redesign.
 * Sign hash includes encodeURIComponent(usr) AND appSuffix().
 */
async function authenticateKnoxAndroid(username: string, password: string): Promise<void> {
  const usr = username.trim();
  const pwdHash = sha1Hex(password);
  const action =
    `&action=auth&usr=${encodeURIComponent(usr)}` +
    `&company-key=${encodeURIComponent(COMPANY_KEY)}${appSuffix()}`;

  const salt = nowMillis();
  const sign = sha1Hex(`${salt}${pwdHash}${action}`);
  const url = `${API_BASE}?sign=${sign}&salt=${salt}${action}`;

  const { data } = await http.get<ApiResponse>(url, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });

  await applyAuthResponse(data, "Knox Android sign");
}

/** Alternate ShineMonitor doc signing — fallback only. */
async function authenticateApiDoc(username: string, password: string): Promise<void> {
  const usr = username.trim();
  const pwdHash = sha1Hex(password);
  const actionForSign = `&action=auth&usr=${usr}&company-key=${COMPANY_KEY}`;
  const actionForUrl =
    `&action=auth&usr=${encodeURIComponent(usr)}` +
    `&company-key=${encodeURIComponent(COMPANY_KEY)}${appSuffix()}`;

  const salt = nowMillis();
  const sign = sha1Hex(`${salt}${pwdHash}${actionForSign}`);
  const url = `${API_BASE}?sign=${sign}&salt=${salt}${actionForUrl}`;

  const { data } = await http.get<ApiResponse>(url, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });

  await applyAuthResponse(data, "API doc sign");
}

async function authenticate(username: string, password: string): Promise<void> {
  const usr = username.trim();
  console.log(`[Knox] Auth attempt for user: ${usr}`);

  try {
    await authenticateKnoxAndroid(username, password);
  } catch (error) {
    if (
      error instanceof KnoxError &&
      error.code !== undefined &&
      AUTH_FAIL_CODES.has(error.code)
    ) {
      console.log("[Knox] Knox Android sign rejected — trying alternate sign…");
      await authenticateApiDoc(username, password);
      return;
    }
    throw error;
  }
}

/**
 * Login with the Knox app account. The datalogger PN is NOT a login username
 * when the user has entered a separate Knox app account.
 */
async function authenticateWithFallback(
  pn: string,
  password: string,
  preferredUsername?: string,
): Promise<string> {
  const pnTrim = pn.trim();
  const explicit = preferredUsername?.trim();

  // Only use PN as login when no separate username was given
  const loginUser =
    explicit && explicit.toLowerCase() !== pnTrim.toLowerCase() ? explicit : pnTrim;

  await authenticate(loginUser, password);
  console.log(`[Knox] Logged in as: ${loginUser}`);
  return loginUser;
}

async function apiCall<T = unknown>(
  actionParams: string,
  retried = false,
): Promise<T> {
  await ensureSession();

  if (!session) {
    throw new KnoxError("Not authenticated");
  }

  const salt = nowMillis();
  const fullAction = `${actionParams}${appSuffix()}`;
  const sign = sha1Hex(`${salt}${session.secret}${session.token}${fullAction}`);
  const url =
    `${API_BASE}?sign=${sign}&salt=${salt}` +
    `&token=${encodeURIComponent(session.token)}${fullAction}`;

  try {
    const { data } = await http.get<ApiResponse<T>>(url, {
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });

    if (data.err !== 0) {
      throw new KnoxError(data.desc || "API request failed", data.err);
    }

    return data.dat as T;
  } catch (error) {
    if (!retried && isTokenError(error)) {
      console.log("[Knox] Token expired — refreshing and retrying…");
      session = null;
      await ensureSession();
      return apiCall<T>(actionParams, true);
    }
    throw error;
  }
}

async function ensureSession(): Promise<void> {
  if (session && Date.now() < session.expiresAt) {
    return;
  }

  if (!connection) {
    throw new KnoxError("Not connected");
  }

  const username = connection.username ?? connection.pn;
  const password = connection.password ?? connection.pn;

  await authenticate(username, password);
}

async function resolveDevice(pn: string): Promise<DeviceInfo> {
  const dat = await apiCall<{ dev?: Array<Record<string, unknown>> }>(
    `&action=queryCollectorDevices&pn=${encodeURIComponent(pn)}`,
  );

  const devices = dat?.dev;
  if (!devices?.length) {
    throw new KnoxError("No devices found for this datalogger ID");
  }

  const first = devices[0];
  return {
    pn,
    sn: String(first.sn ?? ""),
    devcode: String(first.devcode ?? ""),
    devaddr: String(first.devaddr ?? ""),
  };
}

function deviceParams(dev: DeviceInfo): string {
  return (
    `&pn=${encodeURIComponent(dev.pn)}` +
    `&devcode=${encodeURIComponent(dev.devcode)}` +
    `&sn=${encodeURIComponent(dev.sn)}` +
    `&devaddr=${encodeURIComponent(dev.devaddr)}`
  );
}

function readFlowField(
  entries: FlowEntry[] | undefined,
  keys: string[],
): FieldReading {
  if (!entries?.length) return { value: "—", unit: "" };

  for (const key of keys) {
    const keyLower = key.toLowerCase();
    const match = entries.find((e) => {
      const par = e.par?.toLowerCase() ?? "";
      return par === keyLower || par.includes(keyLower);
    });
    if (match?.val !== undefined && match.val !== null && match.val !== "" && match.val !== "-") {
      return { value: String(match.val), unit: match.unit ?? "" };
    }
  }

  return { value: "—", unit: "" };
}

function readFlowPower(entries: FlowEntry[] | undefined, keys: string[]): FieldReading {
  const field = readFlowField(entries, keys);
  if (field.value !== "—") return { ...field, unit: field.unit || "kW" };

  const first = entries?.find((e) => e.val !== undefined && e.val !== "-" && e.val !== "");
  if (first) {
    return { value: String(first.val), unit: first.unit ?? "kW" };
  }

  return { value: "0", unit: "kW" };
}

function findLastDataField(
  entries: LastDataEntry[] | undefined,
  keys: string[],
): FieldReading {
  if (!entries?.length) return { value: "—", unit: "" };

  for (const key of keys) {
    const keyLower = key.toLowerCase();
    const match = entries.find((e) => {
      const title = e.title?.toLowerCase() ?? "";
      return title === keyLower || title.includes(keyLower);
    });
    if (match?.val !== undefined && match.val !== null && match.val !== "" && match.val !== "-") {
      return { value: String(match.val), unit: match.unit ?? "" };
    }
  }

  return { value: "—", unit: "" };
}

function pickField(
  flow: FlowEntry[] | undefined,
  lastData: LastDataEntry[] | undefined,
  flowKeys: string[],
  lastKeys: string[],
): FieldReading {
  const fromFlow = readFlowField(flow, flowKeys);
  if (fromFlow.value !== "—") return fromFlow;
  return findLastDataField(lastData, lastKeys);
}

function isNonZero(reading: FieldReading): boolean {
  if (reading.value === "—") return false;
  const num = parseFloat(reading.value);
  return !Number.isNaN(num) && num !== 0;
}

async function fetchStatusCode(dev: DeviceInfo): Promise<number | null> {
  try {
    const statusDat = await apiCall<{ device?: Array<{ status?: number }> }>(
      `&action=queryDeviceStatus&device=${encodeURIComponent(
        `${dev.pn},${dev.devcode},${dev.devaddr},${dev.sn}`,
      )}`,
    );
    const code = statusDat?.device?.[0]?.status;
    return code !== undefined ? code : null;
  } catch {
    return null;
  }
}

export class KnoxError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "KnoxError";
    this.code = code;
  }
}

export function isConnected(): boolean {
  return connection !== null && device !== null;
}

export function getConnectionInfo(): ConnectionConfig | null {
  return connection ? { ...connection, password: undefined } : null;
}

export function getDeviceInfo(): { pn: string; sn: string } | null {
  if (!device) return null;
  return { pn: device.pn, sn: device.sn };
}

export async function connect(config: ConnectionConfig): Promise<{
  authRequired: boolean;
  message?: string;
}> {
  const pn = config.pn.trim();
  if (!pn) {
    throw new KnoxError("Datalogger ID is required");
  }

  const password = config.password;
  const hasCredentials = Boolean(password && password.length > 0);

  if (hasCredentials) {
    session = null;
    device = null;

    const explicitUser = config.username?.trim();
    const loginDiffersFromPn =
      explicitUser && explicitUser.toLowerCase() !== pn.toLowerCase();

    try {
      const resolvedUsername = await authenticateWithFallback(
        pn,
        password!,
        explicitUser,
      );

      connection = {
        pn,
        username: resolvedUsername,
        password: password!,
      };

      device = await resolveDevice(pn);
      return { authRequired: false, message: "Connected with credentials" };
    } catch (error) {
      connection = null;
      session = null;
      device = null;

      if (error instanceof KnoxError) {
        const code = error.code;
        if (code !== undefined && AUTH_FAIL_CODES.has(code)) {
          throw new KnoxError(
            loginDiffersFromPn
              ? "Wrong password for your Knox app username"
              : "Wrong password",
            code,
          );
        }
        if (code === 0x0105 || code === 261) {
          throw new KnoxError(
            "Knox account not found — use your Knox app login username (not the datalogger ID)",
            code,
          );
        }
      }
      throw error;
    }
  }

  connection = { pn, username: pn, password: pn };
  session = null;
  device = null;

  try {
    await authenticate(pn, pn);
    device = await resolveDevice(pn);
    return { authRequired: false, message: "Connected with datalogger ID" };
  } catch (error) {
    connection = null;
    session = null;
    device = null;

    if (error instanceof KnoxError) {
      const authErrors = new Set([0x0010, 0x0105, 16, 261]);
      if (error.code !== undefined && authErrors.has(error.code)) {
        return {
          authRequired: true,
          message: "Username and password required for this datalogger",
        };
      }
    }

    throw error;
  }
}

export function disconnect(): void {
  connection = null;
  session = null;
  device = null;
}

/** Fetch live inverter metrics — always hits Knox cloud, never cached. */
export async function getLiveData(): Promise<LiveData> {
  if (!connection || !device) {
    throw new KnoxError("Not connected — please connect first");
  }

  const fetchedAt = new Date().toISOString();
  console.log("\nFetching live data…");

  const dev = device;
  const dp = deviceParams(dev);

  const [flowDat, lastData, statusCode] = await Promise.all([
    apiCall<{
      pv_status?: FlowEntry[];
      bc_status?: FlowEntry[];
      gd_status?: FlowEntry[];
      date?: string;
    }>(`&action=webQueryDeviceEnergyFlowEs${dp}`),
    apiCall<LastDataEntry[]>(`&action=queryDeviceLastData${dp}`).catch(() => [] as LastDataEntry[]),
    fetchStatusCode(dev),
  ]);

  const pvPower = readFlowPower(flowDat?.pv_status, [
    "pv_output_power",
    "PV Output Power",
    "pv_charging_power",
    "pv_power",
  ]);
  const loadPower = readFlowPower(flowDat?.bc_status, [
    "load_active_power",
    "Load Active Power",
    "ac_output_active_power",
    "load_power",
  ]);
  const gridPower = readFlowPower(flowDat?.gd_status, [
    "grid_active_power",
    "Grid Active Power",
    "grid_power",
  ]);

  const pvVoltage = pickField(
    flowDat?.pv_status,
    lastData,
    ["pv_voltage", "pv1_voltage", "PV Voltage"],
    ["PV Voltage", "PV1 Voltage", "PV Input Voltage"],
  );
  const pvCurrent = pickField(
    flowDat?.pv_status,
    lastData,
    ["pv_current", "pv1_current", "PV Current"],
    ["PV Current", "PV1 Current", "PV Input Current"],
  );

  const outputVoltage = pickField(
    flowDat?.bc_status,
    lastData,
    ["output_voltage", "ac_output_voltage", "Output Voltage"],
    ["Output Voltage", "AC Output Voltage", "AC Voltage"],
  );
  const outputCurrent = pickField(
    flowDat?.bc_status,
    lastData,
    ["output_current", "ac_output_current", "Output Current"],
    ["Output Current", "AC Output Current", "AC Current"],
  );
  const outputFrequency = pickField(
    flowDat?.bc_status,
    lastData,
    ["output_frequency", "ac_output_frequency", "Output Frequency"],
    ["Output Frequency", "AC Output Frequency", "Frequency"],
  );

  const gridVoltage = pickField(
    flowDat?.gd_status,
    lastData,
    ["grid_voltage", "Grid Voltage"],
    ["Grid Voltage", "Grid Volt"],
  );
  const gridFrequency = pickField(
    flowDat?.gd_status,
    lastData,
    ["grid_frequency", "Grid Frequency"],
    ["Grid Frequency"],
  );

  const todayEnergy = findLastDataField(lastData, [
    "Today Energy",
    "Today's Energy",
    "Today Generation",
    "Daily Energy",
    "E-Day",
    "Day Energy",
    "Today Yield",
  ]);

  const temperature = findLastDataField(lastData, [
    "Temperature",
    "Inverter Temperature",
    "Radiator Temperature",
    "Internal Temperature",
  ]);

  const faultCode = findLastDataField(lastData, ["Fault Code", "Fault", "Error Code"]);
  const warningCode = findLastDataField(lastData, ["Warning Code", "Warning", "Alarm Code"]);

  const pvKw = toKw(pvPower.value, pvPower.unit);
  const isGenerating = pvKw > 0.01 && statusCode !== 1;

  const lastUpdated = flowDat?.date ?? fetchedAt;

  console.log("API Response received");
  console.log(`PV: ${formatLogPower(pvPower)}`);
  console.log(`Load: ${formatLogPower(loadPower)}`);
  console.log(`Grid: ${formatLogPower(gridPower)}`);
  console.log(`Updated: ${formatLogTime(lastUpdated)}`);

  return {
    pvPower,
    loadPower,
    gridPower,
    pvVoltage,
    pvCurrent,
    outputVoltage,
    outputCurrent,
    outputFrequency,
    gridVoltage,
    gridFrequency,
    gridConnected: statusCode !== 1,
    todayEnergy,
    temperature,
    faultCode,
    warningCode,
    statusCode,
    statusText: statusCode !== null ? String(statusCode) : "unknown",
    isGenerating,
    lastUpdated,
    fetchedAt,
  };
}

export { isNonZero };
