// Replay a recorded pi session up to a given assistant message, swap the
// ask_user_question visibility rules in the recorded system prompt, and record
// what the model produces next. Usage:
//   bun replay.ts <sessionFile> <assistantEntryId> <variant> <runs>
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { createAgentSession, SessionManager } from "/Users/dgjalic/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/index.js";

const [sessionFile, cutId, variant, runsArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 1);

const ASK = "- Ask with ask_user_question, whenever you need my input\n";
const D7A =
  "- If my reply to a question is itself a question, objection, or sign of\n" +
  "  confusion, first answer it fully in visible text, then ask the question\n" +
  "  again, revised if your answer changes it.\n";
const D7B = "- Put explanations in your visible reply, never only in thinking or inside\n  a question.\n";
const USER35 = "- If you wish to comment on something before ask_user_question, do that in regular output and not in thinking\n";
const VARIANTS: Record<string, string> = {
  old: ASK + D7A + D7B,
  user: ASK + D7A + USER35 + D7B,
  new: ASK + D7A + readFileSync(process.env.NEW_RULE_FILE ?? "/tmp/thinkfix/new_rule.md", "utf8"),
};
const block = VARIANTS[variant];
if (!block) throw new Error(`unknown variant ${variant}`);

function patchAddendum(a: string): string {
  for (const s of [ASK, D7A, D7B, USER35]) a = a.split(s).join("");
  const anchor = "  sentences instead.\n";
  if (!a.includes(anchor)) throw new Error("anchor not found in addendum");
  return a.replace(anchor, anchor + block);
}

const lines = readFileSync(sessionFile, "utf8").split("\n").filter(Boolean);
const cutIdx = lines.findIndex((l) => l.includes(`"id":"${cutId}"`));
if (cutIdx < 0) throw new Error("cut id not found");
const target = JSON.parse(lines[cutIdx]);
const header = JSON.parse(lines[0]);
const kept = lines.slice(0, cutIdx).map((l) => {
  const e = JSON.parse(l);
  if (e.type === "message" && e.message?.role === "system" && typeof e.message.sections?.addendum === "string") {
    e.message.sections.addendum = patchAddendum(e.message.sections.addendum);
  }
  if (e.type === "compaction" && typeof e.systemMessage?.sections?.addendum === "string") {
    e.systemMessage.sections.addendum = patchAddendum(e.systemMessage.sections.addendum);
  }
  return JSON.stringify(e);
});
const lastId = JSON.parse(kept[kept.length - 1]).id;
if (lastId !== target.parentId) console.error(`WARN leaf ${lastId} != parent ${target.parentId}`);

const outDir = "/tmp/thinkfix/runs";
mkdirSync(outDir, { recursive: true });

for (let i = 0; i < runs; i++) {
  const copy = `${outDir}/${cutId}-${variant}-${i}-${Date.now()}.jsonl`;
  writeFileSync(copy, kept.join("\n") + "\n");
  const { session } = await createAgentSession({
    cwd: header.cwd,
    sessionManager: SessionManager.open(copy, outDir, header.cwd),
  });
  const tools = session.getActiveToolNames();
  const sys = JSON.stringify(session.agent.state.messages?.find?.((m: any) => m.role === "system") ?? "");
  let result: any = null;
  const done = new Promise<void>((resolve) => {
    session.subscribe((ev: any) => {
      if (ev.type === "message_end" && ev.message.role === "assistant" && !result) {
        result = ev.message;
        session.abort().finally(() => resolve());
      }
    });
  });
  const t0 = Date.now();
  session.agent.continue().catch((e: any) => console.error("continue error", e?.message));
  await Promise.race([done, new Promise((r) => setTimeout(r, 300_000))]);
  const c = result?.content ?? [];
  const texts = c.filter((x: any) => x.type === "text").map((x: any) => x.text);
  const calls = c.filter((x: any) => x.type === "toolCall").map((x: any) => x.name);
  const thinking = c.filter((x: any) => x.type === "thinking").map((x: any) => x.thinking);
  const visible = texts.join("").trim().length;
  const asks = calls.includes("ask_user_question");
  const verdict = visible >= 40 ? "PASS" : asks ? "FAIL" : calls.length ? "OTHER_TOOL" : "EMPTY";
  const rec = {
    cutId, variant, run: i, verdict, visible, calls, order: c.map((x: any) => x.type),
    model: result?.model, stop: result?.stopReason, secs: Math.round((Date.now() - t0) / 1000),
    hasAskTool: tools.includes("ask_user_question"),
    sysHasVariant: sys.includes(block.trim().split("\n").pop()!.trim()),
    text: texts.join("\n---\n").slice(0, 1500),
    thinking: thinking.join("\n---\n").slice(0, 1500),
    askArgs: JSON.stringify(c.find((x: any) => x.type === "toolCall")?.arguments ?? null).slice(0, 800),
  };
  appendFileSync("/tmp/thinkfix/results.jsonl", JSON.stringify(rec) + "\n");
  console.log(`${cutId} ${variant} #${i}: ${verdict} visible=${visible} calls=${calls} order=${rec.order} askTool=${rec.hasAskTool} sysOK=${rec.sysHasVariant} ${rec.secs}s`);
  session.dispose();
}
process.exit(0);
