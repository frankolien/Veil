import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

async function getV2(hre: any) {
  const { ethers, deployments } = hre;
  const dep = await deployments.get("VeilBatchAuctionV2");
  const veil = await ethers.getContractAt("VeilBatchAuctionV2", dep.address);
  const baseDep = await deployments.get("VeilBase");
  const quoteDep = await deployments.get("VeilQuote");
  const base = await ethers.getContractAt("MockConfidentialToken", baseDep.address);
  const quote = await ethers.getContractAt("MockConfidentialToken", quoteDep.address);
  return {
    veilAddress: dep.address,
    veil,
    baseAddress: baseDep.address,
    base,
    quoteAddress: quoteDep.address,
    quote,
  };
}

task("task:veil-v2:address", "Prints the v2 deployment addresses").setAction(async (_: TaskArguments, hre) => {
  const { veilAddress, baseAddress, quoteAddress } = await getV2(hre);
  console.log("VeilBatchAuctionV2:", veilAddress);
  console.log("VeilBase (vWETH): ", baseAddress);
  console.log("VeilQuote (vUSDC):", quoteAddress);
});

task("task:veil-v2:faucet", "Mints demo balances of vWETH and vUSDC to an address")
  .addParam("to", "Recipient address")
  .addOptionalParam("base", "vWETH amount (default 1000)")
  .addOptionalParam("quote", "vUSDC amount (default 5_000_000)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const baseAmount = args.base ? Number(args.base) : 1000;
    const quoteAmount = args.quote ? Number(args.quote) : 5_000_000;
    const recipient = ethers.getAddress(args.to);

    const { base, baseAddress, quote, quoteAddress } = await getV2(hre);
    const [deployer] = await ethers.getSigners();

    const baseInput = await fhevm.createEncryptedInput(baseAddress, deployer.address).add64(baseAmount).encrypt();
    const qBase = await base.connect(deployer).mint(recipient, baseInput.handles[0], baseInput.inputProof);
    await qBase.wait();

    const quoteInput = await fhevm.createEncryptedInput(quoteAddress, deployer.address).add64(quoteAmount).encrypt();
    const qQuote = await quote.connect(deployer).mint(recipient, quoteInput.handles[0], quoteInput.inputProof);
    await qQuote.wait();

    console.log(`Minted ${baseAmount} vWETH and ${quoteAmount} vUSDC to ${recipient}`);
    console.log(`Reminder: trader must call setOperator on each token before placeOrder.`);
  });
