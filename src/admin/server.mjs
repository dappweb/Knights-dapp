import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../../cloudflare/worker.js";
import { createRuntimeEnv } from "./env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const env = createRuntimeEnv();
const port = Number(process.env.ADMIN_PORT || process.env.PORT || 3000);
const host = process.env.ADMIN_HOST || "127.0.0.1";
const staticRoot = path.resolve(process.env.KNIGHTS_ADMIN_STATIC_DIR || path.join(projectRoot, "admin"));

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function requestOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
  const hostHeader = req.headers.host || `${host}:${port}`;
  return `${proto}://${hostHeader}`;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function handleWorkerRequest(req, res) {
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readRequestBody(req);
  const request = new Request(new URL(req.url || "/", requestOrigin(req)), {
    method: req.method,
    headers: req.headers,
    body,
  });
  const response = await worker.fetch(request, env);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const responseBody = Buffer.from(await response.arrayBuffer());
  res.end(responseBody);
}

function safeStaticPath(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.resolve(staticRoot, normalizedPath.replace(/^[/\\]/, ""));
  if (!fullPath.startsWith(staticRoot)) return path.join(staticRoot, "index.html");
  return fullPath;
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", requestOrigin(req));
  let filePath = safeStaticPath(url.pathname);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch (_error) {
    filePath = path.join(staticRoot, "index.html");
  }

  try {
    const content = await fs.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", MIME_TYPES[path.extname(filePath)] || "application/octet-stream");
    res.setHeader("cache-control", path.basename(filePath) === "index.html" ? "no-store" : "public, max-age=3600");
    res.end(content);
  } catch (error) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(`Not found: ${error.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", requestOrigin(req));
    if (url.pathname.startsWith("/api/")) {
      await handleWorkerRequest(req, res);
    } else {
      await serveStatic(req, res);
    }
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: error.shortMessage || error.message || "Admin server error" }));
  }
});

server.listen(port, host, () => {
  console.log(`Knights admin listening on http://${host}:${port}`);
  console.log(`Static admin root: ${staticRoot}`);
});

function shutdown() {
  server.close(() => {
    env.KNT_ADMIN_STATE?.close?.();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
