import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { defineChain, http } from 'viem';
import { BLOCK_EXPLORER_URL, CHAIN_ID, CHAIN_NAME, CHAIN_NATIVE_CURRENCY, CHAIN_RPC_URL } from './constants';

/**
 * KNIGHTS Protocol — wagmi / RainbowKit 配置
 * 部署链: CNC Mainnet (Chain ID: 50716)
 */
const targetChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: CHAIN_NATIVE_CURRENCY,
  rpcUrls: {
    default: { http: [CHAIN_RPC_URL] },
    public: { http: [CHAIN_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: `${CHAIN_NAME} Explorer`,
      url: BLOCK_EXPLORER_URL,
    },
  },
});

export const config = getDefaultConfig({
  appName: 'KNT',
  projectId: '2f05ae7f1116030fde2d36508f472bfb',
  chains: [targetChain],
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        injectedWallet,
        metaMaskWallet,
        walletConnectWallet,
      ],
    },
  ],
  transports: {
    [targetChain.id]: http(CHAIN_RPC_URL),
  },
});
