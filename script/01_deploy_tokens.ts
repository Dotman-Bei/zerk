/**
 * Phase 1 — deploy the permissioned asset and mint the float to Desk B (the seller).
 *
 *   npx hardhat run script/01_deploy_tokens.ts --network sepolia
 */
import { parseUnits } from "viem";
import hre from "hardhat";
import { BASE_DECIMALS, SEPOLIA_USDC, saveDeployment } from "./constants.js";

const FLOAT = parseUnits("10000000", BASE_DECIMALS); // 10M tT-BILL

async function main() {
  const { viem, networkConfig } = await hre.network.getOrCreate();
  const [deployer, deskA, deskB] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  console.log(`\nDeploying ZerkRWA on chain ${chainId} (${networkConfig.type})`);
  console.log(`  deployer ${deployer.account.address}`);

  const rwa = await viem.deployContract("ZerkRWA", [
    "Zerk Tokenized T-Bill",
    "tT-BILL",
    deployer.account.address,
  ]);
  console.log(`  ZerkRWA  ${rwa.address}`);

  const seller = deskB ?? deskA ?? deployer;
  await rwa.write.setPermitted([seller.account.address, true]);
  if (deskA) await rwa.write.setPermitted([deskA.account.address, true]);

  await rwa.write.mint([seller.account.address, FLOAT]);
  console.log(`  minted ${FLOAT} to ${seller.account.address} (Desk B / seller)`);

  saveDeployment(chainId, { rwa: rwa.address, usdc: SEPOLIA_USDC });

  console.log(`\nNext: fund Desk A with Sepolia USDC (${SEPOLIA_USDC}) from a faucet.`);
  console.log(`Then: npx hardhat run script/02_deploy_book.ts --network sepolia\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
