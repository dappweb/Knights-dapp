/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USDT_ADDRESS: string;
  readonly VITE_SEER_TOKEN_ADDRESS: string;
  readonly VITE_PROTOCOL_ADDRESS: string;
  readonly VITE_MINER_NODE_ADDRESS: string;
  readonly VITE_AIRDROP_ADDRESS: string;
  readonly VITE_ROOT_REFERRER_ADDRESS: string;
  readonly VITE_SUPER_ADMIN_ADDRESSES: string;
  readonly VITE_OPERATOR_ADMIN_ADDRESSES: string;
  readonly VITE_DEX_ROUTER_ADDRESS: string;
  readonly VITE_DEX_PAIR_ADDRESS: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_CHAIN_NAME: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_BLOCK_EXPLORER_URL: string;
  readonly VITE_NATIVE_CURRENCY_NAME: string;
  readonly VITE_NATIVE_CURRENCY_SYMBOL: string;
  readonly VITE_CNC_MAINNET_RPC_URL: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
