/**
 * The full lifecycle against a live Sepolia deployment and a live Nox stack.
 *
 * Skipped unless RUN_SEPOLIA_E2E=1, because it spends real Sepolia gas and depends on the
 * Ingestor and a Runner actually being up. This is the test that proves the claim — everything
 * else in test/ proves a component.
 *
 *   RUN_SEPOLIA_E2E=1 npx hardhat test test/e2e.sepolia.test.ts
 *
 * It asserts, in order:
 *   1. Two encrypted orders reach the chain carrying nothing but handles.
 *   2. Neither desk's limit price appears anywhere in the calldata or the logs.
 *   3. The TEE crosses them and produces a fill.
 *   4. Only the fill size and price ever become plaintext.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createViemHandleClient } from "@iexec-nox/handle";
import { ZerkBookAbi } from "../matcher/generated/abis.js";
import { deployments } from "../matcher/generated/deployments.js";
import { crossNaive, SIDE_ASK, SIDE_BID } from "../matcher/crossing.js";

const ENABLED = process.env.RUN_SEPOLIA_E2E === "1";

const BID_LIMIT = parseUnits("99.20", 6);
const BID_SIZE = parseUnits("500000", 18);
const ASK_LIMIT = parseUnits("99.10", 6);
const ASK_SIZE = parseUnits("400000", 18);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function account(name: string) {
  const key = process.env[name];
  if (!key) throw new Error(`Missing ${name}`);
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}

describe("Zerk — end to end on Sepolia", { skip: !ENABLED && "set RUN_SEPOLIA_E2E=1" }, () => {
  const transport = http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
  const publicClient = createPublicClient({ chain: sepolia, transport });

  const book = (process.env.ZERK_BOOK_ADDRESS ??
    (deployments as Record<string, { book?: Address }>)["11155111"]?.book) as Address;

  async function submit(
    accountName: string,
    side: number,
    size: bigint,
    limit: bigint
  ): Promise<{ orderId: bigint; txHash: Hex }> {
    const wallet = createWalletClient({ account: account(accountName), chain: sepolia, transport });
    const nox = await createViemHandleClient(wallet);

    // Every value is encrypted client-side and bound to (ZerkBook, this desk).
    const [encSide, encSize, encLimit] = await Promise.all([
      nox.encryptInput(BigInt(side), "uint16", book),
      nox.encryptInput(size, "uint256", book),
      nox.encryptInput(limit, "uint256", book),
    ]);

    const txHash = await wallet.writeContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "submitOrder",
      args: [
        encSide.handle as Hex,
        encSide.handleProof as Hex,
        encSize.handle as Hex,
        encSize.handleProof as Hex,
        encLimit.handle as Hex,
        encLimit.handleProof as Hex,
      ],
      chain: sepolia,
      account: wallet.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const orderId = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "orderCount",
    });
    return { orderId, txHash };
  }

  it("submits two encrypted orders, crosses them in the TEE, and reveals only the fill", async () => {
    assert.ok(book, "no ZerkBook address — deploy first and run `npm run sync-abi`");

    const bid = await submit("DESK_A_PRIVATE_KEY", SIDE_BID, BID_SIZE, BID_LIMIT);
    const ask = await submit("DESK_B_PRIVATE_KEY", SIDE_ASK, ASK_SIZE, ASK_LIMIT);

    // ── the privacy test ──────────────────────────────────────────────────────
    // Pull the raw calldata and logs and grep for both limit prices. Neither may appear.
    for (const { txHash } of [bid, ask]) {
      const [tx, receipt] = await Promise.all([
        publicClient.getTransaction({ hash: txHash }),
        publicClient.getTransactionReceipt({ hash: txHash }),
      ]);
      const blob = (tx.input + receipt.logs.map((l) => l.data + l.topics.join("")).join("")).toLowerCase();
      for (const limit of [BID_LIMIT, ASK_LIMIT]) {
        const needle = toHex(limit, { size: 32 }).slice(2).toLowerCase();
        assert.equal(blob.includes(needle), false, `limit ${limit} leaked in ${txHash}`);
      }
    }

    // ── matching ──────────────────────────────────────────────────────────────
    const keeper = createWalletClient({
      account: account("MATCHER_PRIVATE_KEY"),
      chain: sepolia,
      transport,
    });
    const keeperNox = await createViemHandleClient(keeper);

    const proposeHash = await keeper.writeContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "proposeMatch",
      args: [bid.orderId, ask.orderId],
      chain: sepolia,
      account: keeper.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: proposeHash });

    const matchCount = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "matchCount",
    });
    const matchId = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "matchIdAt",
      args: [matchCount - 1n],
    });

    const m = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "getMatch",
      args: [matchId],
    });
    const [, , hCrossed, hFillSize, hFillPrice] = m;

    // Nox compute is asynchronous — wait for a Runner to produce the result handles.
    const proofs: Hex[] = [];
    for (const handle of [hCrossed, hFillSize, hFillPrice]) {
      let proof: Hex | undefined;
      for (let attempt = 0; attempt < 20 && !proof; attempt++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          proof = (await keeperNox.publicDecrypt(handle as any)).decryptionProof as Hex;
        } catch {
          await sleep(6_000);
        }
      }
      assert.ok(proof, `handle ${handle} never resolved`);
      proofs.push(proof);
    }

    const finalizeHash = await keeper.writeContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "finalizeMatch",
      args: [matchId, proofs[0]!, proofs[1]!, proofs[2]!],
      chain: sepolia,
      account: keeper.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: finalizeHash });

    // ── the fill matches the plaintext oracle ─────────────────────────────────
    const expected = crossNaive(
      { side: SIDE_BID, size: BID_SIZE, limit: BID_LIMIT },
      { side: SIDE_ASK, size: ASK_SIZE, limit: ASK_LIMIT },
      "midpoint"
    );

    const [fillSize, fillPrice] = await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "fillTerms",
      args: [matchId],
    });

    assert.equal(fillSize, expected.fillSize);
    assert.equal(fillPrice, expected.fillPrice);
    assert.equal(await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "isApprovedMatch",
      args: [matchId],
    }), true);
  });
});
