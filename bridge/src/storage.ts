import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Indexer, MemData } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });

const RPC_URL = process.env.OG_RPC_URL!;
const INDEXER_RPC = process.env.OG_STORAGE_INDEXER!;
const PRIVATE_KEY = process.env.OG_PRIVATE_KEY!;

// AUTH REQUIRED: OG_PRIVATE_KEY, OG_RPC_URL, OG_STORAGE_INDEXER must be set

function getSigner(): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Wallet(PRIVATE_KEY, provider);
}

function getIndexer(): Indexer {
  return new Indexer(INDEXER_RPC);
}

/**
 * Upload a string or JSON object to 0G Storage.
 * @param data - String content to upload
 * @param filename - Logical filename for identification
 * @returns root_hash - Permanent retrieval address
 */
export async function uploadData(
  data: string,
  filename: string
): Promise<string> {
  const indexer = getIndexer();
  const signer = getSigner();

  const encoded = new TextEncoder().encode(data);

  // 0G Storage minimum chunk size is 256 bytes
  const MIN_SIZE = 256;
  let paddedData: Uint8Array;
  if (encoded.length < MIN_SIZE) {
    paddedData = new Uint8Array(MIN_SIZE);
    paddedData.set(encoded);
  } else {
    paddedData = encoded;
  }

  const memData = new MemData(paddedData);

  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree error: ${treeErr}`);
  }

  const rootHash = tree?.rootHash();
  if (!rootHash) {
    throw new Error("Failed to compute root hash");
  }

  const [tx, uploadErr] = await indexer.upload(
    memData,
    RPC_URL,
    signer,
    {
      gasPrice: undefined,
      value: BigInt("100000000000000000")  // 0.1 OG in wei
    }
  );
  if (uploadErr !== null) {
    throw new Error(`Upload error: ${uploadErr}`);
  }

  console.log(`[Storage] Uploaded '${filename}' → root hash: ${rootHash}`);
  return rootHash;
}

/**
 * Download data from 0G Storage by root hash.
 * @param rootHash - Root hash returned from uploadData
 * @returns data as string
 */
export async function downloadData(rootHash: string): Promise<string> {
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
