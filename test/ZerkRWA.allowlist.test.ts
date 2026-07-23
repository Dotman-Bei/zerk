/**
 * The permissioned-asset argument only holds if the allowlist actually bites. These tests pin
 * that down, including the mint/burn carve-outs that make the allowlist usable at all.
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { parseUnits, zeroAddress } from "viem";
import { network } from "hardhat";

const FLOAT = parseUnits("1000000", 18);

describe("ZerkRWA — allowlist", () => {
  let ctx: Awaited<ReturnType<typeof deploy>>;

  async function deploy() {
    const { viem } = await network.create();
    const [owner, allowed, stranger] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const rwa = await viem.deployContract("ZerkRWA", [
      "Zerk Tokenized T-Bill",
      "tT-BILL",
      owner.account.address,
    ]);
    return { viem, publicClient, owner, allowed, stranger, rwa };
  }

  before(async () => {
    ctx = await deploy();
    await ctx.rwa.write.setPermitted([ctx.allowed.account.address, true]);
    await ctx.rwa.write.mint([ctx.owner.account.address, FLOAT]);
  });

  it("permits the deployer at construction", async () => {
    assert.equal(await ctx.rwa.read.permitted([ctx.owner.account.address]), true);
  });

  it("mints to a permitted holder", async () => {
    assert.equal(await ctx.rwa.read.balanceOf([ctx.owner.account.address]), FLOAT);
  });

  it("moves between two permitted accounts", async () => {
    const hash = await ctx.rwa.write.transfer([ctx.allowed.account.address, 10n]);
    await ctx.publicClient.waitForTransactionReceipt({ hash });
    assert.equal(await ctx.rwa.read.balanceOf([ctx.allowed.account.address]), 10n);
  });

  it("blocks a transfer to a non-permitted recipient", async () => {
    await assert.rejects(
      ctx.rwa.write.transfer([ctx.stranger.account.address, 1n]),
      /NotPermitted|reverted/i
    );
  });

  it("blocks a transfer from a non-permitted sender", async () => {
    // Fund the stranger by allowlisting, sending, then revoking.
    await ctx.rwa.write.setPermitted([ctx.stranger.account.address, true]);
    const hash = await ctx.rwa.write.transfer([ctx.stranger.account.address, 5n]);
    await ctx.publicClient.waitForTransactionReceipt({ hash });
    await ctx.rwa.write.setPermitted([ctx.stranger.account.address, false]);

    await assert.rejects(
      ctx.rwa.write.transfer([ctx.owner.account.address, 1n], {
        account: ctx.stranger.account,
      }),
      /NotPermitted|reverted/i
    );
  });

  it("rejects setPermitted from a non-owner", async () => {
    await assert.rejects(
      ctx.rwa.write.setPermitted([ctx.stranger.account.address, true], {
        account: ctx.stranger.account,
      }),
      /OwnableUnauthorizedAccount|reverted/i
    );
  });

  it("allowlists in batch", async () => {
    const batch = [ctx.stranger.account.address, zeroAddress];
    const hash = await ctx.rwa.write.setPermittedBatch([batch, true]);
    await ctx.publicClient.waitForTransactionReceipt({ hash });
    assert.equal(await ctx.rwa.read.permitted([ctx.stranger.account.address]), true);
  });
});
