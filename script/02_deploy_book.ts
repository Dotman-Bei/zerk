/**
 * Phase 2 — deploy the confidential order book.
 *
 * ZerkBook resolves NoxCompute from block.chainid inside the Nox SDK, so there is no address
 * to wire here. On Sepolia it targets 0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF.
 *
 *   npx hardhat run script/02_deploy_book.ts --network sepolia
 */
import hre from "hardhat";
import {
  BASE_DECIMALS,
  NOX_COMPUTE_SEPOLIA,
  PRICING_RULE,
  loadDeployment,
  required,
  saveDeployment,
} from "./constants.js";

async function main() {
  const { viem } = await hre.network.getOrCreate();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const prior = loadDeployment(chainId);
  const rwa = required(prior.rwa, "rwa address");
  const usdc = required(prior.usdc, "usdc address");

  console.log(`\nDeploying ZerkBook on chain ${chainId}`);
  console.log(`  base  ${rwa}`);
  console.log(`  quote ${usdc}`);
  console.log(`  pricing rule: Midpoint`);

  const book = await viem.deployContract("ZerkBook", [
    rwa,
    usdc,
    BASE_DECIMALS,
    PRICING_RULE.Midpoint,
    deployer.account.address,
  ]);

  console.log(`  ZerkBook ${book.address}`);

  saveDeployment(chainId, {
    book: book.address,
    noxCompute: chainId === 11155111 ? NOX_COMPUTE_SEPOLIA : undefined,
  });

  console.log(`\nNext: npx hardhat run script/03_deploy_zone.ts --network sepolia\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
