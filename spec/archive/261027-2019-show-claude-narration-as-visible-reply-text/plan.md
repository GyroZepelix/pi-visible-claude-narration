# Plan: Show Claude narration as visible reply text

Work item: `261027-2019-show-claude-narration-as-visible-reply-text`
Status: Planned
Created: 2026-10-27
Updated: 2026-10-27

## Goal

In the pi interactive TUI, Anthropic progress-update ("narration") blocks render as a reply to the user: a theme-accent `> ` marker followed by the narration in the theme `text` color, not italic, while reasoning keeps `thinkingText` italic. Stored session data and every LLM request stay unchanged.

Assurance: medium - the extension runs on every Claude response in every session, so a defect is broadly visible; it is local, single-user, display-only, and reversible by removing the extension; no secrets, migrations, or production systems are involved. Inherited from `discovery.md`.

## Context

- Root cause and evidence: `wiki/research/opus-narration-hidden-as-thinking.md`, `research/narration-replay/`, `discovery.md` in this item.
- Anthropic returns progress updates as signed `thinking` blocks right before the tool call they introduce. Signature header field 8 holds the kind: `narration` or `thinking`.
- Target runtime: `@earendil-works/pi-coding-agent` 1.4.0. The TUI joins consecutive thinking blocks into one Markdown component colored `thinkingText`, italic, and passes it through registered Markdown transformers with `messageType: "assistant-thinking"`.
- pi emits `session_start` (reasons `startup`, `reload`, `new`, `resume`, `fork`) before rendering initial messages, and re-renders an assistant message at `message_end`.
- `ctx.ui.theme` exposes the active theme (`fg`, `italic`).
- Sibling conventions (`../pi-ez-session-name`): TypeScript ESM, `package.json` `pi.extensions`, `node --import tsx --test`, `tsc --noEmit`, devDependency `@earendil-works/pi-coding-agent` 1.4.0.
- Prior art: oh-my-pi commit `50ec66f` (`research/narration-replay/oh-my-pi-50ec66f.patch`), MIT licensed.

## Requirements

- R1: Detect narration only from the thinking signature: base64 protobuf, outer field 2 envelope, envelope field 1 header, header field 8 kind equal to the exact bytes `narration`. Any malformed, empty, short, unknown, or non-narration signature is reasoning.
- R2: Collect narration texts from finalized assistant messages at `message_end`, and from every assistant message in the session's entries on `session_start` (all reasons), resetting the collection when the session changes.
- R3: Register a Markdown transformer that acts only when `context.messageType === "assistant-thinking"`, finds collected narration texts in the joined thinking Markdown, and restyles them as: accent-colored `> ` marker on the first line, `text` color for the narration, italic turned off inside the narration and restored after it. Multi-paragraph narration keeps its Markdown structure and color on every paragraph.
- R4: Read theme colors at transform time from the active theme so theme changes apply.
- R5: The extension never returns a replacement from `message_end`, never registers `context`, `context_with_system`, or `before_provider_request` handlers, and never writes session entries.
- R6: Errors in detection or transformation never break rendering: on failure the transformer returns the input Markdown unchanged.
- R7: Committed tests use synthetic signatures only; real session signatures are read only at runtime by a local check script and never committed.
- R8: The repository ships an MIT `LICENSE`, a README (purpose, install, limitations, oh-my-pi attribution), and an upstream pi issue draft at `docs/upstream-issue.md`.
- R9: Publish to public GitHub repository `GyroZepelix/pi-visible-claude-narration` (created empty by the user) and install it in pi via git, each external or global-config step only after explicit approval.

## Out of scope

- Showing narration when thinking blocks are hidden (`hideThinkingBlock`) or collapsed by click; documented as a limitation.
- Print mode, RPC, and HTML export rendering.
- Recoloring during streaming before the signature arrives.
- Filing the upstream issue.
- Changing `APPEND_SYSTEM.md`, `thinking.display`, or anything sent to Anthropic.

## Assumptions

- ANSI escape codes returned by a Markdown transformer pass through pi-tui `Markdown` rendering (verified in an isolated render, not yet in the live TUI). Revisit D6 if T08 shows otherwise.
- Narration text appears verbatim (after `trim()`) inside the joined thinking Markdown. Revisit if T08 shows unmatched narration.

## Design

- `src/signature.ts`: protobuf length-delimited field reader and `isNarrationSignature(signature: string): boolean`, ported from oh-my-pi with an attribution comment. No upper length bound on signatures.
- `src/registry.ts`: `NarrationRegistry` holding trimmed narration texts; `addFromMessage(message)` and `rebuildFromEntries(entries)`; `clear()`.
- `src/transform.ts`: pure `styleNarration(markdown, narrations, style)` plus a factory producing the `MarkdownTransformer` that reads `ctx.ui.theme` lazily and wraps everything in try/catch.
- `src/index.ts`: extension entry; registers the transformer once, `session_start` handler rebuilding the registry from `ctx.sessionManager` entries, `message_end` handler adding narration from assistant messages without returning a result.
- Scan all session entries, not only the active branch, so `/tree` navigation needs no extra handling.

## Decision Log

| ID | Scope | Decision | Rationale | Evidence | Revisit when |
| --- | --- | --- | --- | --- | --- |
| D6 | Mechanism | Display-only coloring through `registerMarkdownTransformer`; no message or context changes. | No API or replay risk; satisfies "stay thinking, different color". | discovery.md D2, D6; transformer runs on `assistant-thinking`. | Live TUI drops ANSI from transformers. |
| D7 | Timing | Color applies once the reply finishes and on history load. | Narration is identifiable only from the complete signature. | discovery.md D7. | - |
| D8 | Test data | Synthetic signatures in committed tests; real signatures only via the local check script at runtime. | User decision. | discovery.md D8. | - |
| D12 | Style | Accent `> ` marker, `text` color, italic off (mock variant H). | User choice from the mock. | discovery.md D12; `/tmp/thinkfix/color-mock.ts`. | Live rendering differs from the mock. |
| D13 | Limitation | Hidden or collapsed thinking hides narration; documented only. | Display-only mechanism cannot render inside the hidden label. | discovery.md D13. | User starts hiding thinking. |
| D15 | Inline styling | Tokenize narration with `Marked` from `@earendil-works/pi-tui` (declared as peerDependency `"*"`, no new devDependency, lockfile unchanged) and insert the style at the start of every inline text run and soft line; place the marker at the start of the first block. | Source-truth finding during T04: pi-tui re-applies the thinking color and italic at every inline text run, so a single prefix loses color after the first `code` span; 106 of 254 real narrations contain inline Markdown. User approved 2026-10-27 via orchestrator. | `node_modules/@earendil-works/pi-tui/dist/components/markdown.js` `renderInlineTokens`; local probe over all real narrations: 258/258 keep structure, one marker, zero thinking-colored characters. | pi changes its Markdown renderer or exports. |
| D16 | Italic off | Fold italic-off into the foreground SGR (`ESC[23;38;2;r;g;bm`) instead of a bare `ESC[23m`; inside Markdown emphasis keep italic on. Escapes, inline html, and link text render as separate segments no insertion can reach, so they keep the thinking style; a single whitespace or punctuation character right after a closer that depends on it (an `_` closer or one preceded by punctuation) also keeps it. | Implementation detail within D12: chalk (pi theme `italic`) rewrites every inner `ESC[23m` back to italic; inserting an escape sequence before such characters would break escapes, links, or emphasis parsing. | Isolated pi-tui render spike; `tests/transform.test.ts` renders through pi-tui `Markdown` with chalk semantics. | T08 shows italic or color differs in the live TUI. |
| D10, D11, D14 | Publishing | Public GitHub repo created by the user; MIT license; push and settings change only after approval. | User decisions; `gh` not installed. | discovery.md. | - |

## Work breakdown

- [x] T01: Package scaffold
  - Depends on: none
  - Scope: `package.json` (name `pi-visible-claude-narration`, `type: module`, `pi.extensions: ["./src/index.ts"]`, scripts `typecheck`, `test`, `check:sessions`, peerDependency `@earendil-works/pi-coding-agent`), `tsconfig.json`, `.gitignore`, MIT `LICENSE`. DevDependencies pinned like `../pi-ez-session-name` after approval.
  - Expected areas: repository root
  - Acceptance: `npm run typecheck` runs on an empty `src/index.ts` stub.
  - Verification: `npm run typecheck`
- [x] T02: Signature decoder
  - Depends on: T01
  - Scope: `src/signature.ts`, `tests/signature.test.ts` with a synthetic signature builder.
  - Expected areas: `src/`, `tests/`
  - Acceptance: narration kind detected; `thinking` kind, other kinds, empty, short, non-base64, truncated, and oversized-varint inputs return false without throwing; long signatures (over 13k characters) still decode.
  - Verification: `npm test`
- [x] T03: Narration registry
  - Depends on: T02
  - Scope: `src/registry.ts`, `tests/registry.test.ts`.
  - Acceptance: collects only thinking blocks with narration signatures from assistant messages; ignores user, tool result, text, and reasoning blocks; rebuild replaces previous contents.
  - Verification: `npm test`
- [x] T04: Styling transformer
  - Depends on: T03
  - Scope: `src/transform.ts`, `tests/transform.test.ts` with a stub theme.
  - Acceptance: only `assistant-thinking` is changed; only registered narration is styled; reasoning text and normal assistant text are byte-identical; multi-paragraph narration styled per paragraph with the marker once; no registered narration means identical output; thrown errors return the input.
  - Verification: `npm test`
- [x] T05: Extension wiring
  - Depends on: T04
  - Scope: `src/index.ts`, `tests/index.test.ts` with a fake `pi` API.
  - Acceptance: transformer registered once; `session_start` rebuilds from entries for every reason; `message_end` adds narration and returns undefined; no `context`, `context_with_system`, or `before_provider_request` handlers registered; no session writes.
  - Verification: `npm run typecheck && npm test`
- [x] T06: Local real-session check
  - Depends on: T02
  - Scope: `scripts/check-sessions.ts` reading `~/.pi/agent/sessions/*/*.jsonl` at runtime; prints counts per model of messages with narration blocks and messages where narration co-occurs with a `text` block. Writes nothing.
  - Acceptance: narration appears only for `claude-opus-5-5` and `claude-fable-5-1` (earlier scan: 206 and 24 messages, counts may have grown); zero co-occurrence with `text` blocks.
  - Verification: `npm run check:sessions`
- [x] T07: Documentation and upstream draft
  - Depends on: T05
  - Scope: `README.md` (purpose, screenshot-free description of style H, install via git package, limitations from Out of scope and Assumptions, oh-my-pi attribution), `docs/upstream-issue.md` (from the handoff page draft).
  - Acceptance: README states every limitation; issue draft contains symptom, cause, evidence, detection approach, and request.
  - Verification: manual read; markdown fences balanced; no em or en dashes.
- [x] T08: Live TUI check
  - Depends on: T05
  - Scope: copy the session containing `4796ddb9` to a temporary directory, open it with `pi --session <copy> -e ./src/index.ts` in a tmux pane, capture with `tmux capture-pane -e -p`, then close the pane. No model request is needed.
  - Acceptance: the narration line starts with the accent `> ` marker and uses the theme `text` color without italic; the preceding reasoning keeps `thinkingText` italic.
  - Verification: inspect captured ANSI codes against `ctx.ui.theme` colors (dark theme: `text` 222;224;225, `thinkingText` 150;160;164).
- [x] T09: Publish and install
  - Depends on: T06, T07, T08, final review
  - Scope: after explicit approval for each step: initial commit, `git remote add origin git@github.com:GyroZepelix/pi-visible-claude-narration.git`, push, then add `git:git@github.com:GyroZepelix/pi-visible-claude-narration.git` to `~/.pi/agent/settings.json` `packages` and verify pi lists the extension at startup.
  - Acceptance: repository public on GitHub with the committed source; a fresh pi startup lists the extension.
  - Verification: `git ls-remote origin`; pi startup resource list in tmux.

## Acceptance criteria

- `npm run typecheck` and `npm test` pass.
- `npm run check:sessions` shows narration only in Opus 5.5 and Fable 5.1 messages and never alongside a `text` block.
- Live TUI capture shows style H on narration and unchanged `thinkingText` italic reasoning, for a resumed session.
- Tests prove the extension registers no context or provider hooks and returns no `message_end` replacement.
- README and `docs/upstream-issue.md` exist and cover the listed content.
- After approval, the public repo exists and pi loads the extension from it.

## Verification plan

- `npm run typecheck`
- `npm test`
- `npm run check:sessions`
- T08 tmux capture inspection.
- Review: one review at the coherent boundary after T05 (core behavior), and a final contract-quality review against this plan before T09.

## Risks and blockers

- ANSI passthrough is undocumented pi behavior; a pi update could silently drop the color. Mitigation: T08 check, README limitation, revisit D6.
- T09 blocked until the user creates the empty GitHub repository.
- Dependency installation in T01 needs approval.

## Progress

- [x] Planning complete and confirmed.
- [x] Implementation T01-T08 complete (2026-10-27).
- [x] T09 complete: steps 1-2 by the user (`0a1e104`, `origin`); checkpoint commit `eb59d16` pushed; `~/.pi/agent/settings.json` package entry added; fresh pi startup lists the extension (see `verification.md`).
- [x] Verification run for T01-T09: see `verification.md`; segment and final contract-quality reviews PASS.

## Execution handoff

Use PI Agent in a fresh session with this prompt:

```text
Read this plan and its item.yaml completely.
Implement the work step by step while preserving Requirements, Out of scope, Decision Log, and Verification plan.
Update Progress and the Decision Log when confirmed implementation discoveries change the approach.
Run the specified verification before reporting completion.
Stop and ask before dependencies, migrations, destructive operations, external writes, commits, pushes, or scope expansion.
```

## Proposed durable knowledge updates

- After implementation: wiki pages for architecture (signature decoder, registry, transformer) and the limitation list; mark the research handoff page as implemented.
