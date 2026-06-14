// db.js
// Lightweight JSON-file-backed storage for prompt history and stats.
// No native dependencies — keeps Docker builds simple and portable.
// The data file lives at backend/data/history.json (created automatically).
//
// For production use with multiple instances or large history, swap this
// for a real database (e.g. RDS/Postgres or DynamoDB) — only this file
// needs to change.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const filePath = path.join(dataDir, "history.json");

const MAX_ROWS = 200;

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");

function readAll() {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  // Atomic-ish write: write to temp file then rename.
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(rows), "utf8");
  fs.renameSync(tmpPath, filePath);
}

let nextId = readAll().reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;

export function saveHistoryEntry(prompt, results) {
  const rows = readAll();
  rows.unshift({
    id: nextId++,
    prompt,
    created_at: new Date().toISOString(),
    results,
  });
  writeAll(rows.slice(0, MAX_ROWS));
}

export function getHistory(limit = 25) {
  return readAll().slice(0, limit);
}

export function clearHistory() {
  writeAll([]);
}

export function getAllResults() {
  return readAll().map((r) => r.results);
}
