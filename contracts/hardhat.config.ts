import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const pk = process.env.PRIVATE_KEY;
const config: HardhatUserConfig = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    avalancheFuji: {
      url: process.env.FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: pk ? [pk.startsWith("0x") ? pk : "0x" + pk] : [],
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      chainId: 84532,
      accounts: pk ? [pk.startsWith("0x") ? pk : "0x" + pk] : [],
    },
  },
};
export default config;
