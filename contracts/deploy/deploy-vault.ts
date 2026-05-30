import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const PRICE = 3_400n;
const LTV_BPS = 7_500;
const LIQUIDATION_BONUS_BPS = 500;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const base = await get("VeilBase");
  const quote = await get("VeilQuote");

  const vault = await deploy("VeilLendingVault", {
    from: deployer,
    args: [base.address, quote.address, PRICE, LTV_BPS, LIQUIDATION_BONUS_BPS],
    log: true,
  });

  const registry = await deploy("VeilRegulatorRegistry", {
    from: deployer,
    args: [],
    log: true,
  });

  if (vault.newlyDeployed) {
    const veilDep = await get("VeilBatchAuctionV2");
    const veil = await hre.ethers.getContractAt("VeilBatchAuctionV2", veilDep.address);
    const tx = await veil.authorizeMarginVault(vault.address);
    await tx.wait();
    console.log(`  authorizeMarginVault(${vault.address}) on V2: ${tx.hash}`);
  }

  console.log("");
  console.log("Veil ancillary deployment summary");
  console.log("  VeilLendingVault:       ", vault.address);
  console.log("  VeilRegulatorRegistry:  ", registry.address);
  console.log(`  collateralToken (vWETH): ${base.address}`);
  console.log(`  debtToken       (vUSDC): ${quote.address}`);
  console.log(`  price=${PRICE}  ltvBps=${LTV_BPS}  liquidationBonusBps=${LIQUIDATION_BONUS_BPS}`);
};

export default func;
func.id = "deploy_vault_and_registry";
func.tags = ["VeilLendingVault", "VeilRegulatorRegistry"];
func.dependencies = ["VeilBatchAuctionV2"];
