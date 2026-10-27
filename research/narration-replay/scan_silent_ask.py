#!/usr/bin/env python3
"""Find ask_user_question calls where the user's latest input was a question or
confusion, but the assistant emitted no visible text before re-asking."""
import json, os, re, sys, glob

ROOT = os.path.expanduser("~/.pi/agent/sessions")
Q_RE = re.compile(r"\?|\b(what|why|how|explain|dont understand|don't understand|confus|mean)\b", re.I)


def text_of(content):
    if isinstance(content, str):
        return content
    return " ".join(c.get("text", "") for c in content if c.get("type") == "text")


def user_input(msg):
    """Return the user's free-text input carried by msg, or None."""
    m = msg.get("message", {})
    role = m.get("role")
    if role == "user":
        t = text_of(m.get("content", ""))
        if t.lstrip().startswith(("<skill", "<file")):
            return None
        return t
    if role == "toolResult" and m.get("toolName") == "ask_user_question":
        d = m.get("details") or {}
        typed = [a.get("answer", "") for a in d.get("answers", []) if a.get("kind") == "custom"]
        notes = [a.get("note", "") for a in d.get("answers", []) if a.get("note")]
        t = " | ".join(x for x in typed + notes if x)
        return t or ""  # "" means option picked, still a user input boundary
    return None


rows = []
for f in glob.glob(f"{ROOT}/*/*.jsonl"):
    if "ez-eval" in f:
        continue
    byid = {}
    try:
        for line in open(f):
            try:
                e = json.loads(line)
            except Exception:
                continue
            if e.get("type") == "message" and e.get("id"):
                byid[e["id"]] = e
    except Exception:
        continue
    for e in byid.values():
        m = e["message"]
        if m.get("role") != "assistant" or not isinstance(m.get("content"), list):
            continue
        if not any(c.get("type") == "toolCall" and c.get("name") == "ask_user_question" for c in m["content"]):
            continue
        # walk back to latest user input
        texts, thinking = [], []
        cur, inp = e, None
        hops = 0
        while cur and hops < 200:
            cm = cur["message"]
            if cm.get("role") == "assistant" and isinstance(cm.get("content"), list):
                texts += [c.get("text", "") for c in cm["content"] if c.get("type") == "text"]
                thinking += [c.get("thinking", "") for c in cm["content"] if c.get("type") == "thinking"]
            if cur is not e:
                ui = user_input(cur)
                if ui is not None:
                    inp = ui
                    break
            cur = byid.get(cur.get("parentId"))
            hops += 1
        if not inp or not Q_RE.search(inp):
            continue
        visible = sum(len(t.strip()) for t in texts)
        rows.append({
            "file": f.replace(ROOT + "/", ""),
            "id": e["id"],
            "ts": e.get("timestamp", ""),
            "model": m.get("model"),
            "input": inp[:160].replace("\n", " "),
            "visible_chars": visible,
            "thinking": " ".join(thinking)[:200].replace("\n", " "),
        })

rows.sort(key=lambda r: r["ts"])
silent = [r for r in rows if r["visible_chars"] < 40]
print(f"ask calls after a question-like user input: {len(rows)}; silent (<40 visible chars): {len(silent)}\n")
mode = sys.argv[1] if len(sys.argv) > 1 else "silent"
for r in (silent if mode == "silent" else rows):
    print(f"{r['ts'][:16]} {r['model']} vis={r['visible_chars']} id={r['id']}\n  file: {r['file']}\n  user: {r['input']}\n  think: {r['thinking']}\n")
