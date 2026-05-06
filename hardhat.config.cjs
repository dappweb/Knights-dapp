require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const normalizedPrivateKey = process.env.PRIVATE_KEY
  ? (process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`)
  : "";

const bscTestnetRpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  process.env.VITE_BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

const bscMainnetRpcUrl =
  process.env.BSC_MAINNET_RPC_URL ||
  process.env.VITE_BSC_MAINNET_RPC_URL ||
  "https://bsc-dataseed.bnbchain.org";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 1,
      },
      metadata: {
        bytecodeHash: "none",
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    bscTestnet: {
      url: bscTestnetRpcUrl,
      chainId: 97,
      accounts: normalizedPrivateKey ? [normalizedPrivateKey] : [],
      timeout: 120000,
    },
    bscMainnet: {
      url: bscMainnetRpcUrl,
      chainId: 56,
      accounts: normalizedPrivateKey ? [normalizedPrivateKey] : [],
      timeout: 120000,
    },
  },
};
