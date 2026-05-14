import path from "node:path";
import dotenv from "dotenv";
import { createSqliteKvStore } from "./state-store.mjs";

let dotenvLoaded = false;

function loadDotenv() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  dotenv.config({ path: process.env.KNIGHTS_ADMIN_ENV_FILE || ".env", quiet: true });
}

function defaultStateDbPath() {
  return path.resolve(process.env.KNIGHTS_ADMIN_STATE_DB || ".codex_runtime/admin-state.sqlite");
}

function normalizeRpcEnv(env) {
  if (env.BSC_RPC_URL) return env;
  if (env.NETWORK_NAME === "bscMainnet" && env.BSC_MAINNET_RPC_URL) {
    env.BSC_RPC_URL = env.BSC_MAINNET_RPC_URL;
  } else if ((env.NETWORK_NAME === "bscTestnet" || !env.NETWORK_NAME) && env.BSC_TESTNET_RPC_URL) {
    env.BSC_RPC_URL = env.BSC_TESTNET_RPC_URL;
  }
  return env;
}

export function createRuntimeEnv() {
  loadDotenv();
  const env = normalizeRpcEnv({ ...process.env });
  env.KNT_ADMIN_STATE = createSqliteKvStore(defaultStateDbPath());
  return env;
}
