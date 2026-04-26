#!/usr/bin/env node

import dotenv from 'dotenv';
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const nodeEnv = process.env.NODE_ENV || 'development';
const envFiles = [
  '.env',
  `.env.${nodeEnv}`,
  '.env.local',
  `.env.${nodeEnv}.local`,
  '.env.production'
];

for (const file of envFiles) {
  const fullPath = path.join(cwd, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const requiredGroups = [
  ['VITE_USDT_ADDRESS'],
  ['VITE_SEER_TOKEN_ADDRESS'],
  ['VITE_PROTOCOL_ADDRESS'],
  ['VITE_MINER_NODE_ADDRESS'],
  ['VITE_AIRDROP_ADDRESS'],
  ['VITE_RPC_URL', 'RPC_URL', 'VITE_CNC_MAINNET_RPC_URL', 'CNC_MAINNET_RPC_URL']
];

const optional = [
  'VITE_API_BASE_URL',
  'VITE_DEX_ROUTER_ADDRESS',
  'VITE_DEX_PAIR_ADDRESS'
];

const missing = requiredGroups.filter((group) => !group.some((key) => process.env[key])).map((group) => group[0]);
const missingOptional = optional.filter((k) => !process.env[k]);

const requiredAddressKeys = [
  'VITE_USDT_ADDRESS',
  'VITE_SEER_TOKEN_ADDRESS',
  'VITE_PROTOCOL_ADDRESS',
  'VITE_MINER_NODE_ADDRESS',
  'VITE_AIRDROP_ADDRESS',
  'VITE_DEX_ROUTER_ADDRESS',
  'VITE_DEX_PAIR_ADDRESS'
];

const invalidAddressKeys = requiredAddressKeys.filter((key) => {
  const value = process.env[key];
  return value && !ethers.isAddress(value);
});

const resolvedRpc =
  process.env.CNC_MAINNET_RPC_URL ||
  process.env.RPC_URL ||
  process.env.VITE_CNC_MAINNET_RPC_URL ||
  process.env.VITE_RPC_URL ||
  '';

if (missing.length === 0 && invalidAddressKeys.length === 0) {
  console.log('[env-check] All required env bindings are present.');
  if (resolvedRpc) {
    console.log(`[env-check] RPC selected: ${resolvedRpc}`);
  }
  if (missingOptional.length > 0) {
    console.warn('[env-check] Optional env bindings missing:', missingOptional.join(', '));
  }
  process.exit(0);
}

// Allow CI or maintainers to skip this check by setting SKIP_ENV_BINDINGS_CHECK
const skip =
  process.env.SKIP_ENV_BINDINGS_CHECK === '1' ||
  process.env.SKIP_ENV_BINDINGS_CHECK === 'true';

if (skip) {
  if (missing.length > 0) {
    console.warn('[env-check] Missing env bindings (skipped):', missing.join(', '));
  }
  if (invalidAddressKeys.length > 0) {
    console.warn('[env-check] Invalid address env bindings (skipped):', invalidAddressKeys.join(', '));
  }
  process.exit(0);
}

console.error('[env-check] Contract address binding check failed:');
for (const k of missing) console.error(' -', k);
for (const k of invalidAddressKeys) console.error(' - Invalid address:', k, '=', process.env[k]);
console.error('\nFix: keep required VITE_* values aligned with deployed addresses and runtime endpoints (.env/.env.production/.env.local).');
process.exit(1);
