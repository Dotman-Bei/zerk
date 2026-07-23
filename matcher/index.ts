/**
 * The blind matcher.
 *
 * This keeper pairs resting order *ids* and asks the enclave whether they cross. It cannot read
 * a side, a size or a limit — it holds no viewer grant on any handle — so it is trustless with
 * respect to privacy. If it pairs badly, the TEE returns "no cross" and nothing is revealed. If
 * it pairs well, the TEE produces a fill and the keeper's only remaining job is to relay the KMS
 * decryption proofs on-chain.
 *
 * Anyone can run one. Running a second one changes nothing except how fast pairs get tried.
 *
 *   npm run matcher          # poll forever
 *   npm run matcher:once     # single sweep, then exit
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";
import { ZerkBookAbi } from "./generated/abis.js";
import { deployments } from "./generated/deployments.js";

const POLL_MS = Number(process.env.MATCHER_POLL_MS ?? 12_000);
const ONCE = process.argv.includes("--once");
const CHAIN_ID = 11155111;

/** Nox compute is async; a result handle is unreadable until a Runner has produced it. */
const DECRYPT_ATTEMPTS = Number(process.env.MATCHER_DECRYPT_ATTEMPTS ?? 10);
const DECRYPT_BACKOFF_MS = Number(process.env.MATCHER_DECRYPT_BACKOFF_MS ?? 6_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in environment`);
  return value;
}

function bookAddress(): Address {
  const record = (deployments as Record<string, { book?: Address }>)[String(CHAIN_ID)];
  const fromEnv = process.env.ZERK_BOOK_ADDRESS as Address | undefined;
  const address = fromEnv ?? record?.book;
  if (!address) {
    throw new Error("No ZerkBook address. Deploy first and run `npm run sync-abi`.");
  }
  return address;
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const key = env("MATCHER_PRIVATE_KEY");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  const handleClient = await createViemHandleClient(wallet);

  const book = bookAddress();

  log(`blind matcher online`);
  log(`  book    ${book}`);
  log(`  keeper  ${account.address}`);
  log(`  chain   sepolia (${CHAIN_ID})`);

  /** Ordered pairs already proposed. The keeper cannot tell a bid from an ask, so it tries both. */
  const attempted = new Set<string>();

  do {
    try {
      await finalizePending({ publicClient, wallet, handleClient, book });
      await proposeNext({ publicClient, wallet, book, attempted });
    } catch (error) {
      log(`! sweep failed:`, error instanceof Error ? error.message : error);
    }
    if (!ONCE) await sleep(POLL_MS);
  } while (!ONCE);
}

/**
 * Relay decryption proofs for any proposal the Runner has finished computing.
 * Everything else — including whether the pair crossed — stays opaque to this process until
 * the chain says otherwise.
 */
async function finalizePending({
  publicClient,
  wallet,
  handleClient,
  book,
}: {
  publicClient: ReturnType<typeof createPublicClient>;
  wallet: ReturnType<typeof createWalletClient>;
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>;
  book: Address;
}) {
  const count = await publicClient.readContract({
    address: book,
    abi: ZerkBookAbi,
    functionName: "matchCount",
  });

  for (let i = 0n; i < count; i++) {
    const matchId = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "matchIdAt",
      args: [i],
    });

    const m = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "getMatch",
      args: [matchId],
    });

    const [, , hCrossed, hFillSize, hFillPrice, , , , finalized] = m;
    if (finalized) continue;

    log(`finalising ${matchId}`);

    let proofs: [Hex, Hex, Hex];
    try {
      proofs = await Promise.all([
        proofFor(handleClient, hCrossed),
        proofFor(handleClient, hFillSize),
        proofFor(handleClient, hFillPrice),
      ]);
    } catch (error) {
      log(`  … not computed yet (${error instanceof Error ? error.message : error})`);
      continue;
    }

    const hash = await wallet.writeContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "finalizeMatch",
      args: [matchId, ...proofs],
      chain: sepolia,
      account: wallet.account!,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    log(`  ✓ finalizeMatch ${hash} (${receipt.status})`);
  }
}

/**
 * Fetch a KMS decryption proof, retrying while the enclave is still working.
 * The proof — not the value — is what the contract verifies, so a keeper cannot lie here.
 */
async function proofFor(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex
): Promise<Hex> {
  let lastError: unknown;
  for (let attempt = 0; attempt < DECRYPT_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { decryptionProof } = await handleClient.publicDecrypt(handle as any);
      return decryptionProof as Hex;
    } catch (error) {
      lastError = error;
      await sleep(DECRYPT_BACKOFF_MS);
    }
  }
  throw lastError;
}

/**
 * Propose one untried ordered pair. `proposeMatch` locks both orders while the enclave works,
 * so the keeper deliberately does one at a time — at demo scale the O(n²) sweep is free, and
 * batching is the honest answer for production.
 */
async function proposeNext({
  publicClient,
  wallet,
  book,
  attempted,
}: {
  publicClient: ReturnType<typeof createPublicClient>;
  wallet: ReturnType<typeof createWalletClient>;
  book: Address;
  attempted: Set<string>;
}) {
  const open = await publicClient.readContract({
    address: book,
    abi: ZerkBookAbi,
    functionName: "openOrderIds",
  });

  if (open.length < 2) return;

  for (const a of open) {
    for (const b of open) {
      if (a === b) continue;
      const key = `${a}:${b}`;
      if (attempted.has(key)) continue;
      attempted.add(key);

      log(`proposing ${a} × ${b} (blind — contents unknown to this process)`);
      try {
        const hash = await wallet.writeContract({
          address: book,
          abi: ZerkBookAbi,
          functionName: "proposeMatch",
          args: [a, b],
          chain: sepolia,
          account: wallet.account!,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        log(`  ✓ proposeMatch ${hash} (${receipt.status})`);
      } catch (error) {
        log(`  … skipped:`, error instanceof Error ? error.message.split("\n")[0] : error);
      }
      return; // one proposal per sweep — both orders are now locked
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
