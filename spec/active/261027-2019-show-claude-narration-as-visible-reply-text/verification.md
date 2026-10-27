# Verification: Show Claude narration as visible reply text

Work item: `261027-2019-show-claude-narration-as-visible-reply-text`
Date: 2026-10-27

Mode: direct. Assurance: medium (inherited from plan.md): runs on every Claude response in every session, local, single-user, display-only, reversible.

## Environment

- macOS, Node v26.8.2, npm. Starting boundary: no HEAD, workflow-owned staged files only. During this assignment the user made initial commit `0a1e104` (scaffold and plan); implementation files remain uncommitted for the checkpoint phase.
- devDependencies installed with approval (F3): `@earendil-works/pi-coding-agent` 1.4.0, `typescript` 5.9.3, `tsx` 4.23.15, `@types/node` 22.20.5. `node_modules/` gitignored.
- peerDependencies: `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` `"*"` (pi-tui approved via orchestrator, D15; already installed transitively, lockfile unchanged by it).
- Live check: pi 1.4.0 (global bun install), theme `dark`, `hideThinkingBlock: false`, tmux.

## Changed paths

- `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `LICENSE`
- `src/signature.ts`, `src/registry.ts`, `src/transform.ts`, `src/index.ts`
- `tests/helpers.ts`, `tests/signature.test.ts`, `tests/registry.test.ts`, `tests/transform.test.ts`, `tests/index.test.ts`
- `scripts/check-sessions.ts`
- `README.md`, `docs/upstream-issue.md`
- `spec/active/261027-2019-show-claude-narration-as-visible-reply-text/plan.md` (Decision Log D15, D16; progress), this file

## Commands and checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Pass | `tsc --noEmit`, no output |
| `npm test` | Pass, 45/45 | signature 12, registry 6, transform 17 (incl. renders through pi-tui `Markdown` with chalk semantics), index 10 |
| `npm run check:sessions` | Pass | 495 files; narration only in `claude-opus-5-5` (230 of 2883 signed messages) and `claude-fable-5-1` (28 of 102); 0 narration messages with a `text` block; 0 narration in 10 other models with signed blocks (13k+ non-Anthropic messages) |
| Local probe, all real narrations (uncommitted, deleted) | Pass | 258/258 render the same visible text as a normal reply, exactly one marker, 0 thinking-colored characters |
| T08 live TUI, session with `4796ddb9` (temp copy) | Pass | narration lines `ESC[38;2;167;152;215m> ESC[38;2;222;224;225m...` on both wrapped lines, no `ESC[3m`; preceding reasoning `ESC[3mESC[38;2;150;160;164m`; 3 narration blocks, 0 with italic or thinking color |
| T08 live TUI, session with inline-code narration (temp copy) | Pass | 7 narration blocks, 0 with italic or thinking color; after each code span (dark `mdCode` 167;152;215) text returns to 222;224;225, including wrapped lines |
| Markdown checks (README, issue draft) | Pass | fences balanced (README 8, issue 0); no em or en dashes in any new file |

T08 command: `COLORTERM=truecolor pi --session <copy> --session-dir <tmpdir> -ne --no-mcp -na -nc -ns -np --use-theme dark -e ./src/index.ts` in a detached tmux session `narr-t08`, captured with `tmux capture-pane -e -p -S -5000`. tmux session killed and temp directory removed afterwards; both original session files verified unchanged by SHA-1.

## Requirement coverage

| Requirement | Evidence | Status |
| --- | --- | --- |
| R1 signature detection, fail safe | `src/signature.ts`; `tests/signature.test.ts` (kinds, empty, short, non-base64, every truncation point, oversized varints, >13k chars); `check:sessions` zero false positives | Met |
| R2 collection on `message_end` and `session_start` (all reasons), reset per session | `src/registry.ts`, `src/index.ts`; `tests/index.test.ts` per reason | Met |
| R3 transformer only on `assistant-thinking`, style H, multi-paragraph | `src/transform.ts`; `tests/transform.test.ts`; real-narration probe; T08 | Met, with D16 limitations |
| R4 theme read at transform time | `tests/transform.test.ts` theme change test; `ui.theme` read per call | Met |
| R5 no replacement, no context/provider hooks, no session writes | `tests/index.test.ts` fake API rejects any other call | Met |
| R6 errors return input unchanged | `tests/transform.test.ts` throwing theme and source | Met |
| R7 synthetic test signatures only | `tests/helpers.ts` builder; real data read only at runtime by `scripts/check-sessions.ts` (counts only) | Met |
| R8 LICENSE, README, upstream draft | `LICENSE`, `README.md`, `docs/upstream-issue.md` | Met |
| R9 publish and install | T09 steps 1-2 done by the user: commit `0a1e104`, `origin` set, `origin/master` = `0a1e104`. Steps 3-4 approved for after the implementation checkpoint commit | Partial; push and install pending |

## Review findings

- Focused segment review after T05 (`segment-review-t05`): PASS, no blockers. Non-blocking: transform cache clears fully at 500 entries; acceptable for single-user sessions, not changed.
- Final contract-quality review (`final-review`): PASS, no blockers. Non-blocking findings applied as trivial in-scope fixes: upstream copyright lines added to `LICENSE` as a third-party notice; explicit `start >= 2` guard in `findNarrationRanges`; `existsSync` guard in `scripts/check-sessions.ts` (verified with `PI_SESSIONS_DIR=/nonexistent`: zero sessions, no error). Remaining non-blocking item (plan checkboxes) resolved by this progress update.
- Re-run after fixes: `npm run typecheck` pass; `npm test` 45/45 pass; `npm run check:sessions` unchanged results.
- Review retries used: 0.

## Failures and skipped checks

- During T04, tests caught: marker inheriting italic, emphasis content losing italic, closer sensitivity regex treating `*` as punctuation, marker placed after a leading code span. All fixed before review.
- T08 incident: the first attempt to quit pi with Ctrl+C did not exit, so typed shell text was submitted as a user message in the temporary copy. The provider rejected it (HTTP 400, out of extra usage); no model output and no change to any original session. Later exits used `/quit`.
- T09 steps 3-4 (push, settings.json entry, pi startup listing check) not run: approved only after the checkpoint commit containing the implementation, which happens in a later phase.

## Unverified areas

- ANSI passthrough from Markdown transformers is undocumented pi behavior; verified on pi 1.4.0 only.
- Escapes, inline html, link text, and one character after a follower-sensitive emphasis closer keep the thinking style (D16); multi-line list item continuations may stay unstyled. Not observed in any of the 258 real narrations.
- Light theme and 256-color terminals not checked live; style derives from `getFgAnsi`, covered by unit tests with a stub theme.
