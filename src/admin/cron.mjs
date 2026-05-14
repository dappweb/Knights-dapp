import worker from "../../cloudflare/worker.js";
import { createRuntimeEnv } from "./env.mjs";

const env = createRuntimeEnv();
const pending = [];
const ctx = {
  waitUntil(promise) {
    pending.push(Promise.resolve(promise));
  },
};

try {
  await worker.scheduled({ cron: process.env.KNIGHTS_ADMIN_CRON || "linux" }, env, ctx);
  await Promise.all(pending);
  console.log(JSON.stringify({ ok: true, ranAt: new Date().toISOString() }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    ranAt: new Date().toISOString(),
    error: error.shortMessage || error.message || "Scheduled keeper failed",
  }));
  process.exitCode = 1;
} finally {
  env.KNT_ADMIN_STATE?.close?.();
}
