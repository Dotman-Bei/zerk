import { deployments } from "./generated/deployments";

export const SEPOLIA_CHAIN_ID = 11155111;

export const SEAPORT_1_6 = "0x0000000000000068F116a894984e2DB1123eB395" as const;
export const NOX_COMPUTE_SEPOLIA = "0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF" as const;

export const BASE_DECIMALS = 18;
export const QUOTE_DECIMALS = 6;
export const BASE_SYMBOL = "tT-BILL";
export const QUOTE_SYMBOL = "USDC";

type Record11155111 = {
  rwa?: `0x${string}`;
  usdc?: `0x${string}`;
  book?: `0x${string}`;
  zone?: `0x${string}`;
  seaport?: `0x${string}`;
  noxCompute?: `0x${string}`;
};

const record = (deployments as Record<string, Record11155111>)[String(SEPOLIA_CHAIN_ID)] ?? {};

function envAddress(key: string): `0x${string}` | undefined {
  const value = process.env[key];
  return value && value.startsWith("0x") ? (value as `0x${string}`) : undefined;
}

/**
 * Addresses come from `deployments/11155111.json` via `npm run sync-abi`, with NEXT_PUBLIC_*
 * overrides so a Vercel deploy can point at a fresh deployment without a rebuild of the repo.
 */
export const addresses = {
  book: envAddress("NEXT_PUBLIC_ZERK_BOOK") ?? record.book,
  zone: envAddress("NEXT_PUBLIC_ZERK_ZONE") ?? record.zone,
  rwa: envAddress("NEXT_PUBLIC_ZERK_RWA") ?? record.rwa,
  usdc: envAddress("NEXT_PUBLIC_USDC") ?? record.usdc,
  seaport: record.seaport ?? SEAPORT_1_6,
  noxCompute: record.noxCompute ?? NOX_COMPUTE_SEPOLIA,
} as const;

export const isDeployed = Boolean(addresses.book);

export const RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const EXPLORER = "https://sepolia.etherscan.io";

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

/**
 * Optional labels so the desk view can say "Desk A" instead of an address. Purely cosmetic —
 * the contract knows nothing about desk names.
 */
export const deskLabels: Record<string, string> = Object.fromEntries(
  [
    [process.env.NEXT_PUBLIC_DESK_A, "Desk A"],
    [process.env.NEXT_PUBLIC_DESK_B, "Desk B"],
    [process.env.NEXT_PUBLIC_AUDITOR, "Auditor"],
  ]
    .filter(([address]) => typeof address === "string" && address.startsWith("0x"))
    .map(([address, label]) => [(address as string).toLowerCase(), label as string])
);

export const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Dotman-Bei/zerk";
