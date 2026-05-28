import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const BATCH_BLOCKS = 10;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const veil = await deploy("VeilBatchAuction", {
    from: deployer,
    args: [BATCH_BLOCKS],
    log: true,
  });

  console.log(`VeilBatchAuction deployed at: ${veil.address}`);
  console.log(`  batchBlocks=${BATCH_BLOCKS}`);
};
export default func;
func.id = "deploy_veilBatchAuction";
func.tags = ["VeilBatchAuction"];
