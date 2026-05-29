import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function getVault(hre: any) {
  const { ethers, deployments } = hre;
  const vaultDep = await deployments.get("VeilLendingVault");
  const baseDep = await deployments.get("VeilBase");
  const quoteDep = await deployments.get("VeilQuote");
  const vault = await ethers.getContractAt("VeilLendingVault", vaultDep.address);
  const base = await ethers.getContractAt("MockConfidentialToken", baseDep.address);
  const quote = await ethers.getContractAt("MockConfidentialToken", quoteDep.address);
  return {
    vaultAddress: vaultDep.address,
    vault,
    baseAddress: baseDep.address,
    base,
    quoteAddress: quoteDep.address,
    quote,
  };
}

task("task:vault:address", "Prints the vault + registry addresses").setAction(async (_, hre) => {
  const { deployments } = hre;
  const vault = await deployments.get("VeilLendingVault");
  const reg = await deployments.get("VeilRegulatorRegistry");
  console.log("VeilLendingVault:     ", vault.address);
  console.log("VeilRegulatorRegistry:", reg.address);
});

task("task:vault:seed", "Mints vUSDC liquidity into the lending vault")
  .addOptionalParam("amount", "vUSDC amount to mint into the vault (default 10_000_000)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const amount = args.amount ? Number(args.amount) : 10_000_000;
    const { vaultAddress, quote, quoteAddress } = await getVault(hre);
    const [deployer] = await ethers.getSigners();

    const input = await fhevm.createEncryptedInput(quoteAddress, deployer.address).add64(amount).encrypt();
    const tx = await quote.connect(deployer).mint(vaultAddress, input.handles[0], input.inputProof);
    await tx.wait();
    console.log(`Seeded vault with ${amount} vUSDC at ${vaultAddress}: ${tx.hash}`);
  });

task("task:vault:status", "Prints vault parameters and (if --user is set) a user's encrypted position handles")
  .addOptionalParam("user", "User address to inspect")
  .setAction(async (args: TaskArguments, hre) => {
    const { vault, vaultAddress } = await getVault(hre);
    const price: bigint = await vault.price();
    const ltv: bigint = await vault.ltvBps();
    const bonus: bigint = await vault.liquidationBonusBps();
    console.log("VeilLendingVault:    ", vaultAddress);
    console.log("price:               ", price.toString());
    console.log("ltvBps:              ", ltv.toString());
    console.log("liquidationBonusBps: ", bonus.toString());
    if (args.user) {
      const exists: boolean = await vault.positionExists(args.user);
      console.log(`positionExists(${args.user}):`, exists);
      if (exists) {
        const c: string = await vault.getCollateral(args.user);
        const d: string = await vault.getDebt(args.user);
        console.log("  collateral handle:", c);
        console.log("  debt handle:      ", d);
      }
    }
  });

task("task:vault:liquidate", "Calls liquidate(borrower) on the vault")
  .addParam("borrower", "Borrower address to liquidate")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const { vault } = await getVault(hre);
    const [signer] = await ethers.getSigners();
    const tx = await vault.connect(signer).liquidate(args.borrower);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:vault:my-position", "User-decrypt my collateral + debt handles")
  .setAction(async (_: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const { vault, vaultAddress } = await getVault(hre);
    const [signer] = await ethers.getSigners();
    const exists: boolean = await vault.positionExists(signer.address);
    if (!exists) {
      console.log(`No position for ${signer.address}`);
      return;
    }
    const cHandle: string = await vault.getCollateral(signer.address);
    const dHandle: string = await vault.getDebt(signer.address);
    const c = cHandle === ZERO_HANDLE ? 0n : await fhevm.userDecryptEuint(FhevmType.euint64, cHandle, vaultAddress, signer);
    const d = dHandle === ZERO_HANDLE ? 0n : await fhevm.userDecryptEuint(FhevmType.euint64, dHandle, vaultAddress, signer);
    console.log(`collateral: ${c.toString()}  debt: ${d.toString()}`);
  });
