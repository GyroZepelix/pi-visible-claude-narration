# Handoff: Opus 5.5 replies hidden as thinking before ask_user_question

Status: research complete, extension not built yet. Written 2026-10-27.

## TL;DR

- Claude Opus 5.5 (also Fable 5.1, and per Anthropic docs Mythos 5.1, Sonnet 5.5, Fable 5) writes short user-facing "progress updates" right before a tool call.
- The Anthropic API returns each progress update as a signed `thinking` block, not a `text` block.
- Pi requests `thinking.display: "summarized"`, where progress updates are indistinguishable from reasoning by their text. Pi stores and renders them as thinking, so they are collapsed or hidden in the TUI.
- Result: when the user asks a question inside an `ask_user_question` flow, the model answers in a progress update and immediately re-asks. The model believes it answered (it did, from its point of view). The user sees nothing.
- System-prompt rules do not fix it. A 45-run replay test showed no measurable improvement from three rule wordings.
- Fix: this repository should hold a pi extension that detects progress-update blocks (signature header kind `narration`) and shows their text as visible reply text, without changing what is replayed to the API. A separate upstream issue for pi should also be filed.

## Symptom

Typical failing turn, observed in real sessions:

1. Agent asks a question with `ask_user_question`.
2. User types a free-text reply that is itself a question, for example "does this consume alot of extra tokens?".
3. Next assistant message content is `thinking, thinking, toolCall(ask_user_question)` with no `text` block.
4. The second "thinking" block contains the actual answer, addressed to the user, for example: "This costs no tokens, it's just a tiny 5-10 byte control message that never reaches the model's context or billing...".
5. The user only sees a new questionnaire, sometimes with the answer squeezed into the question text ("(No token cost either way.)").

Real occurrences (session files under `~/.pi/agent/sessions/`):

| Entry id | Session file | User input |
| --- | --- | --- |
| `ee653be1` | `--Users-dgjalic-Documents-1-Projects-10-software-development-50-pi-extensions-pi-interactive-subagents--/2026-10-25T05-38-55-796Z_01a17191-b0b4-76af-ab50-ab036471bc60.jsonl` | "what d o you mean sending done, does it literaly send a `done` message?" |
| `4796ddb9` | same as above | "does this consume alot of extra tokens?" |
| `46343d08` | `--Users-dgjalic-Documents-1-Projects-10-software-development-50-pi-extensions-pi-cursor-provider--/2026-10-25T07-28-11-744Z_01a171f5-b9e0-70a7-a942-5f6ff0831596.jsonl` | "please explain me this scan we are waiting for" |
| `78b6693d` | `--Users-dgjalic-Documents-1-Projects-12-devops-home-server-management--/2026-10-25T09-35-57-819Z_01a1726a-b37b-7561-9ce3-6671d5134477.jsonl` | "why do you need this" |
| `caa743c4` | same as above | "what is the point of this test" |
| `1b760dbd` | `--Users-dgjalic-Documents-1-Projects-12-devops-home-server-management-davor-requests--/2026-10-25T08-45-52-080Z_01a1723c-d650-7772-b43a-0925f038d79b.jsonl` | "why am I able to view davors private repos" |

The original analysis session is `~/.pi/agent/sessions/--Users-dgjalic-.dotfiles--/2026-10-25T06-08-46-523Z_01a171ad-03bb-73a9-b5b1-070421b5b428.jsonl` (finding F9 there). The session that produced this handoff is `~/.pi/agent/sessions/--Users-dgjalic--/2026-10-27T15-46-05-232Z_01a17e0a-472f-727a-ab02-aacdbcdfaf48.jsonl`.

## Root cause

### Anthropic behavior

From the Anthropic thinking docs (section "Progress updates between tool calls"):

- On Claude Fable 5.1, Mythos 5.1, Opus 5.5, Sonnet 5.5, and Fable 5, the model can write a progress update between tool calls: a note "written for the person watching the agent rather than as reasoning".
- Each progress update comes back as its own `thinking` block with its own `signature`, placed immediately before the `tool_use` block it introduces. At most one per tool call, and the model can skip them.
- What the block contains depends on `thinking.display`:
  - `"omitted"` (API default on these models): empty text for both reasoning and progress updates.
  - `"updates"` (beta, header `anthropic-beta: thinking-display-updates-2026-08-18`): reasoning blocks empty, progress-update blocks readable.
  - `"summarized"`: both readable, and not distinguishable from each other by their text.
- Docs say to treat signatures as opaque and to pass thinking blocks back unchanged when returning tool results.

### Pi behavior

- Installed pi: `@earendil-works/pi-coding-agent` 1.4.0 (global bun install).
- `@earendil-works/pi-ai/dist/api/anthropic-messages.js` (around line 985 to 1006) sends `thinking: { type: "adaptive", display: options.thinkingDisplay ?? "summarized" }`.
- No code in the installed pi packages mentions `narration` or progress updates. Progress-update blocks are stored as ordinary `{ type: "thinking", thinking, thinkingSignature }` content and rendered as thinking.

### How to tell a progress update apart

The `thinkingSignature` is base64 protobuf with a cleartext header. Header field 8 is the block kind: `thinking` for reasoning, `narration` for progress updates. Quick check:

```bash
echo "$SIG" | base64 -d | head -c 60 | strings -n 4
# reasoning block  -> "... thinking ..."
# progress update  -> "... narration ..."
```

Observed prefixes: reasoning signatures start `CAQSngcKEAgTGAI4AUIIdGhpbmtpbmc` (`thinking`), narration signatures `CAQSiwoKEQgTGAI4AUIJbmFycmF0aW9u` (`narration`).

Caveat: this relies on an undocumented header. Anthropic says signatures are opaque, so the format can change. Fail safe: anything not exactly `narration` stays reasoning.

### Scale

Scan of all local sessions (assistant messages that carry thinking signatures):

| Model | Assistant messages with signatures | Messages with a narration block | Of those, with a `text` block |
| --- | --- | --- | --- |
| `claude-opus-5-5` | 2665 | 206 | 0 |
| `claude-fable-5-1` | 94 | 24 | 0 |
| `claude-opus-5`, `claude-sonnet-5` | 355 | 0 | 0 |

A narration block never co-occurs with a `text` block: the narration is the model's visible reply in that message.

## What was tried and what did not work

### Prompt rules (did not work)

Three variants of the ask_user_question rules in `~/.dotfiles/02-agentic-llms/.pi/agent/APPEND_SYSTEM.md` were tested:

- `old`: "If my reply to a question is itself a question... first answer it fully in visible text, then ask the question again" plus "Put explanations in your visible reply, never only in thinking or inside a question." This was already active during 4 of the 6 real failures.
- `user`: `old` plus "If you wish to comment on something before ask_user_question, do that in regular output and not in thinking".
- `new`: the rewrite currently in the file: "I cannot see your thinking. Write every answer, explanation, or comment meant for me as visible text in the same message, before any ask_user_question call. Do not put explanations inside question text. If you have something to tell me, never send a message that contains only thinking and an ask_user_question call."

The model's own reasoning in failing runs often says "I should explain this in visible text before re-asking", then emits the explanation as a progress update. From the model's side the progress update is visible text, so rules about thinking do not apply.

### Replay test

Method (`research/narration-replay/replay.ts`, run with `bun`):

1. Copy a real session up to the failing assistant entry (the last kept entry is the `ask_user_question` tool result with the user's typed question).
2. Replace the rule block inside the recorded system prompt (`sections.addendum` of system message entries and of `compaction.systemMessage`). Patching compaction snapshots matters; without it the compacted home-server session silently kept the original prompt.
3. Open the copy with the pi SDK (`createAgentSession` + `SessionManager.open`), call `session.agent.continue()`, capture the first assistant message, abort.
4. Verdict: `PASS` if visible `text` is at least 40 characters, `FAIL` if it calls `ask_user_question` without visible text.

Results, claude-opus-5-5, thinking high, 3 runs per cell (raw rows in `research/narration-replay/results.jsonl`):

| Failure point | old | user | new |
| --- | --- | --- | --- |
| `ee653be1` | 0/3 | 1/3 | 1/3 |
| `4796ddb9` | 0/3 | 0/3 | 0/3 |
| `46343d08` | 1/3 | 3/3 | 2/3 |
| `78b6693d` | 2/3 | 3/3 | 1/3 |
| `caa743c4` | 1/3 | 0/3 | 0/3 |
| Total | 4/15 | 7/15 | 4/15 |

Every `FAIL` had the content shape `reasoning, narration, toolCall` (verified by decoding signatures). Differences between variants are within noise. Conclusion: the problem is in how pi presents the response, not in what the model decides to say.

Other supporting files in `research/narration-replay/`:

- `scan_silent_ask.py`: finds ask_user_question calls that follow a question-like user input with no visible text in between.
- `new_rule.md`: the `new` rule text used by the harness.
- `oh-my-pi-50ec66f.patch`: the upstream fork fix described below.

## Prior art: oh-my-pi fix

`can1357/oh-my-pi` commit `50ec66f` "fix(ai): show Anthropic between-tool narration as reply text" (2026-10-17) fixes exactly this:

- `packages/ai/src/providers/anthropic-signature.ts`: parses the signature protobuf (outer field 2, envelope field 1 = header, header field 8 = kind) and adds `isAnthropicNarrationSignature()`, which matches only the exact bytes `narration`. No upper length bound on the signature, since long narrations produce signatures over 13k characters.
- `packages/ai/src/providers/anthropic.ts`: on `thinking_end`, sets `block.narration = true` when the signature is narration.
- `packages/ai/src/types.ts`: `ThinkingContent.narration?: boolean`.
- `packages/ai/src/utils/narration.ts`: `presentNarrationAsAnswer(message)` maps narration thinking blocks to text blocks for display only.
- TUI, streaming reveal, print mode, ACP, RPC wire, and HTML export use the presented view; replay to the API keeps the original signed thinking block.

## Proposed extension (this repository)

Goal: show progress-update text as normal reply text in pi, with zero change to what is sent back to Anthropic.

Requirements:

- Detect narration blocks by signature header kind (port `isAnthropicNarrationSignature` and its protobuf helper from the oh-my-pi patch; add unit tests with real signatures from the sessions above).
- Never modify, drop, or reorder the signed thinking block in model context. Anthropic requires thinking blocks to be passed back unchanged within a tool loop.
- Show the text visibly in the interactive TUI, ideally before the `ask_user_question` overlay appears, since that is the main failure case.
- Fail safe: unreadable or unknown signatures are treated as reasoning.

Candidate integration points in pi 1.4.0 (verify against `docs/extensions.md` and `extensions/types.ts` before choosing):

1. `message_end` handler plus a display-only entry: detect narration on the finalized assistant message, then `pi.appendEntry()` a custom entry (excluded from model context) and register an entry renderer that draws the text like a normal reply. Safest for replay. Open question: ordering relative to the tool call and the ask_user_question overlay.
2. A custom renderer for assistant thinking blocks, if pi exposes one, that renders narration blocks as text. Cleanest UX, but needs checking whether thinking rendering is extensible.
3. `message_end` replacement that adds a separate `text` block next to the narration block. Not recommended: it changes model context and risks signature or prefix-binding checks (sessions already show `thinking_dropped` with reason `prefix_binding_mismatch` diagnostics).
4. Alternative: request `display: "updates"` (beta) through `before_provider_request`, then render non-empty thinking blocks as text. Loses reasoning summaries in the UI and needs the beta header. Only if signature parsing turns out to be unreliable.

Also check: streaming (narration is only identifiable at `thinking_end`, when the signature arrives), HTML export, and the `ask_user_question` overlay from `rpiv-ask-user-question`, which may cover text rendered just before it.

Verification plan:

- Unit: narration and reasoning signatures taken from the sessions listed above.
- Replay: reuse `research/narration-replay/replay.ts` on `4796ddb9` (fails 100% of the time) and confirm the narration text would be displayed.
- Manual: in a real session with claude-opus-5-5, reply to an `ask_user_question` with a question and confirm the answer is visible.

## Upstream issue (O2), draft

Title: Anthropic progress updates (narration) are rendered as thinking

Body outline:

- Opus 5.5, Fable 5.1, and other new models return between-tool progress updates as signed `thinking` blocks. Pi requests `display: "summarized"` and renders them as reasoning, so user-facing replies are hidden.
- Impact: the model answers the user in a progress update, then calls a tool such as a question tool. The user sees no answer.
- Evidence: 206 of 2665 Opus 5.5 messages in one user's sessions contain such blocks, never alongside a `text` block.
- Detection: signature header kind `narration` (as in oh-my-pi `50ec66f`), or `display: "updates"` per Anthropic docs.
- Ask: flag these blocks (for example `ThinkingContent.narration`) and render them as reply text while replaying them unchanged.

## Current state of related config

- `~/.dotfiles/02-agentic-llms/.pi/agent/APPEND_SYSTEM.md` keeps the `new` rule by user decision (harmless, may help once narration is visible). The file change is uncommitted.

## Sources

- Anthropic, Thinking docs, "Progress updates between tool calls" and "Controlling thinking display": https://platform.claude.com/docs/en/build-with-claude/thinking
- oh-my-pi commit 50ec66f: https://github.com/can1357/oh-my-pi/commit/50ec66f75d57ad55838a9fe4da5e66f29af4d73c
- Local evidence: session files listed above, `research/narration-replay/`.
