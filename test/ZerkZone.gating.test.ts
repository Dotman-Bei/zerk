/**
 * The zone is the whole Seaport integration, so it gets the strictest tests in the repo.
 *
 * Every assertion here is about one property: a Seaport fulfilment is impossible unless the
 * book approved that exact match, at that exact size and price, exactly once.
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { getAddress, keccak256, parseUnits, toHex, zeroAddress } from "viem";
import { network } from "hardhat";

const SEAPORT = getAddress("0x0000000000000068F116a894984e2DB1123eB395");

const FILL_SIZE = parseUnits("400000", 18); // 400k tT-BILL
const FILL_PRICE = parseUnits("99.10", 6); // 99.10 USDC per token
const NOTIONAL = (FILL_SIZE * FILL_PRICE) / 10n ** 18n; // 39,640,000 USDC

const MATCH_ID = keccak256(toHex("zerk:match:1"));
const UNKNOWN_MATCH_ID = keccak256(toHex("zerk:match:unknown"));

type Ctx = Awaited<ReturnType<typeof deploy>>;

async function deploy() {
  const connection = await network.create();
  const { viem } = connection;
  const [deployer, seaportImpersonator, other] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const base = await viem.deployContract("ZerkRWA", ["Base", "BASE", deployer.account.address]);
  const quote = await viem.deployContract("ZerkRWA", ["Quote", "QUOTE", deployer.account.address]);
  const book = await viem.deployContract("MockZerkBook", [base.address, quote.address]);

  // The zone trusts whichever address it was told is Seaport. On a local chain we point it at
  // a wallet we control so the pre/post hooks can be driven directly.
  const zone = await viem.deployContract("ZerkZone", [
    book.address,
    seaportImpersonator.account.address,
  ]);

  // A second zone wired to the real Seaport address, to prove non-Seaport callers bounce.
  const strictZone = await viem.deployContract("ZerkZone", [book.address, SEAPORT]);

  await book.write.approveMatch([MATCH_ID, FILL_SIZE, FILL_PRICE, NOTIONAL]);

  return {
    viem,
    publicClient,
    deployer,
    seaportImpersonator,
    other,
    base,
    quote,
    book,
    zone,
    strictZone,
  };
}

/** Seller-offered shape: RWA out of the offerer, cash back to the offerer. */
function zoneParams(
  ctx: Ctx,
  overrides: {
    zoneHash?: `0x${string}`;
    offerAmount?: bigint;
    considerationAmount?: bigint;
    offerToken?: `0x${string}`;
  } = {}
) {
  return {
    orderHash: keccak256(toHex("order")),
    fulfiller: ctx.other.account.address,
    offerer: ctx.deployer.account.address,
    offer: [
      {
        itemType: 1, // ERC20
        token: overrides.offerToken ?? ctx.base.address,
        identifier: 0n,
        amount: overrides.offerAmount ?? FILL_SIZE,
      },
    ],
    consideration: [
      {
        itemType: 1,
        token: ctx.quote.address,
        identifier: 0n,
        amount: overrides.considerationAmount ?? NOTIONAL,
        recipient: ctx.deployer.account.address,
      },
    ],
    extraData: "0x" as const,
    orderHashes: [] as `0x${string}`[],
    startTime: 0n,
    endTime: 2n ** 64n,
    zoneHash: overrides.zoneHash ?? MATCH_ID,
  };
}

describe("ZerkZone — Seaport gating", () => {
  let ctx: Ctx;

  before(async () => {
    ctx = await deploy();
  });

  it("authorizes an approved match with exact amounts", async () => {
    const magic = await ctx.zone.read.authorizeOrder([zoneParams(ctx)], {
      account: ctx.seaportImpersonator.account.address,
    });
    // bytes4(keccak256("authorizeOrder((bytes32,address,address,...))"))
    assert.equal(String(magic).length, 10, "expected a bytes4 magic value");
    assert.notEqual(magic, "0x00000000");
  });

  it("rejects any caller that is not Seaport", async () => {
    await assert.rejects(
      ctx.strictZone.read.authorizeOrder([zoneParams(ctx)], {
        account: ctx.other.account.address,
      }),
      /NotSeaport|reverted/i
    );
  });

  it("rejects a zoneHash the book never approved", async () => {
    await assert.rejects(
      ctx.zone.read.authorizeOrder([zoneParams(ctx, { zoneHash: UNKNOWN_MATCH_ID })], {
        account: ctx.seaportImpersonator.account.address,
      }),
      /MatchNotApproved|reverted/i
    );
  });

  it("rejects a valid matchId carrying the wrong fill size", async () => {
    await assert.rejects(
      ctx.zone.read.authorizeOrder([zoneParams(ctx, { offerAmount: FILL_SIZE + 1n })], {
        account: ctx.seaportImpersonator.account.address,
      }),
      /UnexpectedFillSize|reverted/i
    );
  });

  it("rejects a valid matchId that underpays the notional", async () => {
    await assert.rejects(
      ctx.zone.read.authorizeOrder([zoneParams(ctx, { considerationAmount: NOTIONAL - 1n })], {
        account: ctx.seaportImpersonator.account.address,
      }),
      /UnexpectedNotional|reverted/i
    );
  });

  it("rejects an order in an unrelated token pair", async () => {
    await assert.rejects(
      ctx.zone.read.authorizeOrder([zoneParams(ctx, { offerToken: zeroAddress })], {
        account: ctx.seaportImpersonator.account.address,
      }),
      /UnrecognisedPair|reverted/i
    );
  });

  it("consumes the match on validateOrder, then refuses a replay", async () => {
    const hash = await ctx.zone.write.validateOrder([zoneParams(ctx)], {
      account: ctx.seaportImpersonator.account,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash });

    assert.equal(await ctx.book.read.consumeCalls(), 1n);
    assert.equal(await ctx.book.read.isApprovedMatch([MATCH_ID]), false);

    // Replay: the pre-transfer hook now refuses the same match id.
    await assert.rejects(
      ctx.zone.read.authorizeOrder([zoneParams(ctx)], {
        account: ctx.seaportImpersonator.account.address,
      }),
      /MatchNotApproved|reverted/i
    );

    await assert.rejects(
      ctx.zone.write.validateOrder([zoneParams(ctx)], {
        account: ctx.seaportImpersonator.account,
      }),
      /MatchNotApproved|reverted/i
    );
  });
});
