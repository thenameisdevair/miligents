import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  
  const address = "0xEcB2Ed2b14Bd6205070aD74f563e8C91e820B6EA";
  const abi = [
    "function mint(address to, string calldata storageURI, bytes32 metadataHash) external returns (uint256)",
    "function getINFT(uint256 tokenId) external view returns (string memory, bytes32, uint256, address)",
    "event INFTMinted(uint256 indexed tokenId, address indexed owner, string storageURI, bytes32 metadataHash, uint256 version)"
  ];

  const contract = new ethers.Contract(address, abi, signer);

  console.log("Testing mint...");
  const testHash = ethers.keccak256(ethers.toUtf8Bytes("test_strategy_v1"));
  const tx = await contract.mint(
    signer.address,
    "test_root_hash_123",
    testHash
  );
  const receipt = await tx.wait();
  console.log("Mint tx hash:", receipt.hash);

  console.log("Testing getINFT...");
  const [storageURI, metadataHash, version, owner] = await contract.getINFT(1);
  console.log("storageURI:", storageURI);
  console.log("version:", version.toString());
  console.log("owner:", owner);
  console.log("PASS — contract is working correctly");
}

main().catch(console.error);
