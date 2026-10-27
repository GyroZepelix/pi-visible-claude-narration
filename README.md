# pi-visible-claude-narration

A pi (`@earendil-works/pi-coding-agent`) extension that shows Anthropic progress updates ("narration") as visible reply text in the interactive TUI.

## Why

Claude Opus 5.5, Fable 5.1, and other recent Anthropic models write short notes for the user between tool calls. The Anthropic API returns each of these progress updates as a signed `thinking` block, not a `text` block. pi stores and renders them as reasoning, so an answer the model addressed to you looks like internal thinking. This is most visible before a question tool call: the model answers your question in a progress update, then asks the next question, and the answer is easy to miss.

## What it does

Inside a thinking block, each narration paragraph is shown as a reply:

- a theme `accent` colored `> ` marker at the start of the narration,
- the narration text in the theme `text` color, not italic,
- Markdown structure kept: inline code, bold, emphasis, lists, and paragraphs render as in a normal reply.

Reasoning in the same block keeps the theme `thinkingText` color and italic. Colors come from the active theme each time a message is drawn, so theme changes apply.

The extension is display-only. It never changes stored session data, never changes what is sent to Anthropic, never replaces messages, and never writes session entries. Signed thinking blocks reach the API unchanged.

## How narration is detected

A thinking signature is base64 protobuf with a cleartext header. Header field 8 holds the block kind: `thinking` for reasoning, `narration` for progress updates. The extension decodes only that field and treats a block as narration only when the kind is exactly `narration`. Any empty, short, malformed, or unknown signature is treated as reasoning.

Narration is collected when an assistant message finishes (`message_end`) and from every assistant message in the session when it starts, resumes, reloads, or forks (`session_start`). A registered Markdown transformer then restyles matching narration paragraphs inside the rendered thinking Markdown.

## Install

Requires pi (`@earendil-works/pi-coding-agent`) 1.4.0 or compatible.

Add the git package to `packages` in `~/.pi/agent/settings.json`:

```json
{
  "packages": ["git:git@github.com:GyroZepelix/pi-visible-claude-narration.git"]
}
```

Or try it from a local checkout for one session:

```bash
pi -e ./src/index.ts
```

## Limitations

- Hidden or collapsed thinking hides narration. With `hideThinkingBlock` enabled, or after collapsing a thinking block by click, pi shows only its thinking label and the narration is not visible.
- Interactive TUI only. Print mode, RPC, and HTML export render narration as thinking, unchanged.
- No styling while streaming. A block is identifiable as narration only once its complete signature arrives, so the style applies when the reply finishes and when a session is loaded.
- Some characters inside narration keep the thinking style: backslash escapes, inline HTML, link text, and a single space or punctuation character right after an emphasis closer that depends on it (for example the comma in `**done.**,`). pi renders these as separate segments that the transformer cannot reach without changing Markdown parsing.
- Continuation lines of multi-line list items inside narration may keep the thinking style.
- Undocumented pi behavior: the colors rely on ANSI escape sequences returned by a Markdown transformer passing through pi-tui Markdown rendering. A pi update could drop them; the narration would then render as thinking again.
- Undocumented Anthropic format: the signature header is not a documented contract. If Anthropic changes it, detection fails safe and narration renders as thinking.
- Narration is matched by its text inside the joined thinking Markdown. A reasoning paragraph with exactly the same text as a narration paragraph from the same session would also be restyled.

## Development

```bash
npm install
npm run typecheck
npm test
npm run check:sessions   # local, read-only: counts narration per model in ~/.pi/agent/sessions
```

Committed tests use synthetic signatures only. `check:sessions` reads real session files at runtime, prints counts only, and writes nothing.

## Attribution

The signature header layout and the exact-`narration` detection rule are ported from [oh-my-pi](https://github.com/can1357/oh-my-pi) commit [`50ec66f`](https://github.com/can1357/oh-my-pi/commit/50ec66f75d57ad55838a9fe4da5e66f29af4d73c) ("fix(ai): show Anthropic between-tool narration as reply text"), used under the MIT License:

```text
Copyright (c) 2025 Mario Zechner
Copyright (c) 2025-2026 Can Bölük
Copyright (c) 2026 Stencil Labs, Inc.
```

The full MIT permission notice is in [LICENSE](LICENSE).

An upstream issue draft for pi is in [docs/upstream-issue.md](docs/upstream-issue.md).

## License

MIT
