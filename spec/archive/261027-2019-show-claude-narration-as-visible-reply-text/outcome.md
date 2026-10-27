# Outcome: Show Claude narration as visible reply text

Work item: `261027-2019-show-claude-narration-as-visible-reply-text`
Disposition: completed
Date: 2026-10-27

## Delivered scope

- pi extension `pi-visible-claude-narration`: detects Anthropic narration thinking blocks by signature header kind and restyles them in the interactive TUI as a reply (accent `> ` marker, theme `text` color, not italic); reasoning keeps `thinkingText` italic. Display-only: no message replacement, no context or provider hooks, no session writes.
- Modules `src/signature.ts`, `src/registry.ts`, `src/transform.ts`, `src/index.ts`; 45 tests with synthetic signatures; read-only `npm run check:sessions` script.
- MIT `LICENSE` with oh-my-pi third-party notice, `README.md` (purpose, install, limitations, attribution), upstream issue draft `docs/upstream-issue.md`.
- Published to `github.com/GyroZepelix/pi-visible-claude-narration` and installed through `~/.pi/agent/settings.json` `packages`.

## Deviations from plan

- D15 (user approved): narration is tokenized with `Marked` from `@earendil-works/pi-tui` (new peerDependency) and styled at every inline text run, because pi-tui re-applies the thinking style per run.
- D16: italic-off is folded into the color SGR because chalk rewrites a bare italic-off; escapes, inline html, link text, and one character after a punctuation-sensitive emphasis closer keep the thinking style.
- The user made the initial commit and set the remote themselves; the lockfile root entry was regenerated in the final commit after the checkpoint commit shipped it without the pi-tui peer.

## Verification summary

- `npm run typecheck` pass; `npm test` 45/45; `npm run check:sessions`: narration only in claude-opus-5-5 (230) and claude-fable-5-1 (28), never alongside a text block.
- 258/258 real narrations keep their structure with zero thinking-colored characters (local probe, uncommitted).
- Live TUI (pi 1.4.0, dark theme, tmux capture): marker, text color, no italic, including after code spans and on wrapped lines.
- Focused segment review and final contract-quality review: PASS, no blockers, no retries.
- Push `eb59d16` verified with `git ls-remote`; fresh pi startup lists `GyroZepelix/pi-visible-claude-narration:src`.
- Details: `verification.md`.

## Retained, reverted, or transferred work

- All implementation retained. During T08 an unintended keystroke submission into a temporary session copy was rejected by the provider; no state retained.

## Residual risks

- ANSI passthrough from Markdown transformers is undocumented pi behavior, verified on pi 1.4.0 only.
- The signature header format is undocumented by Anthropic; detection fails safe to reasoning.
- Narration stays hidden when thinking is hidden or collapsed; print mode, RPC, and HTML export are not covered.
- pi's package clone under `~/.pi/agent/git` has a local one-line lockfile modification from pi's install; a later `pi update` may need to discard it.
- Light theme and 256-color terminals verified by unit tests only.

## Follow-up work items

- File the upstream pi issue from `docs/upstream-issue.md` (out of scope here, needs approval).

## Source references

- `plan.md`, `discovery.md`, `verification.md` in this item.
- Commits `0a1e104`, `eb59d16`, and the final archive commit on `origin/master`.
- oh-my-pi commit `50ec66f`.

## Wiki updates

- `wiki/architecture/narration-extension.md`, `wiki/workflows/live-tui-check.md`, research page status, `wiki/dreams/MEMORY.md` pointers (Dream checkpoint `direct`).
