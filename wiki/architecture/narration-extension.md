# Narration extension architecture and pi-tui styling contract

Load this page before changing `src/` (signature decoding, narration collection, or the Markdown transformer) or when narration styling looks wrong in the TUI.

## Modules and data flow

- **Display-only design** - `src/index.ts` registers one Markdown transformer plus `session_start` and `message_end` handlers. It never returns a `message_end` replacement, never registers `context`, `context_with_system`, or `before_provider_request` handlers, and never writes session entries; signed thinking blocks must reach Anthropic unchanged. `tests/index.test.ts` enforces this with a fake API that rejects any other call.
- **Detection** - `src/signature.ts` decodes the base64 protobuf signature (outer field 2, envelope field 1, header field 8) and returns true only for the exact bytes `narration`; anything malformed is reasoning. Ported from oh-my-pi `50ec66f` (MIT, notice in `LICENSE`).
- **Collection** - `src/registry.ts` holds trimmed narration texts. `session_start` (every reason) rebuilds it from all `ctx.sessionManager.getEntries()` message entries; `message_end` adds from the finalized message. pi emits `message_end` to extensions before the TUI re-renders the message, so styling applies on finish.
- **Styling** - `src/transform.ts` acts only on `messageType: "assistant-thinking"`, finds registered narration as whole `\n\n`-separated blocks of the joined thinking Markdown, and inserts ANSI sequences only (removing them yields the input). The theme is read from `ctx.ui.theme` on every call.

## pi-tui Markdown styling contract (pi 1.4.0)

- **Style resets per inline run** - pi-tui `Markdown` re-applies the thinking default style (color plus italic) at the start of every inline text run and every soft line, and after code spans, bold, emphasis, and links. A single prefix before the narration loses its color after the first inline token, so insert the style at every text run (tokens from `Marked`, exported by `@earendil-works/pi-tui`). (`node_modules/@earendil-works/pi-tui/dist/components/markdown.js` `renderInlineTokens`)
- **Bare italic-off is rewritten** - pi's theme `italic` is chalk, which rewrites any inner `ESC[23m` back into `ESC[23mESC[3m`. Fold italic-off into the color sequence instead (`ESC[23;38;2;r;g;bm`); inside Markdown emphasis keep italic on.
- **Unreachable segments** - Backslash escapes, inline HTML, and link text render as separate segments that always carry the thinking style; inserting into them breaks escapes or link labels (an `ESC[` adds an unbalanced `[`).
- **Delimiter flanking** - An escape sequence right after an emphasis closer that ends in `_`, or whose content ends in punctuation, can stop it from closing. Keep the first whitespace or punctuation character after such a closer unstyled; the marker goes at the start of the first block or inside a leading strong, em, or del.
- **Test oracle** - `tests/transform.test.ts` renders through real pi-tui `Markdown` with chalk-like italic and bold stubs and compares each narration character against a normal reply render. Run tests that depend on chalk-level output with explicit stubs: chalk emits no codes when stdout is not a TTY. Hyperlinks render as OSC 8 terminated by `ESC \`.
- **Fragile dependency** - ANSI passthrough from Markdown transformers is undocumented pi behavior; re-run the live TUI check after a pi upgrade (see `wiki/workflows/live-tui-check.md`).
