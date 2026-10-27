# Wiki Log

Curated append-only timeline of durable wiki maintenance events. This is not a codebase changelog, commit log, or session transcript.

Use this shape for new entries:

- Heading: `## [YYYY-MM-DD] <kind> | <short title>`.
- Trigger: why the wiki was updated.
- Inputs: source paths, commit ranges, specs, verification, outcomes, URLs, or raw files used as evidence.
- Wiki pages changed: wiki files changed.
- Verification: checks or source verification.
- Notes: gaps, conflicts, stale areas, or exceptions.

## [2026-10-27] install | repo wiki template

- Trigger: user requested installation from `https://git.dgjalic.com/dgjalic/repo-wiki-template`.
- Inputs: protocol version 2.2.1/schema-2 payload from `https://git.dgjalic.com/dgjalic/repo-wiki-template/install/template/`.
- Wiki pages changed: `wiki/AGENTS.md`, `wiki/index.md`, `wiki/log.md`, `wiki/state.md`, `wiki/raw/README.md`.
- Verification: required files and managed regions exist; existing files were preserved or merged; protocol validation result was recorded. `uv run spec/scripts/manage-spec-item.py --root . validate --operational` passed (`valid: true`, no warnings). `uv run spec/scripts/manage-spec-item.py --root . validate --all` passed (`valid: true`, no warnings).
- Notes: installed payload may also create or merge root and spec files; initial codebase ingest is still needed.

## [2026-10-27] research | Opus narration hidden as thinking

- Trigger: handoff of the investigation into Opus 5.5 answers hidden as thinking before `ask_user_question`.
- Inputs: local pi session files (listed in the page), `research/narration-replay/` (replay harness, scan script, 45-run results), Anthropic thinking docs, oh-my-pi commit `50ec66f`.
- Wiki pages changed: `wiki/research/opus-narration-hidden-as-thinking.md`, `wiki/index.md`.
- Verification: failures reproduced by replaying real sessions with the pi SDK; narration kind confirmed by decoding thinking signatures.
- Notes: extension not built yet; integration point in pi 1.4.0 still to be verified.

## [2026-10-27] dream | Gamemaster checkpoint for narration extension T01-T08

- Trigger: `/dream` run after `Gamemaster checkpoint: 261027-2019-show-claude-narration-as-visible-reply-text/direct`.
- Inputs: current implementation session, `src/`, `tests/`, the item's `plan.md` (D15, D16) and `verification.md`, `node_modules/@earendil-works/pi-tui/dist/components/markdown.js`, `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js`, T08 tmux captures.
- Wiki pages changed: `wiki/architecture/narration-extension.md` (new), `wiki/workflows/live-tui-check.md` (new), `wiki/research/opus-narration-hidden-as-thinking.md` (status line), `wiki/dreams/MEMORY.md` (new), `wiki/index.md`, plus the Dream episode, `wiki/dreams/episodes.jsonl`, and the per-spec ledger.
- Verification: re-read changed files, checked relative links, ran the memory safety scan and the MEMORY.md token budget, `git diff --check`.
- Notes: implementation not yet committed or published (T09 pending); ANSI passthrough verified on pi 1.4.0 only.
