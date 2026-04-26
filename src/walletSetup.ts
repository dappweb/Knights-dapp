import { BLOCK_EXPLORER_URL, CHAIN_ID, CHAIN_NAME, CHAIN_NATIVE_CURRENCY, CHAIN_RPC_URL } from "./constants";

type RequestArguments = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export interface WalletRequestClient {
  request(args: RequestArguments): Promise<unknown>;
  chain?: {
    id?: number;
  } | null;
}

export interface WalletAssetConfig {
  address: string;
  symbol: string;
  decimals: number;
  image?: string;
}

const TARGET_CHAIN_ID = CHAIN_ID;
const TARGET_CHAIN_HEX = `0x${TARGET_CHAIN_ID.toString(16)}`;
const FALLBACK_RPC_URL = CHAIN_RPC_URL;

const buildTokenStorageKey = (token: WalletAssetConfig) =>
  `knights:wallet-asset-prompted:${TARGET_CHAIN_ID}:${token.address.toLowerCase()}:${token.decimals}`;

const getProviderErrorCode = (error: unknown): number | string | undefined => {
  if (!error || typeof error !== "object") return undefined;

  const providerError = error as {
    code?: number | string;
    data?: { originalError?: { code?: number | string } };
    cause?: { code?: number | string };
  };

  return providerError.code ?? providerError.data?.originalError?.code ?? providerError.cause?.code;
};

export const isUserRejectedRequest = (error: unknown): boolean => {
  const code = getProviderErrorCode(error);
  if (code === 4001 || code === "ACTION_REJECTED") return true;

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /reject|denied|declined|cancelled/i.test(message);
};

export const getBrowserWalletClient = (): WalletRequestClient | null => {
  if (typeof window === "undefined") return null;

  const provider = (window as Window & {
    ethereum?: WalletRequestClient;
  }).ethereum;

  return provider ?? null;
};

export const ensureTargetWalletChain = async (walletClient: WalletRequestClient): Promise<"already-on-target" | "switched" | "added"> => {
  const rawChainId = await walletClient.request({ method: "eth_chainId" });
  const currentChainId = typeof rawChainId === "string" ? Number.parseInt(rawChainId, 16) : walletClient.chain?.id;

  if (currentChainId === TARGET_CHAIN_ID) {
    return "already-on-target";
  }

  try {
    await walletClient.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: TARGET_CHAIN_HEX }],
    });
    return "switched";
  } catch (error) {
    const code = getProviderErrorCode(error);
    if (code !== 4902) {
      throw error;
    }
  }

  await walletClient.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: TARGET_CHAIN_HEX,
        chainName: CHAIN_NAME,
        nativeCurrency: CHAIN_NATIVE_CURRENCY,
        rpcUrls: [FALLBACK_RPC_URL],
        blockExplorerUrls: [BLOCK_EXPLORER_URL],
      },
    ],
  });

  return "added";
};


export const suggestWalletAssets = async (
  walletClient: WalletRequestClient,
  tokens: WalletAssetConfig[],
): Promise<string[]> => {
  const addedSymbols: string[] = [];

  for (const token of tokens) {
    const storageKey = buildTokenStorageKey(token);
    if (typeof window !== "undefined" && localStorage.getItem(storageKey)) {
      continue;
    }

    try {
      const added = await walletClient.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: token.address,
            symbol: token.symbol,
            decimals: token.decimals,
            image: token.image,
          },
        },
      });

      if (added) {
        addedSymbols.push(token.symbol);
      }
    } finally {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, "1");
      }
    }
  }

  return addedSymbols;
};