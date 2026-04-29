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
exports.uploadData = uploadData;
exports.downloadData = downloadData;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const _0g_ts_sdk_1 = require("@0gfoundation/0g-ts-sdk");
const ethers_1 = require("ethers");
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path.join(__dirname, "../../.env") });
const RPC_URL = process.env.OG_RPC_URL;
const INDEXER_RPC = process.env.OG_STORAGE_INDEXER;
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY;
// AUTH REQUIRED: OG_PRIVATE_KEY, OG_RPC_URL, OG_STORAGE_INDEXER must be set
function getSigner() {
    const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
    return new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
}
function getIndexer() {
    return new _0g_ts_sdk_1.Indexer(INDEXER_RPC);
}
/**
 * Upload a string or JSON object to 0G Storage.
 * @param data - String content to upload
 * @param filename - Logical filename for identification
 * @returns root_hash - Permanent retrieval address
 */
async function uploadData(data, filename) {
    const indexer = getIndexer();
    const signer = getSigner();
    const encoded = new TextEncoder().encode(data);
    const memData = new _0g_ts_sdk_1.MemData(encoded);
    const [tree, treeErr] = await memData.merkleTree();
    if (treeErr !== null) {
        throw new Error(`Merkle tree error: ${treeErr}`);
    }
    const rootHash = tree?.rootHash();
    if (!rootHash) {
        throw new Error("Failed to compute root hash");
    }
    console.log(`[Storage] Uploading '${filename}' root=${rootHash} size=${encoded.length}`);
    const [tx, uploadErr] = await indexer.upload(memData, RPC_URL, signer);
    if (uploadErr !== null) {
        throw new Error(`Upload error: ${uploadErr}`);
    }
    console.log(`[Storage] Uploaded successfully root=${rootHash}`);
    return rootHash;
}
/**
 * Download data from 0G Storage by root hash.
 * @param rootHash - Root hash returned from uploadData
 * @returns data as string
 */
async function downloadData(rootHash) {
    const indexer = getIndexer();
    const tmpPath = path.join(os.tmpdir(), `og_download_${Date.now()}`);
    const err = await indexer.download(rootHash, tmpPath, true);
    if (err !== null) {
        throw new Error(`Download error: ${err}`);
    }
    const content = fs.readFileSync(tmpPath, "utf-8");
    fs.unlinkSync(tmpPath);
    console.log(`[Storage] Downloaded root hash ${rootHash}`);
    return content;
}
