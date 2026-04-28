import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MiliGentsINFT with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "0G");

  const INFT = await ethers.getContractFactory("MiliGentsINFT");
  const inft = await INFT.deploy();
  await inft.waitForDeployment();

  const address = await inft.getAddress();
  console.log("MiliGentsINFT deployed to:", address);
  console.log("Add this to your .env: OG_INFT_CONTRACT_ADDRESS=" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
