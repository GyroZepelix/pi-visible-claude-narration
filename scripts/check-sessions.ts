/**
 * Local, read-only check of narration detection against real pi sessions.
 *
 * Reads ~/.pi/agent/sessions/<dir>/*.jsonl (or PI_SESSIONS_DIR) at runtime and
 * prints, per model, how many assistant messages carry thinking signatures,
 * how many contain a narration block, and how many of those also contain a
 * `text` block. Prints counts only: no signatures or message text, and it
 * writes nothing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { narrationTexts } from "../src/registry.js";

interface ModelCounts {
  signed: number;
  narration: number;
  narrationWithText: number;
}

const root = process.env["PI_SESSIONS_DIR"] ?? join(homedir(), ".pi", "agent", "sessions");

function sessionFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    for (const file of readdirSync(path)) {
      if (file.endsWith(".jsonl")) files.push(join(path, file));
    }
  }
  return files;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const counts = new Map<string, ModelCounts>();
let files = 0;
let unreadable = 0;

for (const file of sessionFiles(root)) {
  files++;
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    unreadable++;
    continue;
  }
  for (const line of content.split("\n")) {
    if (!line.includes('"thinkingSignature"')) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(entry) || entry["type"] !== "message" || !isRecord(entry["message"])) continue;
    const message = entry["message"];
    if (message["role"] !== "assistant" || !Array.isArray(message["content"])) continue;
    const blocks = message["content"].filter(isRecord);
    if (!blocks.some((block) => block["type"] === "thinking" && typeof block["thinkingSignature"] === "string")) continue;
    const model = typeof message["model"] === "string" ? message["model"] : "(unknown)";
    const row = counts.get(model) ?? { signed: 0, narration: 0, narrationWithText: 0 };
    row.signed++;
    if (narrationTexts(message).length > 0) {
      row.narration++;
      if (blocks.some((block) => block["type"] === "text" && typeof block["text"] === "string" && block["text"].trim())) {
        row.narrationWithText++;
      }
    }
    counts.set(model, row);
  }
}

const rows = [...counts.entries()].sort((a, b) => b[1].signed - a[1].signed);
console.log(`Scanned ${files} session files under ${root}${unreadable ? ` (${unreadable} unreadable)` : ""}.`);
console.log("model | assistant messages with signatures | with narration | narration plus text");
for (const [model, row] of rows) {
  console.log(`${model} | ${row.signed} | ${row.narration} | ${row.narrationWithText}`);
}
const narrationModels = rows.filter(([, row]) => row.narration > 0).map(([model]) => model);
const withText = rows.reduce((sum, [, row]) => sum + row.narrationWithText, 0);
console.log(`Models with narration: ${narrationModels.join(", ") || "none"}`);
console.log(`Narration messages that also contain a text block: ${withText}`);
