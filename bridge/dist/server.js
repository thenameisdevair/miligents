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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path.join(__dirname, "../../.env") });
const storage_1 = require("./storage");
const inft_1 = require("./inft");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = parseInt(process.env.BRIDGE_PORT || "3100");
// ─── Health ───────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// ─── Storage ──────────────────────────────────────────────
app.post("/storage/upload", async (req, res) => {
    try {
        const { data, filename } = req.body;
        if (!data || !filename) {
            res.status(400).json({ error: "data and filename are required" });
            return;
        }
        const root_hash = await (0, storage_1.uploadData)(typeof data === "string" ? data : JSON.stringify(data), filename);
        res.json({ root_hash });
    }
    catch (err) {
        console.error("[Bridge] /storage/upload error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.get("/storage/download", async (req, res) => {
    try {
        const hash = req.query.hash;
        if (!hash) {
            res.status(400).json({ error: "hash query parameter is required" });
            return;
        }
        const data = await (0, storage_1.downloadData)(hash);
        res.json({ data });
    }
    catch (err) {
        console.error("[Bridge] /storage/download error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── iNFT ─────────────────────────────────────────────────
app.post("/inft/mint", async (req, res) => {
    try {
        const { root_hash, metadata } = req.body;
        if (!root_hash || !metadata) {
            res.status(400).json({ error: "root_hash and metadata are required" });
            return;
        }
        const token_id = await (0, inft_1.mintINFT)(root_hash, metadata);
        res.json({ token_id });
    }
    catch (err) {
        console.error("[Bridge] /inft/mint error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.get("/inft/get", async (req, res) => {
    try {
        const token_id = req.query.token_id;
        if (!token_id) {
            res.status(400).json({ error: "token_id query parameter is required" });
            return;
        }
        const inft = await (0, inft_1.getINFT)(token_id);
        res.json(inft);
    }
    catch (err) {
        console.error("[Bridge] /inft/get error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.post("/inft/update", async (req, res) => {
    try {
        const { token_id, root_hash, metadata } = req.body;
        if (!token_id || !root_hash || !metadata) {
            res.status(400).json({
                error: "token_id, root_hash and metadata are required"
            });
            return;
        }
        await (0, inft_1.updateINFT)(token_id, root_hash, metadata);
        res.json({ success: true, token_id });
    }
    catch (err) {
        console.error("[Bridge] /inft/update error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Bridge] MiliGents bridge service running on port ${PORT}`);
    console.log(`[Bridge] Health: http://localhost:${PORT}/health`);
});
exports.default = app;
