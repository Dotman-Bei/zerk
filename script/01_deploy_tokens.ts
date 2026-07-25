/**
 * Phase 1 — deploy the permissioned asset and mint the float to Desk B (the seller).
 *
 *   npx hardhat run script/01_deploy_tokens.ts --network sepolia
 */
import { parseUnits } from "viem";
import hre from "hardhat";
import { BASE_DECIMALS, QUOTE_DECIMALS, saveDeployment } from "./constants.js";

const FLOAT = parseUnits("10000000", BASE_DECIMALS); // 10M tT-BILL
/** Enough to lift the entire float at a ~99 limit (991M) with room for repeated demo runs. */
const CASH = parseUnits("1000000000", QUOTE_DECIMALS); // 1B tUSDC

async function main() {
  const { viem, networkConfig } = await hre.network.getOrCreate();
  const [deployer, deskA, deskB] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  console.log(`\nDeploying ZerkRWA on chain ${chainId} (${networkConfig.type})`);
  console.log(`  deployer ${deployer.account.address}`);

  // The deployer fires several writes in a row. Public RPCs report the nonce at `latest`, not
  // `pending`, so unawaited writes collide on one nonce and revert as "replacement transaction
  // underpriced". Awaiting each receipt serialises them and keeps the nonce advancing.
  const send = (hash: Promise<`0x${string}`>) =>
    hash.then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

  const rwa = await viem.deployContract("ZerkRWA", [
    "Zerk Tokenized T-Bill",
    "tT-BILL",
    deployer.account.address,
  ]);
  console.log(`  ZerkRWA  ${rwa.address}`);

  const seller = deskB ?? deskA ?? deployer;
  await send(rwa.write.setPermitted([seller.account.address, true]));
  if (deskA) await send(rwa.write.setPermitted([deskA.account.address, true]));

  await send(rwa.write.mint([seller.account.address, FLOAT]));
  console.log(`  minted ${FLOAT} to ${seller.account.address} (Desk B / seller)`);

  // The cash leg. See ZerkUSD.sol for why this is deployed rather than pointed at Circle's
  // Sepolia USDC: the faucet cannot fund a 40M notional, and both tokens are valueless testnet
  // ERC-20s regardless. Settlement is still real Seaport moving real balances.
  const usdc = await viem.deployContract("ZerkUSD", [deployer.account.address]);
  console.log(`  ZerkUSD  ${usdc.address}`);

  const buyer = deskA ?? deployer;
  await send(usdc.write.mint([buyer.account.address, CASH]));
  console.log(`  minted ${CASH} to ${buyer.account.address} (Desk A / buyer)`);

  saveDeployment(chainId, { rwa: rwa.address, usdc: usdc.address });

  console.log(`\nNext: npx hardhat run script/02_deploy_book.ts --network sepolia\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
