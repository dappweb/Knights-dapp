// KNIGHTS - Hardhat Configuration
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const normalizedPrivateKey = process.env.PRIVATE_KEY
  ? (process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`)
  : "";

const bscTestnetRpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  process.env.VITE_BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

/** @type import('hardhat/config').HardhatUserConfig */
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
      debug: {
        revertStrings: "strip",
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
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
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },
};
