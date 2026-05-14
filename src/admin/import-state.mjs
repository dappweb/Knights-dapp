import fs from "node:fs/promises";
import { createRuntimeEnv } from "./env.mjs";

function normalize(address) {
  return String(address || "").toLowerCase();
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node src/admin/import-state.mjs <admin-state.json>");
  process.exit(1);
}

const env = createRuntimeEnv();

try {
  const rawState = await fs.readFile(inputPath, "utf8");
  const state = JSON.parse(rawState.replace(/^\uFEFF/, ""));
  const contract = state.contract || env.KNT_CONTRACT_ADDRESS;
  if (!contract) throw new Error("State JSON must include contract, or KNT_CONTRACT_ADDRESS must be set");

  const key = `admin-state:${normalize(contract)}`;
  await env.KNT_ADMIN_STATE.put(key, JSON.stringify(state));
  console.log(JSON.stringify({ ok: true, key, inputPath }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message || "Import failed" }));
  process.exitCode = 1;
} finally {
  env.KNT_ADMIN_STATE?.close?.();
}
