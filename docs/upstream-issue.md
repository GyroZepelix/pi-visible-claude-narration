# Upstream issue draft: Anthropic progress updates (narration) are rendered as thinking

Status: draft, not filed. Target: pi (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`). Observed on 1.4.0.

## Title

Anthropic progress updates (narration) are rendered as thinking

## Symptom

Claude Opus 5.5, Fable 5.1, and other recent Anthropic models write short user-facing progress updates between tool calls. pi renders them as reasoning, so replies the model addressed to the user look like internal thinking and are easy to miss, or invisible when thinking is hidden.

Typical failing turn:

1. The agent asks a question with a question tool (for example `ask_user_question`).
2. The user answers with a question of their own, for example "does this consume a lot of extra tokens?".
3. The next assistant message has the content shape `thinking, thinking, toolCall` with no `text` block.
4. The second thinking block contains the actual answer, written to the user.
5. The user sees only the next question.

## Cause

- The Anthropic API returns each progress update as its own signed `thinking` block, placed immediately before the `tool_use` block it introduces (Anthropic thinking docs, "Progress updates between tool calls").
- pi requests `thinking.display: "summarized"` (`pi-ai/dist/api/anthropic-messages.js`), where progress updates and reasoning are both readable but indistinguishable by their text.
- pi stores these blocks as ordinary `{ type: "thinking", thinking, thinkingSignature }` content and renders them as thinking. Nothing in pi 1.4.0 distinguishes narration.

## Evidence

- In one user's local sessions, 230 of 2883 `claude-opus-5-5` assistant messages and 28 of 102 `claude-fable-5-1` messages that carry thinking signatures contain a narration block. None of those messages also contains a `text` block: the narration is the model's only visible reply in that message.
- No narration was detected in `claude-opus-5`, `claude-sonnet-5`, or non-Anthropic models.
- Prompt rules telling the model to write visible text before question tool calls did not help in a 45-run replay test (4/15, 7/15, and 4/15 passes for three rule variants). Every failure had the shape `reasoning, narration, toolCall`. From the model's side the progress update is visible text.

## Detection approach

The thinking signature is base64 protobuf with a cleartext header: outer field 2 is an envelope, envelope field 1 is the header, header field 8 is the block kind. The kind is `thinking` for reasoning and `narration` for progress updates. oh-my-pi commit [`50ec66f`](https://github.com/can1357/oh-my-pi/commit/50ec66f75d57ad55838a9fe4da5e66f29af4d73c) implements this check (`isAnthropicNarrationSignature`), matching only the exact bytes `narration` and imposing no upper length bound, since long narration signatures exceed 13k characters. Anything else stays reasoning.

The header is not a documented contract. Alternative: request `thinking.display: "updates"` (beta header `thinking-display-updates-2026-08-18`), where only progress updates carry text, at the cost of losing reasoning summaries.

## Request

- Flag narration blocks when the thinking block ends, for example `ThinkingContent.narration?: boolean`.
- Render flagged blocks as reply text in the TUI, print mode, RPC, and HTML export.
- Keep replaying them unchanged as signed thinking blocks, as Anthropic requires within a tool loop.

## Workaround

[pi-visible-claude-narration](https://github.com/GyroZepelix/pi-visible-claude-narration) is a display-only extension that detects narration by signature and restyles it inside the rendered thinking Markdown through `registerMarkdownTransformer`. It cannot show narration while thinking is hidden or collapsed, does not cover print mode, RPC, or HTML export, and relies on ANSI sequences passing through Markdown transformers.

## References

- Anthropic thinking docs, "Progress updates between tool calls" and "Controlling thinking display": https://platform.claude.com/docs/en/build-with-claude/thinking
- oh-my-pi commit 50ec66f: https://github.com/can1357/oh-my-pi/commit/50ec66f75d57ad55838a9fe4da5e66f29af4d73c
