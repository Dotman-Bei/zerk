/**
 * The only place the Nox JS SDK is touched.
 *
 * Three operations carry the whole product:
 *   encryptInput   — a desk seals side/size/limit before anything reaches the chain
 *   decrypt        — a desk (or a granted auditor) reads a handle back
 *   publicDecrypt  — a fill's terms become plaintext, with a proof the contract can verify
 *
 * Everything is client-side. No plaintext order term is ever sent to a Zerk server, because
 * there is no Zerk server.
 */
import { createViemHandleClient } from "@iexec-nox/handle";
import type { WalletClient } from "viem";

export type HandleClient = Awaited<ReturnType<typeof createViemHandleClient>>;

export type SolidityType = "bool" | "uint16" | "uint256" | "int16" | "int256";

let cached: { key: string; client: Promise<HandleClient> } | null = null;

/** One client per connected account; rebuilt when the account changes. */
export function getHandleClient(wallet: WalletClient): Promise<HandleClient> {
  const key = wallet.account?.address ?? "anonymous";
  if (cached?.key !== key) {
    cached = { key, client: createViemHandleClient(wallet) };
  }
  return cached.client;
}

export type EncryptedInput = { handle: `0x${string}`; handleProof: `0x${string}` };

/**
 * Seals one value against a specific application contract. The gateway signs a proof binding
 * the handle to (contract, owner), so a handle cannot be lifted from one desk's order into
 * another's.
 */
export async function encrypt(
  client: HandleClient,
  value: bigint | boolean,
  solidityType: SolidityType,
  applicationContract: `0x${string}`
): Promise<EncryptedInput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.encryptInput(value as any, solidityType as any, applicationContract);
  return {
    handle: result.handle as `0x${string}`,
    handleProof: result.handleProof as `0x${string}`,
  };
}

export type DecryptOutcome =
  | { status: "ok"; value: bigint | boolean; solidityType: string }
  | { status: "denied"; reason: string }
  | { status: "pending"; reason: string };

/**
 * Reads a handle back. The three outcomes are distinct and the UI shows all of them:
 * `denied` is what an ungranted auditor sees, `pending` is the enclave still working, and
 * `ok` means the KMS reassembled the value under the connected wallet's key.
 */
export async function tryDecrypt(
  client: HandleClient,
  handle: `0x${string}`
): Promise<DecryptOutcome> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { value, solidityType } = await client.decrypt(handle as any);
    return { status: "ok", value: value as bigint | boolean, solidityType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not.*computed|NotYetComputed/i.test(message)) {
      return { status: "pending", reason: "The enclave has not produced this value yet." };
    }
    return { status: "denied", reason: message };
  }
}

export type Acl = { isPublic: boolean; admins: string[]; viewers: string[] };

export async function readAcl(
  client: HandleClient,
  handle: `0x${string}`
): Promise<Acl | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await client.viewACL(handle as any)) as Acl;
  } catch {
    return null;
  }
}
