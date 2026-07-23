/**
 * Matching logic, checked against known plaintext.
 *
 * `proposeMatch` cannot run on a bare local chain — it needs a NoxCompute deployment and a live
 * Runner. What *can* be pinned down locally is the algebra: that folding three conditions into a
 * 0/1 selector and multiplying through is equivalent to the branching version, for every case
 * that matters. If this file is green, the only thing left to verify on Sepolia is that the TEE
 * evaluates the same primitives — which `test/e2e.sepolia.test.ts` does.
 *
 * The order-lifecycle tests below run against the real contract and stop at the Nox boundary.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUnits, zeroAddress } from "viem";
import { network } from "hardhat";
import {
  SIDE_ASK,
  SIDE_BID,
  crossBranchless,
  crossNaive,
  notionalOf,
  type PlainOrder,
  type PricingRule,
} from "../matcher/crossing.js";

const px = (v: string) => parseUnits(v, 6); // quote units
const sz = (v: string) => parseUnits(v, 18); // base units

const bid = (limit: string, size: string): PlainOrder => ({
  side: SIDE_BID,
  size: sz(size),
  limit: px(limit),
});
const ask = (limit: string, size: string): PlainOrder => ({
  side: SIDE_ASK,
  size: sz(size),
  limit: px(limit),
});

const CASES: Array<{ name: string; bid: PlainOrder; ask: PlainOrder }> = [
  { name: "crosses with room to spare", bid: bid("99.20", "500000"), ask: ask("99.10", "400000") },
  { name: "does not cross", bid: bid("99.00", "500000"), ask: ask("99.10", "400000") },
  { name: "equal limits cross exactly", bid: bid("99.10", "400000"), ask: ask("99.10", "400000") },
  { name: "misses by one unit", bid: bid("99.099999", "1"), ask: ask("99.10", "1") },
  { name: "partial fill — bid smaller", bid: bid("99.50", "100000"), ask: ask("99.10", "400000") },
  { name: "partial fill — ask smaller", bid: bid("99.50", "400000"), ask: ask("99.10", "100000") },
  { name: "zero size on the bid", bid: bid("99.50", "0"), ask: ask("99.10", "400000") },
  { name: "zero size on the ask", bid: bid("99.50", "400000"), ask: ask("99.10", "0") },
  { name: "zero limits", bid: bid("0", "400000"), ask: ask("0", "400000") },
  {
    name: "two bids never cross",
    bid: bid("99.50", "400000"),
    ask: { ...bid("99.10", "400000") },
  },
  {
    name: "two asks never cross",
    bid: { ...ask("99.50", "400000") },
    ask: ask("99.10", "400000"),
  },
  {
    name: "sides reversed — a bid submitted in the ask slot",
    bid: { ...ask("99.50", "400000") },
    ask: { ...bid("99.10", "400000") },
  },
];

describe("ZerkBook — crossing algebra", () => {
  for (const rule of ["midpoint", "askLimit"] as PricingRule[]) {
    for (const c of CASES) {
      it(`[${rule}] ${c.name}`, () => {
        assert.deepEqual(crossBranchless(c.bid, c.ask, rule), crossNaive(c.bid, c.ask, rule));
      });
    }
  }

  it("a non-crossing pair yields zero size and zero price, not a revert", () => {
    const r = crossBranchless(bid("99.00", "500000"), ask("99.10", "400000"));
    assert.equal(r.crossed, false);
    assert.equal(r.fillSize, 0n);
    assert.equal(r.fillPrice, 0n);
  });

  it("midpoint never equals either limit when the limits differ", () => {
    const b = bid("99.20", "500000");
    const a = ask("99.10", "400000");
    const r = crossBranchless(b, a, "midpoint");
    assert.equal(r.fillPrice, px("99.15"));
    assert.notEqual(r.fillPrice, b.limit);
    assert.notEqual(r.fillPrice, a.limit);
  });

  it("askLimit pricing publishes the seller's limit and hides the buyer's", () => {
    const b = bid("99.20", "500000");
    const a = ask("99.10", "400000");
    const r = crossBranchless(b, a, "askLimit");
    assert.equal(r.fillPrice, a.limit);
    assert.notEqual(r.fillPrice, b.limit);
  });

  it("computes the notional the zone will enforce", () => {
    const r = crossBranchless(bid("99.20", "500000"), ask("99.10", "400000"));
    // 400,000 tokens × 99.15 USDC
    assert.equal(notionalOf(r.fillSize, r.fillPrice), px("39660000"));
  });
});

describe("ZerkBook — lifecycle and access control", () => {
  async function deploy() {
    const { viem } = await network.create();
    const [owner, deskA, deskB] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const rwa = await viem.deployContract("ZerkRWA", ["Base", "BASE", owner.account.address]);
    const usdc = await viem.deployContract("ZerkRWA", ["Quote", "QUOTE", owner.account.address]);
    const book = await viem.deployContract("ZerkBook", [
      rwa.address,
      usdc.address,
      18,
      1, // PricingRule.Midpoint
      owner.account.address,
    ]);
    return { viem, publicClient, owner, deskA, deskB, rwa, usdc, book };
  }

  it("records its pair and pricing rule", async () => {
    const { book, rwa, usdc } = await deploy();
    assert.equal(String(await book.read.baseToken()).toLowerCase(), rwa.address.toLowerCase());
    assert.equal(String(await book.read.quoteToken()).toLowerCase(), usdc.address.toLowerCase());
    assert.equal(await book.read.pricingRule(), 1);
    assert.equal(await book.read.baseUnit(), 10n ** 18n);
  });

  it("starts with an empty book", async () => {
    const { book } = await deploy();
    assert.equal(await book.read.orderCount(), 0n);
    assert.equal(await book.read.matchCount(), 0n);
    assert.deepEqual(await book.read.openOrderIds(), []);
  });

  it("wires the zone exactly once", async () => {
    const { book, deskA } = await deploy();
    assert.equal(await book.read.zone(), zeroAddress);

    await book.write.setZone([deskA.account.address]);
    assert.equal(
      String(await book.read.zone()).toLowerCase(),
      deskA.account.address.toLowerCase()
    );

    await assert.rejects(
      book.write.setZone([deskA.account.address]),
      /ZoneAlreadySet|reverted/i
    );
  });

  it("rejects setZone from a non-owner", async () => {
    const { book, deskA } = await deploy();
    await assert.rejects(
      book.write.setZone([deskA.account.address], { account: deskA.account }),
      /NotOwner|reverted/i
    );
  });

  it("refuses consumeMatch from anyone but the zone", async () => {
    const { book, deskA } = await deploy();
    await assert.rejects(
      book.write.consumeMatch([`0x${"11".repeat(32)}`], { account: deskA.account }),
      /NotZone|reverted/i
    );
  });

  it("refuses to propose an order against itself", async () => {
    const { book } = await deploy();
    await assert.rejects(book.write.proposeMatch([1n, 1n]), /SameOrder|reverted/i);
  });

  it("refuses to propose orders that are not open", async () => {
    const { book } = await deploy();
    await assert.rejects(book.write.proposeMatch([1n, 2n]), /OrderNotOpen|reverted/i);
  });

  it("reports no fill terms for an unknown match", async () => {
    const { book } = await deploy();
    await assert.rejects(
      book.read.fillTerms([`0x${"22".repeat(32)}`]),
      /MatchNotApproved|reverted/i
    );
    assert.equal(await book.read.isApprovedMatch([`0x${"22".repeat(32)}`]), false);
  });
});
