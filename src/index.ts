import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { NarrationRegistry } from "./registry.js";
import { createNarrationTransformer } from "./transform.js";

/**
 * Shows Anthropic progress-update ("narration") thinking blocks as reply text
 * in the interactive TUI. Display-only: it registers a Markdown transformer and
 * reads messages, but never replaces messages, touches LLM context or provider
 * requests, or writes session entries.
 */
export default function visibleClaudeNarration(pi: ExtensionAPI): void {
  const registry = new NarrationRegistry();
  let ui: ExtensionUIContext | undefined;

  pi.registerMarkdownTransformer(createNarrationTransformer(registry, () => ui?.theme));

  pi.on("session_start", (_event, ctx) => {
    ui = ctx.ui;
    try {
      registry.rebuildFromEntries(ctx.sessionManager.getEntries());
    } catch {
      registry.clear();
    }
  });

  pi.on("message_end", (event) => {
    try {
      registry.addFromMessage(event.message);
    } catch {
      // Detection failures leave the message rendered as reasoning.
    }
    return undefined;
  });
}
