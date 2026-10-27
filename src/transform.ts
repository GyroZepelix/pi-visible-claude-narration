import type { MarkdownTransformer, Theme } from "@earendil-works/pi-coding-agent";
import { Marked } from "@earendil-works/pi-tui";

/** The theme members the transformer reads. */
export type ThemeLike = Pick<Theme, "getFgAnsi" | "italic">;

/** ANSI sequences inserted into narration Markdown. */
export interface NarrationStyle {
  /** Starts every inline text run: italic off plus the `text` foreground. */
  open: string;
  /** Starts text runs inside Markdown emphasis: the `text` foreground with italic kept on. */
  emphasisOpen: string;
  /** Inserted once before the first text run: accent `> ` marker. */
  marker: string;
}

/** The registry view the transformer needs. */
export interface NarrationSource {
  readonly size: number;
  values(): ReadonlySet<string>;
}

const SGR = /^\x1b\[([0-9;]*)m([\s\S]*)$/;
const SENTINEL = "\u0000";

/**
 * Builds the narration style from the active theme.
 *
 * pi-tui applies the thinking style through chalk, which rewrites a bare
 * `ESC[23m` (italic off) inside the styled text into `ESC[23mESC[3m`, so
 * italic stays on. Folding italic-off into the foreground sequence
 * (`ESC[23;38;2;r;g;bm`) avoids that rewrite.
 */
export function styleFromTheme(theme: ThemeLike): NarrationStyle {
  const italicSample = theme.italic(SENTINEL);
  const italicActive = italicSample !== SENTINEL;
  const italicOn = italicActive ? italicSample.slice(0, Math.max(0, italicSample.indexOf(SENTINEL))) : "";
  const withItalicOff = (fgAnsi: string): string => {
    if (!italicActive) return fgAnsi;
    const match = SGR.exec(fgAnsi);
    return match && match[1] ? `\x1b[23;${match[1]}m${match[2]}` : `\x1b[23;23m${fgAnsi}`;
  };
  const accent = theme.getFgAnsi("accent");
  // A faint accent token adds SGR 2; close it so it does not leak into the narration.
  const accentClose = accent.includes("\x1b[2m") ? "\x1b[22m" : "";
  const text = theme.getFgAnsi("text");
  return {
    open: withItalicOff(text),
    emphasisOpen: `${text}${italicOn}`,
    marker: `${withItalicOff(accent)}> ${accentClose}`,
  };
}

interface Token {
  type: string;
  raw: string;
  tokens?: Token[];
  items?: Token[];
}

interface Insert {
  at: number;
  text: string;
}

const lexer = new Marked();

/** Block and inline containers whose children render with the default (thinking) style. */
const CONTAINERS = new Set(["paragraph", "text", "list_item", "strong", "em", "del"]);
/** Inline tokens closed by delimiter runs. */
const DELIMITED = new Set(["strong", "em", "del"]);
const WS_OR_PUNCT = /^[\s\p{P}\p{S}]/u;
const PUNCT_AT_END = /[\p{P}\p{S}]$/u;
/** Tokens that may start a line without changing block parsing when preceded by the marker. */
const MARKER_TARGETS = new Set(["text", "codespan", "link", "escape", "html", "br"]);

/**
 * Inserts `style.open` at the start of every inline run that pi-tui would
 * otherwise restyle with the thinking color and italic, and `style.marker`
 * once before the first run. Returns undefined when nothing can be styled.
 * Only insertions are made, so removing them yields the input unchanged.
 */
export function styleNarrationMarkdown(narration: string, style: NarrationStyle): string | undefined {
  const tokens = lexer.lexer(narration) as unknown as Token[];
  const inserts: Insert[] = [];
  collect(tokens, narration, 0, style.open, inserts, style);
  if (inserts.length === 0) return undefined;
  const markerAt = markerOffset(tokens, narration, 0) ?? inserts[0]!.at;
  const markerIndex = inserts.findIndex((insert) => insert.at >= markerAt);
  inserts.splice(markerIndex < 0 ? inserts.length : markerIndex, 0, { at: markerAt, text: style.marker });
  let out = "";
  let last = 0;
  for (const insert of inserts) {
    out += narration.slice(last, insert.at) + insert.text;
    last = insert.at;
  }
  return out + narration.slice(last);
}

function collect(
  tokens: readonly Token[],
  parentRaw: string,
  parentOffset: number,
  open: string,
  inserts: Insert[],
  style: NarrationStyle,
): void {
  let cursor = 0;
  let previous: Token | undefined;
  for (const token of tokens) {
    const type = token.type;
    const raw = typeof token.raw === "string" ? token.raw : "";
    const index = raw ? parentRaw.indexOf(raw, cursor) : -1;
    if (index < 0) {
      // Cannot locate this token in its parent source; leave it unstyled.
      previous = token;
      continue;
    }
    cursor = index + raw.length;
    const offset = parentOffset + index;
    if (type === "list" && Array.isArray(token.items)) {
      collect(token.items, raw, offset, open, inserts, style);
    } else if (type === "list_item" && Array.isArray(token.tokens)) {
      collect(token.tokens, raw, offset, open, inserts, style);
    } else if (CONTAINERS.has(type) && Array.isArray(token.tokens) && token.tokens.length > 0) {
      collect(token.tokens, raw, offset, type === "em" ? style.emphasisOpen : open, inserts, style);
    } else if (type === "text") {
      textRunInserts(raw, offset, followerSensitive(previous), open, inserts);
    }
    // Escapes and inline html render as separate segments that always carry the
    // thinking style; no insertion point reaches them, so they stay as they are.
    previous = token;
  }
}

/**
 * Offset where the narration's first block starts its inline content: before
 * the first inline token, or inside a leading strong, em, or del so delimiter
 * flanking is unchanged. Undefined when the narration starts with another block.
 */
function markerOffset(tokens: readonly Token[], parentRaw: string, parentOffset: number): number | undefined {
  const token = tokens.find((candidate) => candidate.type !== "space" && typeof candidate.raw === "string" && candidate.raw);
  if (!token) return undefined;
  const index = parentRaw.indexOf(token.raw);
  if (index < 0) return undefined;
  const offset = parentOffset + index;
  if (token.type === "list") {
    const item = token.items?.[0];
    if (!item) return undefined;
    const itemIndex = token.raw.indexOf(item.raw);
    return itemIndex < 0 ? undefined : markerOffset(item.tokens ?? [], item.raw, offset + itemIndex);
  }
  if (Array.isArray(token.tokens) && token.tokens.length > 0 && (token.type === "paragraph" || token.type === "text" || DELIMITED.has(token.type))) {
    return markerOffset(token.tokens, token.raw, offset);
  }
  return MARKER_TARGETS.has(token.type) ? offset : undefined;
}

/**
 * Whether the closing delimiter run of `previous` stays a closer only because
 * of the character after it (an `_` closer, or a closer preceded by
 * punctuation). An escape sequence there would break the emphasis.
 */
function followerSensitive(previous: Token | undefined): boolean {
  if (previous === undefined || !DELIMITED.has(previous.type)) return false;
  if (previous.raw.endsWith("_")) return true;
  return PUNCT_AT_END.test(previous.raw.replace(/[*~]+$/, ""));
}

function textRunInserts(raw: string, offset: number, keepFirstChar: boolean, open: string, inserts: Insert[]): void {
  // Keep the first character next to a follower-sensitive closer; it stays in the thinking style.
  const first = raw.codePointAt(0);
  const start = keepFirstChar && first !== undefined && WS_OR_PUNCT.test(raw) ? String.fromCodePoint(first).length : 0;
  if (start < raw.length && raw[start] !== "\n") inserts.push({ at: offset + start, text: open });
  // pi-tui restyles each line of a text run separately.
  for (let i = raw.indexOf("\n"); i >= 0; i = raw.indexOf("\n", i + 1)) {
    let next = i + 1;
    while (next < raw.length && (raw[next] === " " || raw[next] === "\t")) next++;
    if (next < raw.length && raw[next] !== "\n" && next > start) inserts.push({ at: offset + next, text: open });
  }
}

/** Finds every narration that occupies whole blocks of the joined thinking Markdown. */
export function findNarrationRanges(markdown: string, narrations: Iterable<string>): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];
  for (const text of narrations) {
    if (!text) continue;
    for (let start = markdown.indexOf(text); start >= 0; start = markdown.indexOf(text, start + 1)) {
      const end = start + text.length;
      const blockStart = start === 0 || (start >= 2 && markdown.startsWith("\n\n", start - 2));
      const blockEnd = end === markdown.length || markdown.startsWith("\n\n", end);
      if (blockStart && blockEnd) ranges.push({ start, end, text });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const disjoint: typeof ranges = [];
  for (const range of ranges) {
    const last = disjoint[disjoint.length - 1];
    if (!last || range.start >= last.end) disjoint.push(range);
  }
  return disjoint;
}

const CACHE_LIMIT = 500;

/** Restyles every registered narration found in the joined thinking Markdown. */
export function styleNarration(
  markdown: string,
  narrations: Iterable<string>,
  style: NarrationStyle,
  cache: Map<string, string | undefined> = new Map(),
): string {
  const ranges = findNarrationRanges(markdown, narrations);
  if (ranges.length === 0) return markdown;
  let out = "";
  let last = 0;
  for (const range of ranges) {
    const key = [style.open, style.emphasisOpen, style.marker, range.text].join(SENTINEL);
    let styled: string | undefined;
    if (cache.has(key)) {
      styled = cache.get(key);
    } else {
      styled = styleNarrationMarkdown(range.text, style);
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, styled);
    }
    out += markdown.slice(last, range.start) + (styled ?? range.text);
    last = range.end;
  }
  return out + markdown.slice(last);
}

/**
 * Markdown transformer that restyles registered narration inside joined
 * thinking Markdown. Reads the theme lazily on every call so theme changes
 * apply, and returns the input unchanged on any error.
 */
export function createNarrationTransformer(source: NarrationSource, getTheme: () => ThemeLike | undefined): MarkdownTransformer {
  const cache = new Map<string, string | undefined>();
  return (markdown, context) => {
    try {
      if (context.messageType !== "assistant-thinking" || source.size === 0 || typeof markdown !== "string") return markdown;
      const theme = getTheme();
      if (!theme) return markdown;
      return styleNarration(markdown, source.values(), styleFromTheme(theme), cache);
    } catch {
      return markdown;
    }
  };
}
