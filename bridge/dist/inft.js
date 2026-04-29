"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintINFT = mintINFT;
exports.getINFT = getINFT;
exports.updateINFT = updateINFT;
const ethers_1 = require("ethers");
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path.join(__dirname, "../../.env") });
const RPC_URL = process.env.OG_RPC_URL;
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.OG_INFT_CONTRACT_ADDRESS;
// AUTH REQUIRED: OG_PRIVATE_KEY and OG_INFT_CONTRACT_ADDRESS must be set
const INFT_ABI = [
    "function mint(address to, string calldata storageURI, bytes32 metadataHash) external returns (uint256)",
    "function updateStrategy(uint256 tokenId, string calldata newStorageURI, bytes32 newMetadataHash) external",
    "function getINFT(uint256 tokenId) external view returns (string memory storageURI, bytes32 metadataHash, uint256 version, address owner)",
    "event INFTMinted(uint256 indexed tokenId, address indexed owner, string storageURI, bytes32 metadataHash, uint256 version)",
    "event INFTUpdated(uint256 indexed tokenId, string newStorageURI, bytes32 newMetadataHash, uint256 newVersion)"
];
function getContract() {
    const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
    return new ethers_1.ethers.Contract(CONTRACT_ADDRESS, INFT_ABI, signer);
}
/**
 * Mint a new iNFT representing an agent strategy version.
 * @param rootHash - 0G Storage root hash of the strategy data
 * @param metadata - Strategy metadata object
 * @returns token_id as string
 */
async function mintINFT(rootHash, metadata) {
    const contract = getContract();
    const signer = new ethers_1.ethers.Wallet(PRIVATE_KEY, new ethers_1.ethers.JsonRpcProvider(RPC_URL));
    const metadataStr = JSON.stringify(metadata);
    const metadataHash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(metadataStr));
    const tx = await contract.mint(signer.address, rootHash, metadataHash);
    const receipt = await tx.wait();
    // Parse tokenId from INFTMinted event
    const iface = new ethers_1.ethers.Interface(INFT_ABI);
    for (const log of receipt.logs) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "INFTMinted") {
                const tokenId = parsed.args.tokenId.toString();
                console.log(`[iNFT] Minted token ID: ${tokenId} → root hash: ${rootHash}`);
                return tokenId;
            }
        }
        catch { }
    }
    throw new Error("INFTMinted event not found in transaction receipt");
}
/**
 * Get iNFT data by token ID.
 * @param tokenId - Token ID from mintINFT
 * @returns { root_hash, metadata_hash, version, owner }
 */
async function getINFT(tokenId) {
    const contract = getContract();
    const [storageURI, metadataHash, version, owner] = await contract.getINFT(BigInt(tokenId));
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
async function updateINFT(tokenId, newRootHash, newMetadata) {
    const contract = getContract();
    const metadataStr = JSON.stringify(newMetadata);
    const metadataHash = ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(metadataStr));
    const tx = await contract.updateStrategy(BigInt(tokenId), newRootHash, metadataHash);
    await tx.wait();
    console.log(`[iNFT] Updated token ID: ${tokenId} → new root hash: ${newRootHash}`);
}
