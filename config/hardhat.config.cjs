require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("dotenv").config();
const path = require("path");

const normalizedPrivateKey = process.env.PRIVATE_KEY
  ? (process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`)
  : "";

const bscTestnetRpcUrl =
  process.env.BSC_TESTNET_RPC_URL ||
  process.env.RPC_URL ||
  process.env.VITE_BSC_TESTNET_RPC_URL ||
  process.env.VITE_RPC_URL ||
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
              },
            },
          },
          viaIR: true, // Enable IR-based code generation to avoid "Stack too deep" errors
          debug: {
            revertStrings: "strip",
          },
        },
      },
      {
        version: "0.8.21",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
              },
            },
          },
          viaIR: true,
          debug: {
            revertStrings: "strip",
          },
        },
      },
      {
        version: "0.8.22",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
              },
            },
          },
          viaIR: true,
          debug: {
            revertStrings: "strip",
          },
        },
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yul: true,
              yulDetails: {
                stackAllocation: true,
              },
            },
          },
          viaIR: true,
          debug: {
            revertStrings: "strip",
          },
        },
      },
    ],
  },
  paths: {
    root: path.resolve(__dirname, ".."),
    sources: path.resolve(__dirname, "../contracts"),
    tests: path.resolve(__dirname, "../test"),
    cache: path.resolve(__dirname, "../cache"),
    artifacts: path.resolve(__dirname, "../artifacts")
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    bscTestnet: {
      url: bscTestnetRpcUrl,
      chainId: 97,
      gasPrice: "auto",
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
