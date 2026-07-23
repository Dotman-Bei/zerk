import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..");

/**
 * Seaport is CREATE2-deployed, so Sepolia carries the same addresses as mainnet. We never
 * deploy or fork it — Zerk plugs into the canonical instance through its zone extension point.
 */
export const SEAPORT_1_6 = "0x0000000000000068F116a894984e2DB1123eB395" as const;
export const SEAPORT_1_5 = "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC" as const;
export const CONDUIT_CONTROLLER = "0x00000000F9490004C11Cef243f5400493c00Ad63" as const;

/** conduitKey = 0 means offerers approve Seaport directly. No conduit setup, one less moving part. */
export const ZERO_CONDUIT_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Circle's official test USDC on Ethereum Sepolia (6 decimals). */
export const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

/** Resolved by the Nox Solidity SDK from block.chainid; repeated here for the scripts and UI. */
export const NOX_COMPUTE_SEPOLIA = "0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF" as const;

export const BASE_DECIMALS = 18;
export const QUOTE_DECIMALS = 6;

/** PricingRule enum on ZerkBook. */
export const PRICING_RULE = { AskLimit: 0, Midpoint: 1 } as const;

export type Deployment = {
  chainId: number;
  rwa?: `0x${string}`;
  usdc?: `0x${string}`;
  book?: `0x${string}`;
  zone?: `0x${string}`;
  seaport?: `0x${string}`;
  noxCompute?: `0x${string}`;
  deployedAt?: string;
};

function deploymentPath(chainId: number) {
  return join(ROOT, "deployments", `${chainId}.json`);
}

export function loadDeployment(chainId: number): Deployment {
  const path = deploymentPath(chainId);
  if (!existsSync(path)) return { chainId };
  return JSON.parse(readFileSync(path, "utf8")) as Deployment;
}

export function saveDeployment(chainId: number, patch: Partial<Deployment>): Deployment {
  const path = deploymentPath(chainId);
  mkdirSync(dirname(path), { recursive: true });
  const next: Deployment = {
    ...loadDeployment(chainId),
    ...patch,
    chainId,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`  ↳ wrote deployments/${chainId}.json`);
  return next;
}

export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${name}. Run the earlier deploy scripts first.`);
  }
  return value;
}
