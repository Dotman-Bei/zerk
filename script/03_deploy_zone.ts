/**
 * Phase 3 — deploy the Seaport zone and wire it to the book.
 *
 *   npx hardhat run script/03_deploy_zone.ts --network sepolia
 */
import hre from "hardhat";
import { SEAPORT_1_6, loadDeployment, required, saveDeployment } from "./constants.js";

async function main() {
  const { viem } = await hre.network.getOrCreate();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const prior = loadDeployment(chainId);
  const bookAddress = required(prior.book, "book address");

  console.log(`\nDeploying ZerkZone on chain ${chainId}`);
  console.log(`  book    ${bookAddress}`);
  console.log(`  seaport ${SEAPORT_1_6}  (canonical, unmodified)`);

  const zone = await viem.deployContract("ZerkZone", [bookAddress, SEAPORT_1_6]);
  console.log(`  ZerkZone ${zone.address}`);

  const book = await viem.getContractAt("ZerkBook", bookAddress);
  const currentZone = await book.read.zone();
  if (currentZone === "0x0000000000000000000000000000000000000000") {
    const hash = await book.write.setZone([zone.address]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  book.setZone(${zone.address})`);
  } else {
    console.log(`  ! book already points at zone ${currentZone} — setZone is one-shot`);
  }

  saveDeployment(chainId, { zone: zone.address, seaport: SEAPORT_1_6 });

  console.log(`\nNext: npx hardhat run script/04_allowlist_and_approve.ts --network sepolia\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
