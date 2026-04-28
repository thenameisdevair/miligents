import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    og_testnet: {
      url: process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai",
      accounts: process.env.OG_PRIVATE_KEY
        ? [process.env.OG_PRIVATE_KEY]
        : [],
      chainId: 16602
    }
  },
  sourcify: {
    enabled: true
  }
};

export default config;
