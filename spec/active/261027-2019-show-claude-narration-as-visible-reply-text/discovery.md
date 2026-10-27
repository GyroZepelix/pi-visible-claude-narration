# Discovery: Show Claude narration as visible reply text

Work item: `261027-2019-show-claude-narration-as-visible-reply-text`
Status: Ready for To Spec
Created: 2026-10-27
Updated: 2026-10-27

Assurance: medium - the extension runs on every Claude response in every session, and a context or replay bug could break Anthropic requests; it is local, single-user, and reversible by removing the extension; no secrets, migrations, or production systems are involved. (User decision, round 1.)

## Objective

Make Anthropic progress updates ("narration") visible and distinguishable from reasoning in pi, so answers the model addresses to the user before a tool call (especially before `ask_user_question`) are not mistaken for internal thinking.

## Desired outcome

When Claude Opus 5.5 (or another model that emits progress updates) writes a narration block, the pi TUI shows that text clearly as a reply to the user, in a different color from reasoning, while the data sent back to Anthropic stays valid.

## Repository and domain context

- Background and evidence: `wiki/research/opus-narration-hidden-as-thinking.md` (handoff), `research/narration-replay/` (replay harness, scan script, 45-run results, oh-my-pi patch).
- Repository is new: wiki and spec template installed, no source yet, no commits.
- Target runtime: pi `@earendil-works/pi-coding-agent` 1.4.0 installed globally with bun; user settings `hideThinkingBlock: false`, theme `dark`.
- Sibling extension conventions (`../pi-ez-session-name`): TypeScript, `package.json` `pi.extensions`, `node --import tsx --test`, `tsc --noEmit`, devDependency `@earendil-works/pi-coding-agent` 1.4.0.

## Scope

- A pi extension in this repository that detects narration blocks and renders them distinguishably.
- An upstream pi issue draft stored in the repository (filing is a later, separately approved step).
- Publishing the repository to GitHub as part of this work (Q4), subject to approval at execution time.

## Out of scope

- Prompt-rule changes in `APPEND_SYSTEM.md` (kept as is by user decision).
- Filing the upstream issue during this item.
- Showing narration when thinking blocks are hidden or collapsed (D13).
- Print mode, RPC, and HTML export rendering (display-only coloring targets the interactive TUI).
- Live recoloring during streaming before the signature arrives (D7).
- Changing Anthropic request parameters such as `thinking.display`.

## Confirmed facts and evidence

- Fact: Anthropic returns progress updates as signed `thinking` blocks placed right before the tool call they introduce (Anthropic thinking docs, "Progress updates between tool calls").
- Fact: pi requests `display: "summarized"` (`pi-ai/dist/api/anthropic-messages.js` around line 985), so narration text is readable but indistinguishable from reasoning by text.
- Fact: the signature header field 8 holds the block kind. A real Opus 5.5 narration signature (`4796ddb9`) decodes to header fields `1=19, 3=2, 7=1, 8="narration"` only. No model id or org id is present in this signature format.
- Fact: `message_end` handlers can replace a finalized message; pi mutates it in place before the TUI re-renders it and before session persistence (`agent-session.js` `_replaceMessageInPlace`, `interactive-mode.js` message_end path).
- Fact: `context` handlers can rewrite the messages sent before each LLM call.
- Fact: there is no extension hook for rendering built-in thinking blocks. `registerMarkdownTransformer` runs on thinking Markdown with `messageType: "assistant-thinking"`.
- Fact: the TUI merges consecutive thinking blocks (reasoning plus narration) into one Markdown component colored `thinkingText` and italic (`components/assistant-message.js` `updateContent`).
- Fact: ANSI color codes inserted into Markdown survive pi-tui `Markdown` rendering inside the outer thinking color (isolated spike, `/tmp/thinkfix/ansi.ts`). Not yet verified in the live TUI.
- Fact: `rpiv-ask-user-question` normally mounts in the editor slot, so transcript text above it stays visible.
- Fact: `gh` CLI is not installed on this machine.
- Fact: oh-my-pi (fork of pi) and sibling repos such as `pi-aware` are MIT licensed, so porting the oh-my-pi signature parser with attribution is permitted.
- Fact: pi-tui `Markdown` keeps injected ANSI colors across wrapped lines (mock render).

## Constraints and invariants

- Signed thinking blocks must reach Anthropic unchanged within a tool loop (Anthropic docs).
- Detection must fail safe: any signature that does not decode to exactly `narration` is treated as reasoning.

## Confirmed decisions

| ID | Decision | Rationale | Evidence | Revisit when |
| --- | --- | --- | --- | --- |
| D1 | Item title "Show Claude narration as visible reply text". | User confirmed. | Round 1 Q1. | - |
| D2 | Narration may stay a thinking block; it must be rendered in a different color when tagged as narration. | User preference over the proposed text-block swap. | Round 1 Q2 answer. | Spike shows color cannot be applied reliably. |
| D3 | Publish to a GitHub repository now rather than local-path only. | User decision. | Round 1 Q4. | - |
| D4 | Upstream issue: draft in repo, file later. | User decision. | Round 1 Q5. | - |
| D5 | Assurance medium. | User confirmed recommendation. | Round 1 Q7. | Evidence of broader blast radius. |
| D6 | Mechanism: display-only coloring. The extension identifies narration blocks by signature and recolors their text inside the rendered thinking Markdown via `registerMarkdownTransformer`. Stored messages and LLM context are never modified. | Satisfies D2 with no API or replay risk. | Round 2 Q2b; Fact on transformer scope and ANSI spike. | Live TUI shows ANSI passthrough does not hold. |
| D7 | Timing: color applies when the reply finishes (narration is identifiable only once the signature is complete); pi re-renders the message at `message_end`. | Follows from D6. | Round 1 Q3 deferred to Q2; `interactive-mode.js` message_end path. | - |
| D8 | Test data: committed tests use synthetic signatures built by a helper; real session signatures are used only in a local, untracked check. | User decision after the Fa6 correction. | Round 2 Q6. | - |
| D9 | Also color narration in resumed sessions by scanning the session branch on start. | User decision. | Round 2 Q9. | Startup cost becomes noticeable. |
| D10 | GitHub repo `GyroZepelix/pi-visible-claude-narration`, created empty by the user on github.com; the agent adds the remote and pushes only after approval. | User decision; `gh` is not installed. | Round 2 Q10. | - |
| D11 | Repository visibility: public. | User decision; upstream issue can link to it. | Round 2 Q11. | - |
| D12 | Narration style: theme accent `> ` marker followed by the narration in the theme `text` color, italic turned off (mock variant H). Reasoning keeps `thinkingText` italic. | User picked from the mock. | Round 3 Q8; `/tmp/thinkfix/color-mock.ts`. | Live TUI rendering differs from the mock. |
| D14 | License: MIT, with attribution for the signature parser ported from oh-my-pi. | User decision; matches siblings and upstream. | Synthesis confirmation. | - |
| D13 | When thinking blocks are hidden or collapsed, narration is not shown; this limitation is documented in the README. | Display-only coloring cannot render inside the hidden label; user setting shows thinking. | Round 3 Q12. | User starts hiding thinking. |

## Open questions and prerequisites

- None blocking.
- Unknown (non-blocking): ANSI passthrough in Markdown transformers is current pi behavior, not a documented contract. Owner: implementation; revisit D6 if a pi update breaks it.

## Current frontier

Empty. Shared understanding confirmed 2026-10-27.

## Research index

- `wiki/research/opus-narration-hidden-as-thinking.md`: root cause, prior art, replay results.
- `research/narration-replay/`: harness and raw results.

## Proposed test seams and acceptance evidence

- Unit (committed, synthetic): signature decoder returns `narration` only for an exact kind field; reasoning, malformed, empty, short, and non-base64 signatures return not-narration.
- Unit: Markdown transformer styles only registered narration texts, only for `assistant-thinking`, leaves reasoning and normal assistant text untouched, and is a no-op when nothing is registered.
- Unit: registration from `message_end` events and from a session branch scan (history) collects narration texts only from thinking blocks with narration signatures.
- Local check (untracked): run the decoder over real local sessions; expect narration blocks only in `claude-opus-5-5` and `claude-fable-5-1` messages (previous scan: 206 and 24) and zero false positives in messages that also contain text.
- Live TUI: resume a copy of a session containing `4796ddb9` in tmux, capture with `tmux capture-pane -e`, confirm the narration line carries the accent marker and `text` color while reasoning keeps `thinkingText` italic.
- Checks: `npm run typecheck`, `npm test`.

## Proposed wiki updates after implementation

- Add architecture and module pages for the extension once implemented; update the research page status.

## Resume state

- Rounds 1-3 answered and synthesis confirmed. Next action: run `/skill:to-spec 261027-2019-show-claude-narration-as-visible-reply-text` to write `plan.md`.

## Readiness for To Spec

- [x] Every consequential branch is resolved or explicitly out of scope.
- [x] Facts are distinguished from user decisions and hypotheses.
- [x] Requirements, constraints, and non-goals are clear.
- [x] Acceptance evidence and proposed test seams are defined.
- [x] The user confirmed shared understanding.
