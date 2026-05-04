import express, { Request, Response } from "express";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import { uploadData, downloadData } from "./storage";
import { mintINFT, getINFT, updateINFT } from "./inft";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || process.env.BRIDGE_PORT || "3100");

// ─── Health ───────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Storage ──────────────────────────────────────────────

app.post("/storage/upload", async (req: Request, res: Response) => {
  try {
    const { data, filename } = req.body;
    if (!data || !filename) {
      res.status(400).json({ error: "data and filename are required" });
      return;
    }
    const root_hash = await uploadData(
      typeof data === "string" ? data : JSON.stringify(data),
      filename
    );
    res.json({ root_hash });
  } catch (err: any) {
    console.error("[Bridge] /storage/upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/storage/download", async (req: Request, res: Response) => {
  try {
    const hash = req.query.hash as string;
    if (!hash) {
      res.status(400).json({ error: "hash query parameter is required" });
      return;
    }
    const data = await downloadData(hash);
    res.json({ data });
  } catch (err: any) {
    console.error("[Bridge] /storage/download error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── iNFT ─────────────────────────────────────────────────

app.post("/inft/mint", async (req: Request, res: Response) => {
  try {
    const { root_hash, metadata } = req.body;
    if (!root_hash || !metadata) {
      res.status(400).json({ error: "root_hash and metadata are required" });
      return;
    }
    const minted = await mintINFT(root_hash, metadata);
    res.json(minted);
  } catch (err: any) {
    console.error("[Bridge] /inft/mint error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/inft/get", async (req: Request, res: Response) => {
  try {
    const token_id = req.query.token_id as string;
    if (!token_id) {
      res.status(400).json({ error: "token_id query parameter is required" });
      return;
    }
    const inft = await getINFT(token_id);
    res.json(inft);
  } catch (err: any) {
    console.error("[Bridge] /inft/get error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/inft/update", async (req: Request, res: Response) => {
  try {
    const { token_id, root_hash, metadata } = req.body;
    if (!token_id || !root_hash || !metadata) {
      res.status(400).json({
        error: "token_id, root_hash and metadata are required"
      });
      return;
    }
    await updateINFT(token_id, root_hash, metadata);
    res.json({ success: true, token_id });
  } catch (err: any) {
    console.error("[Bridge] /inft/update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Bridge] MiliGents bridge service running on port ${PORT}`);
  console.log(`[Bridge] Health: http://localhost:${PORT}/health`);
});

export default app;
