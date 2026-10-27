# Dream learnings: 261027-2019-show-claude-narration-as-visible-reply-text

Work item: `261027-2019-show-claude-narration-as-visible-reply-text`

> Historical snapshot: this ledger records what Dream retained at each Gamemaster checkpoint. Current source, plans, verification, outcomes, and current dynamic destinations remain authoritative.

<!-- dream-checkpoints:start -->

## Gamemaster checkpoint: 261027-2019-show-claude-narration-as-visible-reply-text/direct

Date: 2026-10-27
Dream log: [2026-10-27-2130-gamemaster-checkpoint-261027-2019-show-claude-narration-as-visible-reply-text-di.md](../2026-10-27-2130-gamemaster-checkpoint-261027-2019-show-claude-narration-as-visible-reply-text-di.md)
Outcome: retained learning

### New page: narration extension architecture and pi-tui styling contract

- **Exact written text:**
  > # Narration extension architecture and pi-tui styling contract
  >
  > Load this page before changing `src/` (signature decoding, narration collection, or the Markdown transformer) or when narration styling looks wrong in the TUI.
  >
  > ## Modules and data flow
  >
  > - **Display-only design** - `src/index.ts` registers one Markdown transformer plus `session_start` and `message_end` handlers. It never returns a `message_end` replacement, never registers `context`, `context_with_system`, or `before_provider_request` handlers, and never writes session entries; signed thinking blocks must reach Anthropic unchanged. `tests/index.test.ts` enforces this with a fake API that rejects any other call.
  > - **Detection** - `src/signature.ts` decodes the base64 protobuf signature (outer field 2, envelope field 1, header field 8) and returns true only for the exact bytes `narration`; anything malformed is reasoning. Ported from oh-my-pi `50ec66f` (MIT, notice in `LICENSE`).
  > - **Collection** - `src/registry.ts` holds trimmed narration texts. `session_start` (every reason) rebuilds it from all `ctx.sessionManager.getEntries()` message entries; `message_end` adds from the finalized message. pi emits `message_end` to extensions before the TUI re-renders the message, so styling applies on finish.
  > - **Styling** - `src/transform.ts` acts only on `messageType: "assistant-thinking"`, finds registered narration as whole `\n\n`-separated blocks of the joined thinking Markdown, and inserts ANSI sequences only (removing them yields the input). The theme is read from `ctx.ui.theme` on every call.
  >
  > ## pi-tui Markdown styling contract (pi 1.4.0)
  >
  > - **Style resets per inline run** - pi-tui `Markdown` re-applies the thinking default style (color plus italic) at the start of every inline text run and every soft line, and after code spans, bold, emphasis, and links. A single prefix before the narration loses its color after the first inline token, so insert the style at every text run (tokens from `Marked`, exported by `@earendil-works/pi-tui`). (`node_modules/@earendil-works/pi-tui/dist/components/markdown.js` `renderInlineTokens`)
  > - **Bare italic-off is rewritten** - pi's theme `italic` is chalk, which rewrites any inner `ESC[23m` back into `ESC[23mESC[3m`. Fold italic-off into the color sequence instead (`ESC[23;38;2;r;g;bm`); inside Markdown emphasis keep italic on.
  > - **Unreachable segments** - Backslash escapes, inline HTML, and link text render as separate segments that always carry the thinking style; inserting into them breaks escapes or link labels (an `ESC[` adds an unbalanced `[`).
  > - **Delimiter flanking** - An escape sequence right after an emphasis closer that ends in `_`, or whose content ends in punctuation, can stop it from closing. Keep the first whitespace or punctuation character after such a closer unstyled; the marker goes at the start of the first block or inside a leading strong, em, or del.
  > - **Test oracle** - `tests/transform.test.ts` renders through real pi-tui `Markdown` with chalk-like italic and bold stubs and compares each narration character against a normal reply render. Run tests that depend on chalk-level output with explicit stubs: chalk emits no codes when stdout is not a TTY. Hyperlinks render as OSC 8 terminated by `ESC \`.
  > - **Fragile dependency** - ANSI passthrough from Markdown transformers is undocumented pi behavior; re-run the live TUI check after a pi upgrade (see `wiki/workflows/live-tui-check.md`).
- **Destination and classification:** `wiki/architecture/narration-extension.md` - `Topic-specific dynamic knowledge`
- **Session evidence or selection reason:** Implementation of T01-T05 established the module boundary; T04 rendering tests and a source read of pi-tui `markdown.js` showed per-inline-run restyling (106 of 254 real narrations affected), chalk rewriting bare italic-off, unreachable escape/html/link segments, and flanking-sensitive insertion points; recorded as plan D15/D16.
- **Expected future benefit:** Future changes to `src/transform.ts` or debugging of narration colors start from the proven rendering contract instead of rediscovering it through failed renders; the display-only boundary prevents an accidental context or replay change.
- **Why this tier:** Stable contract proven by authoritative source, tests, and live runtime behavior, and specific to this repository's core module; a coherent cluster of several related rules, too detailed for MEMORY.md and too important for an observation.

### New page: live TUI check in tmux

- **Exact written text:**
  > # Live TUI check in tmux
  >
  > Load this page before driving a real pi TUI from an agent (for example to verify narration colors against a saved session).
  >
  > ## Safe procedure
  >
  > - **Work on a copy** - Copy the session file to a temporary directory and pass both `--session <copy>` and `--session-dir <tmpdir>`. Compare the original's hash before and after; delete the copies afterwards.
  > - **Isolate pi** - Run `COLORTERM=truecolor pi --session <copy> --session-dir <tmpdir> -ne --no-mcp -na -nc -ns -np --use-theme dark -e ./src/index.ts` in a detached tmux session you create (`tmux new-session -d -s <name> -x 150 -y 60`), never in an existing user pane. Opening a session and rendering history needs no model request.
  > - **Capture** - `tmux capture-pane -t <name> -e -p -S -5000` keeps SGR codes and scrollback. Dark theme reference: `text` 222;224;225, `thinkingText` 150;160;164, `accent` and `mdCode` 167;152;215.
  > - **Exit pi with `/quit`, not Ctrl+C** - Ctrl+C clears the editor and exits only when pressed twice within 500 ms (`interactive-mode.js` `handleCtrlC`); Ctrl+D exits only when the editor is empty. Send `C-c`, then `/quit` with `send-keys -l`, then `Enter`. Before sending any shell command, confirm `tmux list-panes -t <name> -F '#{pane_current_command}'` shows the shell, not `node`: keystrokes sent while pi is running are submitted as a user message and trigger a real model request. (2026-10-27 checkpoint for work item `261027-2019-show-claude-narration-as-visible-reply-text`: two Ctrl+C presses one second apart left pi running and a typed shell command went to the provider.)
  > - **Clean up** - `tmux kill-session -t <name>` and remove the temporary directory.
- **Destination and classification:** `wiki/workflows/live-tui-check.md` - `Topic-specific dynamic knowledge`
- **Session evidence or selection reason:** T08 drove pi in a detached tmux session on copied sessions; two Ctrl+C presses one second apart did not exit pi (source: exit needs two presses within 500 ms), so typed shell text was submitted as a user message and reached the provider (rejected, out of extra usage). `/quit` plus a pane-command check worked.
- **Expected future benefit:** Prevents unintended model requests and session writes when agents verify TUI behavior, and makes the capture procedure and dark-theme color references reusable for the next pi upgrade check.
- **Why this tier:** High-impact failure prevention (unintended external model request) qualifies after one session; it is a multi-step procedure for a recurring verification task in this repo, so a workflow page rather than an observation or the episode only.

### Research handoff status update

- **Exact written text:**
  > Status: research complete. Written 2026-10-27. Implemented by work item `261027-2019-show-claude-narration-as-visible-reply-text` as a display-only `registerMarkdownTransformer` restyling (closest to candidate 2 below; pi 1.4.0 has no thinking-block renderer hook); see `wiki/architecture/narration-extension.md`.
- **Destination and classification:** `wiki/research/opus-narration-hidden-as-thinking.md` - `Topic-specific dynamic knowledge`
- **Session evidence or selection reason:** The research page still said the extension was not built; T01-T08 are implemented and verified with a mechanism different from most of the page's listed candidates.
- **Expected future benefit:** Stops future agents from treating the handoff as unimplemented or choosing a rejected integration point, and routes them to the architecture page.
- **Why this tier:** Correction of an existing dynamic page's stale claim; a single status line in the narrowest existing page instead of a new page or observation.
