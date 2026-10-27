import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Markdown } from "@earendil-works/pi-tui";
import type { MarkdownTransformContext } from "@earendil-works/pi-coding-agent";
import {
  createNarrationTransformer,
  findNarrationRanges,
  styleFromTheme,
  styleNarration,
  styleNarrationMarkdown,
  type ThemeLike,
} from "../src/transform.js";
import { COLORS, markdownTheme, stubTheme, styledChars, thinkingStyle, type StyledChar } from "./helpers.js";

const theme = stubTheme() as unknown as ThemeLike;
const style = styleFromTheme(theme);
const ctx = (messageType: MarkdownTransformContext["messageType"]): MarkdownTransformContext => ({
  messageType,
  isStreaming: false,
  availableWidth: 200,
});

function source(...narrations: string[]) {
  const set = new Set(narrations);
  return { get size() { return set.size; }, values: () => set };
}

/** Renders like pi's thinking block, with the transformer applied. */
function renderThinking(markdown: string, narrations: string[], width = 200): StyledChar[][] {
  const transformer = createNarrationTransformer(source(...narrations), () => theme);
  const md = new Markdown(markdown, 0, 0, markdownTheme, thinkingStyle, {
    transform: (text, availableWidth) => transformer(text, { messageType: "assistant-thinking", isStreaming: false, availableWidth }),
  });
  return styledChars(md.render(width)).map(trimRight);
}

/** Renders like a normal assistant reply (no default style): the oracle for narration structure. */
function renderReply(markdown: string, width = 200): StyledChar[][] {
  return styledChars(new Markdown(markdown, 0, 0, markdownTheme).render(width)).map(trimRight);
}

function trimRight(line: StyledChar[]): StyledChar[] {
  let end = line.length;
  while (end > 0 && line[end - 1]!.ch === " ") end--;
  return line.slice(0, end);
}

const visible = (line: StyledChar[]) => line.map((c) => c.ch).join("");
const isReasoning = (c: StyledChar) => c.ch === " " || (c.fg === COLORS.thinkingText && c.italic);

const REASONING = "I should check the log before answering.";

/**
 * Asserts that `narration`, rendered after one reasoning paragraph, has the same
 * text, line structure, bold, and italic as a normal reply, the `text` color
 * wherever a reply uses the default color, and the marker once at the start.
 */
/**
 * `tolerate` lists substrings of the rendered text that may keep the thinking
 * style (segments no insertion point reaches: escapes, inline html, link text).
 */
function assertStyledLikeReply(narration: string, tolerate: string[] = []): void {
  const rendered = renderThinking(`${REASONING}\n\n${narration}`, [narration]);
  assert.ok(rendered[0]!.every(isReasoning), "reasoning keeps thinking color and italic");
  assert.equal(visible(rendered[1]!), "");
  const lines = rendered.slice(2);
  const expected = renderReply(narration);
  while (lines.length > expected.length && lines[lines.length - 1]!.length === 0) lines.pop();
  assert.equal(lines.length, expected.length, `line count for ${JSON.stringify(narration)}`);
  const marker = lines[0]!.slice(0, 2);
  assert.equal(visible(marker), "> ");
  assert.ok(marker.every((c) => c.fg === COLORS.accent && !c.italic), "accent marker, not italic");
  lines[0] = lines[0]!.slice(2);
  for (let l = 0; l < lines.length; l++) {
    const got = lines[l]!;
    const want = expected[l]!;
    assert.equal(visible(got), visible(want), `line ${l} text`);
    const tolerated = new Set<number>();
    for (const part of tolerate) {
      for (let at = visible(got).indexOf(part); at >= 0; at = visible(got).indexOf(part, at + 1)) {
        for (let k = 0; k < part.length; k++) tolerated.add(at + k);
      }
    }
    for (let i = 0; i < got.length; i++) {
      const g = got[i]!;
      const w = want[i]!;
      if (g.ch === " ") continue;
      if (tolerated.has(i) && isReasoning(g)) continue;
      const where = `line ${l} char ${i} '${g.ch}' in ${JSON.stringify(narration)}`;
      assert.equal(g.bold, w.bold, `bold at ${where}`);
      assert.equal(g.italic, w.italic, `italic at ${where}`);
      assert.equal(g.fg, w.fg === "default" ? COLORS.text : w.fg, `color at ${where}`);
    }
  }
}

describe("styleFromTheme", () => {
  test("folds italic-off into the text foreground so chalk cannot re-enable italic", () => {
    assert.equal(style.open, `\x1b[23;38;2;${COLORS.text}m`);
    assert.equal(style.marker, `\x1b[23;38;2;${COLORS.accent}m> `);
    assert.equal(style.emphasisOpen, `\x1b[38;2;${COLORS.text}m\x1b[3m`);
    assert.ok(!style.open.includes("\x1b[23m"));
  });

  test("uses the plain foreground when italic is unavailable", () => {
    const plain = styleFromTheme(stubTheme({ italic: false }) as unknown as ThemeLike);
    assert.equal(plain.open, `\x1b[38;2;${COLORS.text}m`);
  });
});

describe("narration rendering (pi-tui Markdown, chalk semantics)", () => {
  test("styles plain narration with the marker, text color, and no italic", () => {
    assertStyledLikeReply("This costs no tokens. It is a tiny control message.");
  });

  test("keeps the text color after inline code, bold, emphasis, escapes, html, and links", () => {
    assertStyledLikeReply("I'll check `foo.ts` and **Note:** it works *here*, then `bar`.");
    // Escapes and inline html render as separate segments that keep the thinking style.
    assertStyledLikeReply("Escaped \\*star\\* and <b>html</b> and [a link](http://example.com) end.", ["*", "<b>", "</b>", "a link"]);
    assertStyledLikeReply("[A link](http://example.com) first, then text.", ["A link"]);
    assertStyledLikeReply("Run `npm test`; then `npm run typecheck` and `git status`.");
  });

  test("preserves emphasis parsing next to punctuation and at the start", () => {
    for (const narration of [
      "**Note:** the build is green.",
      "**(optional)** skip this.",
      "_Quick_ update: *really.* Next.",
      "`code` first, then text.",
      "~~old~~ new plan.",
    ]) {
      assertStyledLikeReply(narration);
    }
    // A comma right after a closer preceded by punctuation keeps the thinking style.
    assertStyledLikeReply("Done with **step one.**, moving on.", [","]);
  });

  test("styles every paragraph and soft line of multi-paragraph narration with the marker once", () => {
    assertStyledLikeReply("First paragraph with `code`.\n\nSecond paragraph.\nSoft second line with **bold**.\n\nThird.");
    const rendered = renderThinking(`${REASONING}\n\nOne.\n\nTwo.`, ["One.\n\nTwo."]);
    assert.equal(rendered.filter((line) => visible(line).startsWith("> ")).length, 1);
  });

  test("keeps list structure", () => {
    assertStyledLikeReply("Plan:\n\n- first `a`\n- second **b**");
  });

  test("keeps the text color on wrapped lines", () => {
    const narration = "This narration is long enough to wrap across several lines at a narrow width, with `code` inside it.";
    const rendered = renderThinking(`${REASONING}\n\n${narration}`, [narration], 30);
    const start = rendered.findIndex((line) => visible(line).startsWith("> "));
    assert.ok(start > 0);
    const lines = rendered.slice(start).filter((line) => line.length > 0);
    assert.ok(lines.length > 3, "wraps");
    for (const c of lines.flat()) {
      if (c.ch === " ") continue;
      assert.ok(!c.italic, `'${c.ch}' not italic`);
      assert.ok([COLORS.text, COLORS.accent, COLORS.code].includes(c.fg as never), `'${c.ch}' color ${c.fg}`);
    }
  });

  test("reasoning before and after narration keeps thinking color and italic", () => {
    const narration = "Checking `x` now.";
    const rendered = renderThinking(`Before.\n\n${narration}\n\nAfter **this** one.`, [narration]);
    const texts = rendered.map(visible);
    const before = rendered[texts.indexOf("Before.")]!;
    const after = rendered[texts.indexOf("After this one.")]!;
    assert.ok(before.every(isReasoning));
    assert.ok(after.every((c) => c.ch === " " || (c.fg === COLORS.thinkingText && c.italic)));
  });
});

describe("createNarrationTransformer", () => {
  const narration = "The build is running.";
  const markdown = `${REASONING}\n\n${narration}`;

  test("changes only assistant-thinking Markdown", () => {
    const transformer = createNarrationTransformer(source(narration), () => theme);
    assert.notEqual(transformer(markdown, ctx("assistant-thinking")), markdown);
    assert.equal(transformer(markdown, ctx("assistant")), markdown);
    assert.equal(transformer(markdown, ctx("user")), markdown);
  });

  test("leaves reasoning bytes identical and only inserts sequences", () => {
    const transformer = createNarrationTransformer(source(narration), () => theme);
    const out = transformer(markdown, ctx("assistant-thinking"));
    assert.ok(out.startsWith(`${REASONING}\n\n`));
    assert.equal(out.replaceAll(style.marker, "").replaceAll(style.open, ""), markdown);
  });

  test("is a no-op without registered narration, without a match, or without a theme", () => {
    assert.equal(createNarrationTransformer(source(), () => theme)(markdown, ctx("assistant-thinking")), markdown);
    assert.equal(createNarrationTransformer(source("Something else."), () => theme)(markdown, ctx("assistant-thinking")), markdown);
    assert.equal(createNarrationTransformer(source(narration), () => undefined)(markdown, ctx("assistant-thinking")), markdown);
  });

  test("returns the input when anything throws", () => {
    const throwingTheme = () => {
      throw new Error("theme gone");
    };
    assert.equal(createNarrationTransformer(source(narration), throwingTheme)(markdown, ctx("assistant-thinking")), markdown);
    const throwingSource = { size: 1, values: () => { throw new Error("boom"); } };
    assert.equal(createNarrationTransformer(throwingSource, () => theme)(markdown, ctx("assistant-thinking")), markdown);
  });

  test("reads the theme on every call so theme changes apply", () => {
    const live = stubTheme();
    const transformer = createNarrationTransformer(source(narration), () => live as unknown as ThemeLike);
    const first = transformer(markdown, ctx("assistant-thinking"));
    live.setColor("text", "1;2;3");
    const second = transformer(markdown, ctx("assistant-thinking"));
    assert.ok(first.includes(COLORS.text));
    assert.ok(second.includes("\x1b[23;38;2;1;2;3m"));
  });
});

describe("findNarrationRanges and styleNarration", () => {
  test("matches only whole blocks", () => {
    assert.deepEqual(findNarrationRanges("Go.\n\nGo. Further.", ["Go."]), [{ start: 0, end: 3, text: "Go." }]);
    assert.deepEqual(findNarrationRanges("Xgo.\n\ngo.x", ["go."]), []);
  });

  test("styles each occurrence and several narrations", () => {
    const out = styleNarration("A.\n\nr\n\nB.\n\nA.", ["A.", "B."], style);
    assert.equal(out.split(style.marker).length - 1, 3);
  });

  test("returns undefined when nothing can be styled", () => {
    assert.equal(styleNarrationMarkdown("```\ncode only\n```", style), undefined);
  });
});
