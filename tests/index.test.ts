import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtensionAPI, MarkdownTransformContext, MarkdownTransformer } from "@earendil-works/pi-coding-agent";
import visibleClaudeNarration from "../src/index.js";
import { COLORS, narrationSignature, stubTheme, thinkingSignature } from "./helpers.js";

type Handler = (event: unknown, ctx: unknown) => unknown;

const thinkingCtx: MarkdownTransformContext = { messageType: "assistant-thinking", isStreaming: false, availableWidth: 80 };
const narration = (thinking: string) => ({ type: "thinking", thinking, thinkingSignature: narrationSignature() });
const reasoning = (thinking: string) => ({ type: "thinking", thinking, thinkingSignature: thinkingSignature() });
const assistant = (...content: unknown[]) => ({ role: "assistant", content });
const entry = (message: unknown) => ({ type: "message", id: "e", parentId: null, timestamp: "", message });

/** Fake pi API that records every registration and fails on any write. */
class FakePi {
  readonly handlers = new Map<string, Handler[]>();
  readonly transformers: MarkdownTransformer[] = [];
  readonly calls: string[] = [];
  entries: unknown[] = [];
  readonly theme = stubTheme();

  readonly api = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        if (property === "on") {
          return (event: string, handler: Handler) => {
            this.calls.push(`on:${event}`);
            this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
            return () => undefined;
          };
        }
        if (property === "registerMarkdownTransformer") {
          return (transformer: MarkdownTransformer) => {
            this.calls.push("registerMarkdownTransformer");
            this.transformers.push(transformer);
          };
        }
        return (..._args: unknown[]) => {
          this.calls.push(property);
          throw new Error(`unexpected pi.${property}`);
        };
      },
    },
  ) as unknown as ExtensionAPI;

  ctx() {
    const writes = this.calls;
    const sessionManager = new Proxy(
      { getEntries: () => this.entries },
      {
        get: (target, property: string) => {
          if (property === "getEntries") return target.getEntries;
          return () => {
            writes.push(`sessionManager.${property}`);
            throw new Error(`unexpected sessionManager.${property}`);
          };
        },
      },
    );
    return { ui: { theme: this.theme }, sessionManager };
  }

  emit(event: string, payload: unknown): unknown[] {
    return (this.handlers.get(event) ?? []).map((handler) => handler(payload, this.ctx()));
  }

  transform(markdown: string): string {
    assert.equal(this.transformers.length, 1);
    return this.transformers[0]!(markdown, thinkingCtx);
  }
}

function load(): FakePi {
  const pi = new FakePi();
  visibleClaudeNarration(pi.api);
  return pi;
}

const styled = (out: string) => out.includes(`38;2;${COLORS.text}m`);

describe("extension wiring", () => {
  test("registers one transformer and only session_start and message_end handlers", () => {
    const pi = load();
    assert.deepEqual(pi.calls.sort(), ["on:message_end", "on:session_start", "registerMarkdownTransformer"]);
    for (const forbidden of ["context", "context_with_system", "before_provider_request"]) {
      assert.equal(pi.handlers.has(forbidden), false, forbidden);
    }
  });

  test("is a no-op before any session starts", () => {
    const pi = load();
    pi.emit("message_end", { type: "message_end", message: assistant(narration("Early.")) });
    assert.equal(pi.transform("Early."), "Early.");
  });

  for (const reason of ["startup", "reload", "new", "resume", "fork"]) {
    test(`session_start (${reason}) rebuilds narration from all entries`, () => {
      const pi = load();
      pi.entries = [entry(assistant(narration("Old narration.")))];
      pi.emit("session_start", { type: "session_start", reason });
      assert.ok(styled(pi.transform("Thinking.\n\nOld narration.")));

      pi.entries = [entry({ role: "user", content: "hi" }), entry(assistant(reasoning("r"), narration("New narration.")))];
      pi.emit("session_start", { type: "session_start", reason });
      assert.equal(pi.transform("Old narration."), "Old narration.", "previous session cleared");
      assert.ok(styled(pi.transform("New narration.")));
    });
  }

  test("message_end adds narration and returns no replacement", () => {
    const pi = load();
    pi.emit("session_start", { type: "session_start", reason: "startup" });
    const message = assistant(reasoning("Let me check."), narration("Checking the build now."), { type: "toolCall", id: "t", name: "bash", arguments: {} });
    const snapshot = JSON.stringify(message);
    const results = pi.emit("message_end", { type: "message_end", message });
    assert.deepEqual(results, [undefined]);
    assert.equal(JSON.stringify(message), snapshot, "message not mutated");
    const out = pi.transform("Let me check.\n\nChecking the build now.");
    assert.ok(out.startsWith("Let me check.\n\n"));
    assert.ok(styled(out));
  });

  test("message_end ignores non-assistant and malformed messages without throwing", () => {
    const pi = load();
    pi.emit("session_start", { type: "session_start", reason: "startup" });
    assert.deepEqual(pi.emit("message_end", { type: "message_end", message: { role: "user", content: [narration("x")] } }), [undefined]);
    assert.deepEqual(pi.emit("message_end", { type: "message_end", message: null }), [undefined]);
    assert.deepEqual(pi.emit("message_end", { type: "message_end" }), [undefined]);
    assert.equal(pi.transform("x"), "x");
  });

  test("survives a failing session scan and makes no session writes", () => {
    const pi = load();
    pi.entries = null as unknown as unknown[];
    assert.doesNotThrow(() => pi.emit("session_start", { type: "session_start", reason: "resume" }));
    assert.equal(pi.calls.filter((call) => call.startsWith("sessionManager.")).length, 0);
    assert.equal(pi.calls.filter((call) => !call.startsWith("on:") && call !== "registerMarkdownTransformer").length, 0);
  });
});
