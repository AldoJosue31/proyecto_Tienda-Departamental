import { createServer } from "node:http";
import next from "next";
import nextEnv from "@next/env";
import { annotateClientIp, clientIpResolver } from "./web-client-ip.mjs";

const dev = process.argv.includes("--dev");
// Load .env before capturing the IP key, including when launched via npm dev.
nextEnv.loadEnvConfig(process.cwd(), dev);
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const ipKey = process.env.TRUSTED_BFF_IP_KEY || "";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid web port");
if (ipKey && (!/^[A-Za-z0-9_-]+$/.test(ipKey) || Buffer.from(ipKey, "base64url").length < 32)) throw new Error("Invalid BFF signing configuration");
const resolveIp = clientIpResolver(process.env.BFF_TRUSTED_PROXY_CIDRS);
let handle;
const server = createServer((request, response) => {
  try { annotateClientIp(request, ipKey, resolveIp); }
  catch { response.writeHead(400); response.end("Invalid client address"); return; }
  Promise.resolve().then(() => handle(request, response)).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end("Application temporarily unavailable");
  });
});
const app = next({ dev, hostname, port, httpServer: server });
handle = app.getRequestHandler();
await app.prepare();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, hostname, resolve);
});
console.log("Web server ready on port " + port);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close(() => void app.close().finally(() => process.exit(0)));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
