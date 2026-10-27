# Wiki Index

Durable current-state codebase knowledge. Read this file first when answering codebase questions.

## Start here

- [Wiki instructions](./AGENTS.md): Scoped rules for durable memory maintenance.
- [Wiki log](./log.md): Chronological maintenance log.
- [Wiki state](./state.md): Ingest and maintenance state.
- [Raw sources](./raw/README.md): Rules for untrusted raw inputs.

## Architecture

- [Narration extension architecture](./architecture/narration-extension.md): modules, data flow, display-only boundary, and the pi-tui Markdown styling contract the transformer relies on.

## Modules

TBD after initial codebase ingest.

## Workflows

- [Live TUI check](./workflows/live-tui-check.md): safe procedure for driving pi in tmux against a copied session, including how to exit without sending a model request.

## Research

- [Opus narration hidden as thinking](./research/opus-narration-hidden-as-thinking.md): Handoff. Why Opus 5.5 answers vanish before ask_user_question, replay test results, and the proposed extension.

## Dream memory

- [Dream pointer index](./dreams/MEMORY.md): conditional pointers to dynamic pages.
- [Episode catalog](./dreams/episodes.jsonl): metadata for immutable Dream episode logs under `dreams/`.
- Per-spec ledgers: `dreams/by-spec/<item-id>.md`, historical Dream checkpoint learnings for one work item.
- Workflow retrospectives: `dreams/retrospectives/<item-id>.md`, historical workflow evidence for one work item.

## Stale or needs review

None recorded.
