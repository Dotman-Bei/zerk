/**
 * Phase 4 — allowlist the desks on the permissioned asset and approve Seaport on both legs.
 *
 * This is the step most likely to eat an hour on demo day. See docs/DEPLOYMENT.md for the
 * exact reason each address is on the list.
 *
 *   npx hardhat run script/04_allowlist_and_approve.ts --network sepolia
 */
import { erc20Abi, maxUint256 } from "viem";
import hre from "hardhat";
import { SEAPORT_1_6, loadDeployment, required } from "./constants.js";

async function main() {
  const { viem } = await hre.network.getOrCreate();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const [deployer, deskA, deskB] = wallets;
  const chainId = await publicClient.getChainId();

  const d = loadDeployment(chainId);
  const rwaAddress = required(d.rwa, "rwa address");
  const usdcAddress = required(d.usdc, "usdc address");
  const bookAddress = required(d.book, "book address");
  const zoneAddress = required(d.zone, "zone address");

  if (!deskA || !deskB) {
    throw new Error(
      "Need three accounts (deployer, Desk A, Desk B). Set DESK_A_PRIVATE_KEY and DESK_B_PRIVATE_KEY."
    );
  }

  const rwa = await viem.getContractAt("ZerkRWA", rwaAddress);

  // Desks must be allowlisted because they are the `from` and `to` of the settlement transfer.
  // Seaport and the zone are added defensively: with conduitKey = 0 Seaport calls transferFrom
  // directly and never becomes from/to, so it is not strictly required — but it costs one slot
  // and removes an entire class of demo-day failure.
  const allowlist = [
    deployer.account.address,
    deskA.account.address,
    deskB.account.address,
    SEAPORT_1_6,
    zoneAddress,
    bookAddress,
  ];

  console.log(`\nAllowlisting ${allowlist.length} addresses on ZerkRWA`);
  const allowHash = await rwa.write.setPermittedBatch([allowlist, true]);
  await publicClient.waitForTransactionReceipt({ hash: allowHash });
  for (const a of allowlist) console.log(`  ✓ ${a}`);

  // Seller approves Seaport to move the RWA; buyer approves Seaport to move the cash.
  console.log(`\nApproving Seaport (${SEAPORT_1_6}) as spender`);

  const approveB = await deskB.writeContract({
    address: rwaAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [SEAPORT_1_6, maxUint256],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveB });
  console.log(`  ✓ Desk B → tT-BILL`);

  const approveA = await deskA.writeContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [SEAPORT_1_6, maxUint256],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveA });
  console.log(`  ✓ Desk A → USDC`);

  const [rwaBalB, usdcBalA] = await Promise.all([
    publicClient.readContract({
      address: rwaAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [deskB.account.address],
    }),
    publicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [deskA.account.address],
    }),
  ]);

  console.log(`\nBalances`);
  console.log(`  Desk B tT-BILL ${rwaBalB}`);
  console.log(`  Desk A USDC    ${usdcBalA}`);
  if (usdcBalA === 0n) console.log(`  ! Desk A holds no USDC — fund it before settling.`);

  console.log(`\nDeployment complete. Run \`npm run sync-abi\` then start web/ and matcher/.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
