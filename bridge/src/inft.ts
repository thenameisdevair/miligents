import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });

const RPC_URL = process.env.OG_RPC_URL!;
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY!;
const CONTRACT_ADDRESS = process.env.OG_INFT_CONTRACT_ADDRESS!;

// AUTH REQUIRED: OG_PRIVATE_KEY and OG_INFT_CONTRACT_ADDRESS must be set

const INFT_ABI = [
  "function mint(address to, string calldata storageURI, bytes32 metadataHash) external returns (uint256)",
  "function updateStrategy(uint256 tokenId, string calldata newStorageURI, bytes32 newMetadataHash) external",
  "function getINFT(uint256 tokenId) external view returns (string memory storageURI, bytes32 metadataHash, uint256 version, address owner)",
  "event INFTMinted(uint256 indexed tokenId, address indexed owner, string storageURI, bytes32 metadataHash, uint256 version)",
  "event INFTUpdated(uint256 indexed tokenId, string newStorageURI, bytes32 newMetadataHash, uint256 newVersion)"
];

function getContract(): ethers.Contract {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  return new ethers.Contract(CONTRACT_ADDRESS, INFT_ABI, signer);
}

/**
 * Mint a new iNFT representing an agent strategy version.
 * @param rootHash - 0G Storage root hash of the strategy data
 * @param metadata - Strategy metadata object
 * @returns token_id as string
 */
export async function mintINFT(
  rootHash: string,
  metadata: object
): Promise<string> {
  const contract = getContract();
  const signer = new ethers.Wallet(
    PRIVATE_KEY,
    new ethers.JsonRpcProvider(RPC_URL)
  );

  const metadataStr = JSON.stringify(metadata);
  const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(metadataStr));

  const tx = await contract.mint(
    signer.address,
    rootHash,
    metadataHash
  );

  const receipt = await tx.wait();

  // Parse tokenId from INFTMinted event
  const iface = new ethers.Interface(INFT_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "INFTMinted") {
        const tokenId = parsed.args.tokenId.toString();
        console.log(`[iNFT] Minted token ID: ${tokenId} → root hash: ${rootHash}`);
        return tokenId;
      }
    } catch {}
  }

  throw new Error("INFTMinted event not found in transaction receipt");
}

/**
 * Get iNFT data by token ID.
 * @param tokenId - Token ID from mintINFT
 * @returns { root_hash, metadata_hash, version, owner }
 */
export async function getINFT(tokenId: string): Promise<{
  root_hash: string;
  metadata_hash: string;
  version: number;
  owner: string;
}> {
  const contract = getContract();
  const [storageURI, metadataHash, version, owner] =
    await contract.getINFT(BigInt(tokenId));

  return {
    root_hash: storageURI,
    metadata_hash: metadataHash,
    version: Number(version),
    owner
  };
}

/**
 * Update an existing iNFT with a new strategy version.
 * @param tokenId - Existing token ID to update
 * @param newRootHash - New 0G Storage root hash
 * @param newMetadata - Updated metadata object
 */
export async function updateINFT(
  tokenId: string,
  newRootHash: string,
  newMetadata: object
): Promise<void> {
  const contract = getContract();
  const metadataStr = JSON.stringify(newMetadata);
  const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(metadataStr));

  const tx = await contract.updateStrategy(
    BigInt(tokenId),
    newRootHash,
    metadataHash
  );

  await tx.wait();
  console.log(`[iNFT] Updated token ID: ${tokenId} → new root hash: ${newRootHash}`);
}
