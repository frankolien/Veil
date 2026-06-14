import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "solidity-coverage";

import "./tasks/accounts";
import "./tasks/FHECounter";
import "./tasks/Veil";
import "./tasks/VeilV2";
import "./tasks/Vault";
import "./tasks/Keeper";

// Run 'npx hardhat vars setup' to see the list of variables that need to be set.
//
// Deployment signing: prefer PRIVATE_KEY (single-account, lower blast radius).
// MNEMONIC still works if you want to use a whole HD wallet.
//   npx hardhat vars set PRIVATE_KEY     # paste a 0x… key when prompted
//   npx hardhat vars set MNEMONIC        # OR a 12/24-word seed
//
// Sepolia RPC: an Infura key works, but a public RPC is fine for prototype work.
//   npx hardhat vars set INFURA_API_KEY  # optional
//   npx hardhat vars set SEPOLIA_RPC_URL # OR a custom URL (overrides everything)

const PRIVATE_KEY: string = vars.get("PRIVATE_KEY", "");
const MNEMONIC: string = vars.get("MNEMONIC", "test test test test test test test test test test test junk");
const INFURA_API_KEY: string = vars.get("INFURA_API_KEY", "");
const SEPOLIA_RPC_URL_OVERRIDE: string = vars.get("SEPOLIA_RPC_URL", "");

const sepoliaUrl =
  SEPOLIA_RPC_URL_OVERRIDE !== ""
    ? SEPOLIA_RPC_URL_OVERRIDE
    : INFURA_API_KEY !== ""
      ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
      : "https://ethereum-sepolia-rpc.publicnode.com";

const sepoliaAccounts =
  PRIVATE_KEY !== "" && PRIVATE_KEY.length >= 64
    ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
    : { mnemonic: MNEMONIC, path: "m/44'/60'/0'/0/", count: 10 };

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: vars.get("ETHERSCAN_API_KEY", ""),
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    anvil: {
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
      },
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: sepoliaAccounts,
      chainId: 11155111,
      url: sepoliaUrl,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      // Required by VeilBatchAuction.submitClearing: the per-order pro-rata
      // computation builds up enough locals (ebool classifications + euint64
      // partial fills) to hit the EVM's 16-slot stack limit. viaIR routes
      // through Yul and handles deeper stacks.
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
