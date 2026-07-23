import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable } from "hardhat/config";
import "dotenv/config";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

/** Accounts are read from .env; an empty list still lets `compile` and local tests run. */
const accounts = [process.env.DEPLOYER_PRIVATE_KEY, process.env.DESK_A_PRIVATE_KEY, process.env.DESK_B_PRIVATE_KEY]
  .filter((k): k is string => typeof k === "string" && k.length > 0)
  .map((k) => (k.startsWith("0x") ? k : `0x${k}`));

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    // Nox's Solidity SDK pins ^0.8.35.
    version: "0.8.35",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
      accounts,
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
};

export default config;
