import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (existsSync(".env")) {
  try {
    const envConfig = readFileSync(".env", "utf-8");
    for (const line of envConfig.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || "").trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch {
    // Ignore .env read errors
  }
}
import server from "../dist/server/server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(__dirname, "../dist/client");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const MIME = {
  ".js":    "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".html":  "text/html; charset=utf-8",
  ".json":  "application/json",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".map":   "application/json",
};

import { gzipSync } from "node:zlib";

async function tryServeStatic(pathname, req, res) {
  try {
    const filePath = join(CLIENT_DIR, pathname);
    const content = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    const acceptEncoding = req.headers["accept-encoding"] ?? "";
    if (acceptEncoding.includes("gzip") && content.length > 512) {
      const compressed = gzipSync(content);
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", compressed.length);
      res.end(compressed);
    } else {
      res.setHeader("Content-Length", content.length);
      res.end(content);
    }
    return true;
  } catch {
    return false;
  }
}

const app = http.createServer(async (req, res) => {
  const start = Date.now();
  const { pathname } = new URL(req.url, "http://localhost");
  const isApi = pathname.startsWith("/api/");

  // CORS Preflight & Headers for Vercel -> Render cross-origin communication
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    "https://truetips.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
  ].filter(Boolean);

  const requestOrigin = req.headers.origin;
  const isAllowed = !requestOrigin || allowedOrigins.includes(requestOrigin) || (requestOrigin && requestOrigin.endsWith(".vercel.app"));
  const originToSet = requestOrigin && isAllowed ? requestOrigin : (process.env.FRONTEND_URL || "https://truetips.vercel.app");

  res.setHeader("Access-Control-Allow-Origin", originToSet);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const ip =
    req.headers["cf-connecting-ip"] ??
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
    req.headers["x-real-ip"] ??
    req.socket?.remoteAddress ??
    "-";

  if (req.method !== "GET" || isApi) {
    const timestamp = new Date().toISOString();
    const hostHeader = req.headers.host ?? "-";
    const contentType = req.headers["content-type"] ?? "-";
    const contentLength = req.headers["content-length"] ?? "-";
    const userAgent = req.headers["user-agent"] ?? "-";
    const remoteAddr = req.socket?.remoteAddress ?? "-";
    const fwdIp = req.headers["x-forwarded-for"] ?? "-";

    if (pathname === "/api/payments/c2b/confirmation" && req.method === "POST") {
      console.log(
        `[C2B_RENDER_INGRESS] [${timestamp}] received | POST /api/payments/c2b/confirmation | Host:${hostHeader} | ClientIP:${ip} | ContentType:${contentType}`,
      );
    }

    console.log(
      `[HTTP_INGRESS_CAPTURE] [${timestamp}] ${req.method} ${pathname} | Host:${hostHeader} | RemoteIP:${remoteAddr} | FwdIP:${fwdIp} | ClientIP:${ip} | ContentType:${contentType} | ContentLength:${contentLength} | UA:${userAgent}`,
    );
  }

  try {
    // Serve static files from dist/client/ first
    const servedStatic = await tryServeStatic(pathname, req, res);
    if (servedStatic) return;

    // /assets/* not found → hard 404, don't fall through to SSR
    if (pathname.startsWith("/assets/")) {
      console.warn("[static] 404:", pathname);
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    // Everything else → TanStack Start SSR
    const protocol = req.headers["x-forwarded-proto"] ?? "http";
    const requestHost = req.headers.host ?? `${host}:${port}`;
    const url = `${protocol}://${requestHost}${req.url}`;

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value != null) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const response = await server.fetch(
      new Request(url, {
        method: req.method,
        headers,
        body: body?.length ? body : undefined,
      }),
    );

    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    const responseBuf = Buffer.from(await response.arrayBuffer());
    const acceptEncoding = req.headers["accept-encoding"] ?? "";
    const contentType = response.headers.get("content-type") ?? "";
    const compressible = contentType.includes("text") || contentType.includes("json") || contentType.includes("javascript");

    if (acceptEncoding.includes("gzip") && compressible && responseBuf.length > 512) {
      const compressed = gzipSync(responseBuf);
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", compressed.length);
      res.end(compressed);
    } else {
      res.end(responseBuf);
    }

    if (req.method !== "GET" || isApi) {
      console.log(
        `[res] ${req.method} ${pathname} → ${response.status} (${Date.now() - start}ms) | ip=${ip}`,
      );
    }
  } catch (error) {
    console.error("[render-server]", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

app.listen(port, host, () => {
  console.log(`TrueTips listening on http://${host}:${port}`);
  console.log(`Serving static files from: ${CLIENT_DIR}`);

  const required = [
    "DATABASE_URL", "JWT_SECRET", "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET",
    "MPESA_PASSKEY", "MPESA_CALLBACK_URL", "MPESA_ENVIRONMENT",
    "SMS_PROVIDER", "ONFON_API_KEY", "ONFON_CLIENT_ID", "ONFON_SENDER_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("[env] MISSING env vars:", missing.join(", "));
  } else {
    console.log("[env] All required env vars present");
  }

  // Start 2-minute background C2B polling fallback
  const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
  console.log(`[C2B_POLL_SERVICE] Scheduled background polling every ${POLL_INTERVAL_MS / 1000}s`);

  setInterval(async () => {
    try {
      const pollUrl = `http://127.0.0.1:${port}/api/admin/mpesa/poll`;
      const res = await fetch(pollUrl, { method: "POST" });
      if (res.ok) {
        console.log("[C2B_POLL_SERVICE] Background poll completed successfully.");
      } else {
        console.warn(`[C2B_POLL_SERVICE] Poll endpoint returned status ${res.status}`);
      }
    } catch (pollErr) {
      console.error("[C2B_POLL_SERVICE] Background poll trigger error:", pollErr);
    }
  }, POLL_INTERVAL_MS);
});
