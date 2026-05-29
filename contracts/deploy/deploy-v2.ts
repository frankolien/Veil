import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const BATCH_BLOCKS = 10;
const TICK_PRICE_0 = 3_400n;
const TICK_STEP = 10n;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const base = await deploy("VeilBase", {
    contract: "MockConfidentialToken",
    from: deployer,
    args: ["Veil Demo WETH", "vWETH", 0],
    log: true,
  });

  const quote = await deploy("VeilQuote", {
    contract: "MockConfidentialToken",
    from: deployer,
    args: ["Veil Demo USDC", "vUSDC", 0],
    log: true,
  });

  const veil = await deploy("VeilBatchAuctionV2", {
    from: deployer,
    args: [BATCH_BLOCKS, base.address, quote.address, TICK_PRICE_0, TICK_STEP],
    log: true,
  });

  console.log("");
  console.log("Veil v2 deployment summary");
  console.log("  VeilBase  (vWETH):", base.address);
  console.log("  VeilQuote (vUSDC):", quote.address);
  console.log("  VeilBatchAuctionV2:", veil.address);
  console.log(`  batchBlocks=${BATCH_BLOCKS}`);
  console.log(`  tickPrice0=${TICK_PRICE_0}  tickStep=${TICK_STEP}`);
  console.log(`  tick prices: ${[0, 1, 2, 3].map((t) => TICK_PRICE_0 + BigInt(t) * TICK_STEP).join(", ")}`);
};

export default func;
func.id = "deploy_veilV2";
func.tags = ["VeilBatchAuctionV2"];
