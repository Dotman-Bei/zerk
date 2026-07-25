/**
 * The settlement operator.
 *
 * A deliberately separate role from the blind matcher. The matcher never holds tokens and cannot
 * read an order — that is its whole security argument, and it stays that way. Settlement is the
 * opposite: it is inherently bilateral, so *someone* has to hold the two desks' keys to sign the
 * seller's order and submit the buyer's fulfilment. In this demo one operator holds both; in
 * production this splits into two desk clients, each signing its own leg — the same code, the keys
 * on different machines. Nothing here can forge a fill: the amounts are pinned by the zone against
 * what the TEE already approved, so this operator is a courier, not a trusted party.
 *
 * For each approved-but-unsettled match it:
 *   1. reads the exact fill terms the zone will enforce (fillSize, notional),
 *   2. works out which desk is the seller (holds the base asset) and which is the buyer,
 *   3. has the seller sign a FULL_RESTRICTED Seaport order bound to the match id via zoneHash,
 *   4. has the buyer fulfil it — real tT-BILL ↔ tUSDC, atomic, through unmodified Seaport.
 *
 *   npm run settle          # poll forever
 *   npm run settle:once     # single sweep, then exit
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { ZerkBookAbi } from "./generated/abis.js";
import { deployments } from "./generated/deployments.js";
import {
  SEAPORT_1_6,
  buildSellOrderParameters,
  encodeFulfillAdvancedOrder,
  signOrder,
} from "./seaport-order.js";

const POLL_MS = Number(process.env.MATCHER_POLL_MS ?? 12_000);
const ONCE = process.argv.includes("--once");
const CHAIN_ID = 11155111;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

function addressFor(chainKey: "book" | "zone"): Address {
  const record = (deployments as Record<string, { book?: Address; zone?: Address }>)[String(CHAIN_ID)];
  const address = record?.[chainKey];
  if (!address) throw new Error(`No ${chainKey} address. Deploy first and run \`npm run sync-abi\`.`);
  return address;
}

/** Every desk key we hold, indexed by lower-cased address, so a match can be mapped to signers. */
function deskWallets(transport: ReturnType<typeof http>): Map<string, WalletClient> {
  const wallets = new Map<string, WalletClient>();
  for (const name of ["DESK_A_PRIVATE_KEY", "DESK_B_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"]) {
    const key = process.env[name];
    if (!key) continue;
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
    wallets.set(account.address.toLowerCase(), createWalletClient({ account, chain: sepolia, transport }));
  }
  return wallets;
}

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });

  const book = addressFor("book");
  const zone = addressFor("zone");
  const wallets = deskWallets(transport);

  const [base, quote] = await Promise.all([
    publicClient.readContract({ address: book, abi: ZerkBookAbi, functionName: "baseToken" }) as Promise<Address>,
    publicClient.readContract({ address: book, abi: ZerkBookAbi, functionName: "quoteToken" }) as Promise<Address>,
  ]);

  log(`settlement operator online`);
  log(`  book   ${book}`);
  log(`  zone   ${zone}`);
  log(`  base   ${base}  quote ${quote}`);
  log(`  desks  ${[...wallets.keys()].join(", ")}`);

  do {
    try {
      await settlePending({ publicClient, book, zone, base, quote, wallets });
    } catch (error) {
      log(`! sweep failed:`, error instanceof Error ? error.message.split("\n")[0] : error);
    }
    if (!ONCE) await sleep(POLL_MS);
  } while (!ONCE);
}

async function settlePending({
  publicClient,
  book,
  zone,
  base,
  quote,
  wallets,
}: {
  publicClient: PublicClient;
  book: Address;
  zone: Address;
  base: Address;
  quote: Address;
  wallets: Map<string, WalletClient>;
}) {
  const count = (await publicClient.readContract({
    address: book,
    abi: ZerkBookAbi,
    functionName: "matchCount",
  })) as bigint;

  for (let i = 0n; i < count; i++) {
    const matchId = (await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "matchIdAt",
      args: [i],
    })) as Hex;

    // isApprovedMatch is true only for a crossed, finalised, not-yet-consumed match — exactly
    // the settleable set. Anything else (not computed, no-cross, already settled) is skipped.
    const settleable = (await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "isApprovedMatch",
      args: [matchId],
    })) as boolean;
    if (!settleable) continue;

    const [fillSize, fillPrice, notional] = (await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "fillTerms",
      args: [matchId],
    })) as [bigint, bigint, bigint];

    const [bidId, askId] = (await publicClient.readContract({
      address: book,
      abi: ZerkBookAbi,
      functionName: "getMatch",
      args: [matchId],
    })) as unknown as [bigint, bigint, ...unknown[]];

    // Roles are deterministic, not guessed. The crossing predicate only approves a match when
    // bidId is genuinely a bid and askId genuinely an ask (see matcher/crossing.ts), so an
    // approved match pins the seller (offers the base asset) to askId and the buyer to bidId.
    // Never infer this from current balances — a desk that just bought holds base too.
    const [buyer, seller] = await Promise.all([
      deskOf(publicClient, book, bidId),
      deskOf(publicClient, book, askId),
    ]);

    // Balances are a guard, not the selector: if the pinned seller cannot deliver, skip loudly
    // rather than build an order Seaport will only revert.
    const sellerAsset = await balanceOf(publicClient, base, seller);
    if (sellerAsset < fillSize) {
      log(`match ${matchId}: seller ${seller} holds ${sellerAsset} base < fillSize ${fillSize}, skipping`);
      continue;
    }

    const sellerWallet = wallets.get(seller.toLowerCase());
    const buyerWallet = wallets.get(buyer.toLowerCase());
    if (!sellerWallet || !buyerWallet) {
      log(`match ${matchId}: missing a desk key (seller ${seller} / buyer ${buyer}), skipping`);
      continue;
    }

    const buyerCash = await balanceOf(publicClient, quote, buyer);
    if (buyerCash < notional) {
      log(`match ${matchId}: buyer ${buyer} holds ${buyerCash} quote < notional ${notional}, skipping`);
      continue;
    }

    log(`settling ${matchId}`);
    log(`  seller ${seller}  offers ${fillSize} base`);
    log(`  buyer  ${buyer}  pays  ${notional} quote  (price ${fillPrice})`);

    // The seller signs off-chain; nothing is on-chain until the buyer fulfils. zoneHash = matchId
    // is the entire binding — the zone rejects any order whose match the TEE never approved.
    const parameters = buildSellOrderParameters({
      offerer: seller,
      zone,
      baseToken: base,
      quoteToken: quote,
      fillSize,
      notional,
      matchId,
    });
    const signed = await signOrder({ wallet: sellerWallet, publicClient, parameters });

    const data = encodeFulfillAdvancedOrder({ order: signed, recipient: buyer });
    const hash = await buyerWallet.sendTransaction({
      account: buyerWallet.account as Account,
      chain: sepolia,
      to: SEAPORT_1_6,
      data,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    log(`  ${receipt.status === "success" ? "✓" : "✗"} fulfillAdvancedOrder ${hash} (${receipt.status})`);

    const [sellerCash, buyerAsset] = await Promise.all([
      balanceOf(publicClient, quote, seller),
      balanceOf(publicClient, base, buyer),
    ]);
    log(`  settled: seller now holds ${sellerCash} quote, buyer now holds ${buyerAsset} base`);

    return; // one settlement per sweep — keeps the log readable and nonces simple
  }
}

async function deskOf(publicClient: PublicClient, book: Address, orderId: bigint): Promise<Address> {
  const order = (await publicClient.readContract({
    address: book,
    abi: ZerkBookAbi,
    functionName: "getOrder",
    args: [orderId],
  })) as unknown as [Address, ...unknown[]];
  return order[0];
}

function balanceOf(publicClient: PublicClient, token: Address, owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  }) as Promise<bigint>;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
