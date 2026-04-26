#!/usr/bin/env node

import dotenv from 'dotenv';

const env = process.env.DEPLOY_ENV || 'production';

dotenv.config();
dotenv.config({ path: `.env.${env}` });

const requiredByEnv = {
  production: [
    ['VITE_PROTOCOL_ADDRESS'],
    ['VITE_SEER_TOKEN_ADDRESS'],
    ['VITE_USDT_ADDRESS'],
    ['VITE_RPC_URL', 'RPC_URL', 'VITE_CNC_MAINNET_RPC_URL', 'CNC_MAINNET_RPC_URL'],
  ],
  staging: [
    ['VITE_PROTOCOL_ADDRESS'],
    ['VITE_SEER_TOKEN_ADDRESS'],
    ['VITE_USDT_ADDRESS'],
    ['VITE_RPC_URL', 'RPC_URL', 'VITE_CNC_MAINNET_RPC_URL', 'CNC_MAINNET_RPC_URL'],
  ],
};

if (!requiredByEnv[env]) {
  console.error(`Unsupported DEPLOY_ENV: ${env}`);
  process.exit(1);
}

const missing = requiredByEnv[env]
  .filter((group) => !group.some((key) => {
    const value = process.env[key];
    return value && value.trim();
  }))
  .map((group) => group[0]);

if (missing.length > 0) {
  console.error(`❌ Missing required environment variables for ${env}:`);
  for (const key of missing) {
    console.error(` - ${key}`);
  }
  process.exit(1);
}

console.log(`✅ ${env} configuration validated.`);
