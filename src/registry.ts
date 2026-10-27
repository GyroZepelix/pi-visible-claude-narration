import { isNarrationSignature } from "./signature.js";

/** Narration texts (trimmed) collected from finalized assistant messages. */
export class NarrationRegistry {
  private readonly texts = new Set<string>();

  get size(): number {
    return this.texts.size;
  }

  values(): ReadonlySet<string> {
    return this.texts;
  }

  has(text: string): boolean {
    return this.texts.has(text.trim());
  }

  clear(): void {
    this.texts.clear();
  }

  /** Adds every narration thinking block of an assistant message. Returns how many were found. */
  addFromMessage(message: unknown): number {
    let found = 0;
    for (const text of narrationTexts(message)) {
      this.texts.add(text);
      found++;
    }
    return found;
  }

  /** Replaces the contents with narration from every assistant message entry. */
  rebuildFromEntries(entries: readonly unknown[]): void {
    this.texts.clear();
    for (const entry of entries) {
      if (isRecord(entry) && entry["type"] === "message") this.addFromMessage(entry["message"]);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Trimmed, non-empty texts of the narration thinking blocks in an assistant message. */
export function narrationTexts(message: unknown): string[] {
  if (!isRecord(message) || message["role"] !== "assistant" || !Array.isArray(message["content"])) return [];
  const texts: string[] = [];
  for (const block of message["content"]) {
    if (!isRecord(block) || block["type"] !== "thinking" || block["redacted"] === true) continue;
    const thinking = block["thinking"];
    if (typeof thinking !== "string") continue;
    const text = thinking.trim();
    if (text && isNarrationSignature(block["thinkingSignature"])) texts.push(text);
  }
  return texts;
}
