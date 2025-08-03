import express from "express";
import { requireAuth } from "./auth.js";
import fs from "fs/promises";
import path from "path";

const router = express.Router();

// directory & file where we’ll collect the reports
const DATA_DIR  = path.resolve("data");               // e.g. ./data
const FILE_PATH = path.join(DATA_DIR, "bugReports.jsonl"); // JSON-lines file

// ensure data folder exists on first import
await fs.mkdir(DATA_DIR, { recursive: true });

/*  POST /api/bugreport
    Body: { description: "…" }
    Header (optional): Authorization: Bearer …
*/
router.post("/", requireAuth, async (req, res) => {
  // ── DEBUG: dump request ─────────────────────────────
  console.log("—— /bugreport hit ——");
  console.log("Headers:", req.headers);
  console.log("Body   :", req.body);
  // ────────────────────────────────────────────────────

  try {
    const { description = "" } = req.body;

    if (!description.trim()) {
      console.log("⛔ No description – rejecting");
      return res.status(400).json({ error: "Description required" });
    }

    const entry = {
      id         : crypto.randomUUID(),
      userId     : req.userId ?? null,
      createdAt  : new Date().toISOString(),
      description: description.trim()
    };

    await fs.appendFile(FILE_PATH, JSON.stringify(entry) + "\n", "utf8");
    console.log("✅ Bug saved ->", FILE_PATH);

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("[BUG REPORT FILE] Fatal:", err);
    res.status(500).json({ error: "Failed to log bug" });
  }
});

export default router;