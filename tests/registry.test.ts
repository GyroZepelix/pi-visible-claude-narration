import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NarrationRegistry, narrationTexts } from "../src/registry.js";
import { narrationSignature, thinkingSignature } from "./helpers.js";

const reasoning = (thinking: string) => ({ type: "thinking", thinking, thinkingSignature: thinkingSignature() });
const narration = (thinking: string) => ({ type: "thinking", thinking, thinkingSignature: narrationSignature() });
const assistant = (...content: unknown[]) => ({ role: "assistant", content });

describe("narrationTexts", () => {
  test("collects only thinking blocks with narration signatures, trimmed", () => {
    const message = assistant(
      reasoning("I should check the log."),
      narration("  The build is running.\n"),
      { type: "text", text: "Visible reply" },
      { type: "toolCall", id: "t1", name: "bash", arguments: {} },
    );
    assert.deepEqual(narrationTexts(message), ["The build is running."]);
  });

  test("ignores user and tool result messages even with narration-shaped blocks", () => {
    assert.deepEqual(narrationTexts({ role: "user", content: [narration("hi")] }), []);
    assert.deepEqual(narrationTexts({ role: "toolResult", content: [narration("hi")] }), []);
  });

  test("ignores text blocks, empty narration, redacted blocks, missing signatures, and malformed input", () => {
    const message = assistant(
      { type: "text", text: "x", thinkingSignature: narrationSignature() },
      narration("   "),
      { ...narration("secret"), redacted: true },
      { type: "thinking", thinking: "no signature" },
      { type: "thinking", thinking: 42, thinkingSignature: narrationSignature() },
      null,
      "string block",
    );
    assert.deepEqual(narrationTexts(message), []);
    for (const input of [undefined, null, "x", 1, { role: "assistant" }, { role: "assistant", content: "x" }]) {
      assert.deepEqual(narrationTexts(input), []);
    }
  });
});

describe("NarrationRegistry", () => {
  test("addFromMessage adds narration and reports the count", () => {
    const registry = new NarrationRegistry();
    assert.equal(registry.addFromMessage(assistant(reasoning("r"), narration("First."), narration("Second."))), 2);
    assert.deepEqual([...registry.values()], ["First.", "Second."]);
    assert.equal(registry.has("  First.  "), true);
    assert.equal(registry.has("r"), false);
  });

  test("rebuildFromEntries scans assistant message entries only and replaces previous contents", () => {
    const registry = new NarrationRegistry();
    registry.addFromMessage(assistant(narration("Old session narration.")));
    registry.rebuildFromEntries([
      { type: "session_info", name: "x" },
      { type: "message", message: { role: "user", content: [narration("user text")] } },
      { type: "message", message: assistant(reasoning("thinking"), narration("Branch A narration.")) },
      { type: "message", message: { role: "toolResult", content: [narration("tool")] } },
      { type: "custom", message: assistant(narration("custom entry")) },
      { type: "message", message: assistant(narration("Branch B narration.")) },
      null,
    ]);
    assert.deepEqual([...registry.values()], ["Branch A narration.", "Branch B narration."]);
  });

  test("clear empties the registry", () => {
    const registry = new NarrationRegistry();
    registry.addFromMessage(assistant(narration("x")));
    registry.clear();
    assert.equal(registry.size, 0);
  });
});
