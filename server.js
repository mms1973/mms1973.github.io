// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { callClaude, callOpenAI, callGemini, callGrok, callDeepSeek } from "./providers.js";
import { saveHistoryEntry, getHistory, clearHistory, getAllResults } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const MODELS = [
  { id: "claude", name: "Claude", fn: callClaude, envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", name: "ChatGPT", fn: callOpenAI, envKey: "OPENAI_API_KEY" },
  { id: "gemini", name: "Gemini", fn: callGemini, envKey: "GEMINI_API_KEY" },
  { id: "grok", name: "Grok", fn: callGrok, envKey: "XAI_API_KEY" },
  { id: "deepseek", name: "DeepSeek", fn: callDeepSeek, envKey: "DEEPSEEK_API_KEY" },
];

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- API routes ----------

// Tells the frontend which models exist and whether the server has a key for each.
app.get("/api/config", (req, res) => {
  const configured = {};
  for (const m of MODELS) configured[m.id] = Boolean(process.env[m.envKey]);
  res.json({
    models: MODELS.map((m) => ({ id: m.id, name: m.name })),
    configured,
  });
});

// Sends the prompt to every configured model in parallel and streams back
// newline-delimited JSON, one line per model as soon as it finishes.
app.post("/api/compare", async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "A non-empty 'prompt' string is required." });
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // avoid proxy buffering (e.g. behind nginx)
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const results = {};

  await Promise.all(
    MODELS.map(async (m) => {
      const start = Date.now();
      let payload;
      try {
        const text = await m.fn(prompt);
        payload = { model: m.id, text, time: (Date.now() - start) / 1000, error: false };
      } catch (err) {
        payload = {
          model: m.id,
          text: err.message || "Unknown error.",
          time: (Date.now() - start) / 1000,
          error: true,
        };
      }
      results[m.id] = payload;
      res.write(JSON.stringify(payload) + "\n");
    })
  );

  try {
    saveHistoryEntry(prompt, results);
  } catch (err) {
    console.error("Failed to save history:", err);
  }

  res.end();
});

app.get("/api/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  res.json(getHistory(limit));
});

app.delete("/api/history", (req, res) => {
  clearHistory();
  res.json({ ok: true });
});

app.get("/api/stats", (req, res) => {
  const all = getAllResults();
  const models = {};
  for (const m of MODELS) {
    const times = all.map((r) => r[m.id]).filter((r) => r && !r.error).map((r) => r.time);
    models[m.id] = {
      ok: times.length,
      total: all.length,
      avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    };
  }
  res.json({ total: all.length, models });
});

// ---------- Static frontend ----------
app.use(express.static(FRONTEND_DIR));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Fallback for unmatched API routes
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Arena backend listening on port ${PORT}`);
});
