import express from "express";
import next from "next";
import path from "path";
import {
  connect,
  disconnect,
  getConnectionInfo,
  getDeviceInfo,
  getLiveData,
  isConnected,
  KnoxError,
} from "./lib/knox";


const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "localhost";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/** Prevent any HTTP caching of live API responses. */
function setNoCacheHeaders(res: express.Response): void {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  });
}

app.prepare().then(() => {
  const server = express();
  server.use(express.json());

  server.post("/api/connect", async (req, res) => {
    setNoCacheHeaders(res);
    try {
      const { pn, username, password } = req.body ?? {};
      const result = await connect({ pn, username, password });
      res.json({ ok: true, ...result });
    } catch (error) {
      const message =
        error instanceof KnoxError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Connection failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  server.get("/api/live", async (req, res) => {
    setNoCacheHeaders(res);
    try {
      if (!isConnected()) {
        res.status(401).json({ ok: false, error: "Not connected", offline: true });
        return;
      }

      console.log(`[/api/live] Request at ${new Date().toISOString()} (t=${req.query._ ?? "none"})`);
      const data = await getLiveData();
      res.json({ ok: true, ...data });
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

      res.status(offline ? 503 : 500).json({ ok: false, error: message, offline });
    }
  });

  server.get("/api/status", (_req, res) => {
    setNoCacheHeaders(res);
    res.json({
      ok: true,
      connected: isConnected(),
      connection: getConnectionInfo(),
      device: getDeviceInfo(),
    });
  });

  server.post("/api/disconnect", (_req, res) => {
    setNoCacheHeaders(res);
    disconnect();
    res.json({ ok: true });
  });

  server.get("/sw.js", (_req, res) => {
    res.set({
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    });
    res.sendFile(path.join(process.cwd(), "public", "sw.js"));
  });

  server.all("/{*path}", (req, res) => handle(req, res));

  server.listen(port, () => {
    console.log(`> Knox PV9000 dashboard ready on http://${hostname}:${port}`);
  });
});
