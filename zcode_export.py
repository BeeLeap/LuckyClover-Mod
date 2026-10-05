#!/usr/bin/env python3
"""Export zcode sessions to Markdown / structured JSON / opencode import JSON /
ZCode restore-legacy-sessions snapshots.

Reads directly from zcode's sqlite db (read-only). Output files:
    <timestamp>_<title>.md            human-readable transcript
    <timestamp>_<title>.json          full structured data (message/part trees)
    <timestamp>_<title>.opencode.json import-ready, opencode native format
    <workspaceHash>/<session>.json    ZCode restore snapshot (for the official
                                      restore-legacy-sessions plugin; the --out
                                      dir doubles as the --legacy-dir root)

Usage:
  python zcode_export.py list
  python zcode_export.py export <ordinal> [ordinal ...] [all] [-t md,json,opencode,snapshot] [--out DIR] [--with-children]

  -t / --type  output formats, comma- or space-separated (default: md,json)
  --with-children  also export the full descendant tree (subagent_child /
                   fork / grandkids via session.parent_id). Children become
                   independent root sessions in the opencode format (no
                   session parentID, matching opencode's own fork exports);
                   the snapshot format keeps forkedFromTaskId so ZCode can
                   rebuild the task tree.

Default output dir: current working directory (override with --out).
Requires: python 3.7+ (stdlib only, no third-party deps); `opencode` on PATH
          is optional (used only to read the version for the opencode format).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ZDB = (
    os.environ.get("ZCODE_DB")
    or os.path.join(os.path.expanduser("~"), ".zcode", "cli", "db", "db.sqlite")
)
OUTDIR = os.getcwd()

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

# part types opencode's schema understands; zcode extras (timeline,
# compaction, ...) are dropped from the opencode format
KNOWN_OC_PART_TYPES = {"text", "reasoning", "tool", "step-start", "step-finish"}

TYPES = {"md", "json", "opencode", "snapshot"}


def safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", s).strip()[:60]


def ts(ms: int) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ms / 1000))


def stamp(ms: int) -> str:
    return time.strftime("%Y-%m-%d_%H%M", time.localtime(ms / 1000))


def rand(n: int) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def oc_id(prefix: str, ts_ms: int) -> str:
    return f"{prefix}_{ts_ms * 1000 & 0xFFFFFFFFFFFF:012x}{rand(14)}"


def slugify(title: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-").lower()
    return (s[:48] or "zcode-import").rstrip("-")


def find_opencode() -> str | None:
    for cand in ("opencode.exe", "opencode.cmd", "opencode"):
        p = shutil.which(cand)
        if p and not p.lower().endswith(".ps1"):
            return p
    return None


def oc_version() -> str:
    exe = find_opencode()
    if exe:
        try:
            out = subprocess.run([exe, "--version"], capture_output=True,
                                 text=True, timeout=20).stdout.strip()
            m = re.search(r"\d+\.\d+\.\d+", out)
            if m:
                return m.group(0)
        except Exception:
            pass
    return "2"


def render_md(meta, messages):
    lines = [f"# {meta['title']}", "",
             f"- **Session ID**: `{meta['id']}`",
             f"- **Directory**: {meta['directory']}",
             f"- **Created**: {ts(meta['time_created'])}",
             f"- **Updated**: {ts(meta['time_updated'])}",
             f"- **Messages**: {len(messages)}", "", "---"]

    for m in messages:
        info = m["message"]
        role = info.get("role", "?")
        t = ts((info.get("time") or {}).get("created", 0))
        lines += ["", f"## {'USER' if role == 'user' else 'ASSISTANT'}  ({t})", ""]
        for pe in m["parts"]:
            p = pe["part"]
            ty = p.get("type")
            if ty == "text":
                lines.append(p.get("text", ""))
                lines.append("")
            elif ty == "reasoning":
                txt = p.get("text", "").replace("\n", "\n> ")
                lines.append(f"> THINKING: {txt}")
                lines.append("")
            elif ty == "tool":
                st = p.get("state", {})
                inp = json.dumps(st.get("input"), ensure_ascii=False)
                if len(inp) > 300:
                    inp = inp[:300] + "..."
                lines.append(f"> TOOL `{p.get('tool')}` ({st.get('status')}): input = {inp}")
                lines.append("")
        lines.append("---")
    return "\n".join(lines)


def build(meta, msgs, parts):
    by_msg = {}
    for p in parts:
        by_msg.setdefault(p["message_id"], []).append((p["id"], json.loads(p["data"])))

    messages = []
    for m in msgs:
        mdata = json.loads(m["data"])
        plist = [{"id": pid, "part": part} for pid, part in by_msg.get(m["id"], [])]
        messages.append({
            "id": m["id"],
            "role": mdata.get("role", "?"),
            "time_created": m["time_created"],
            "message": mdata,
            "parts": plist,
        })

    return {
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "source": "zcode (sqlite db)",
        "session_id": meta["id"],
        "title": meta["title"],
        "directory": meta["directory"],
        "task_type": meta["task_type"],
        "parent_id": meta["parent_id"],
        "message_count": len(messages),
        "created": meta["time_created"],
        "updated": meta["time_updated"],
        "messages": messages,
    }


def build_opencode(meta, msgs, parts, version: str, sid_map: dict[str, str]):
    """Build a doc in opencode's native import/export shape.

    Messages keep original ids (msg_ prefix is valid), parts get fresh prt_
    ids, and the session gets a fresh ses_ id. No session-level parentID is
    set (opencode itself exports forks without one, and setting it would hide
    the session from its list, which only shows parent_id IS NULL rows).
    """
    by_msg: dict[str, list] = {}
    for p in parts:
        by_msg.setdefault(p["message_id"], []).append(json.loads(p["data"]))

    new_sid = sid_map[meta["id"]]
    id_map = {m["id"]: oc_id("msg", m["time_created"]) for m in msgs}

    doc = {
        "info": {
            "id": new_sid,
            "slug": slugify(meta["title"]),
            "title": meta["title"],
            "version": version,
            "cost": 0,
            "tokens": {"input": 0, "output": 0, "reasoning": 0,
                       "cache": {"read": 0, "write": 0}},
            "time": {"created": meta["time_created"],
                     "updated": max(meta["time_updated"], meta["time_created"])},
        },
        "messages": [],
    }
    for m in msgs:
        info = json.loads(m["data"])
        # zcode error objects (e.g. AiSdkModelAdapterError) fail opencode's
        # schema validation on import; they only mark failed attempts.
        info.pop("error", None)
        mid = id_map[m["id"]]
        info["id"] = mid
        info["sessionID"] = new_sid
        if "parentID" in info:
            info["parentID"] = id_map.get(info["parentID"], info["parentID"])
        plist = [pd for pd in by_msg.get(m["id"], [])
                 if pd.get("type") in KNOWN_OC_PART_TYPES]
        for pd in plist:
            pd["id"] = oc_id("prt", m["time_created"])
            pd["sessionID"] = new_sid
            pd["messageID"] = mid
        doc["messages"].append({"info": info, "parts": plist})

    return doc


_SNAP_TOOL_STATUS = {"running", "pending", "error", "failed", "denied"}


def _snapshot_tool(pd):
    """Map a zcode tool part to the restore-legacy-sessions plugin tool shape."""
    state = pd.get("state") or {}
    st = state.get("status") or "completed"
    name = pd.get("tool") or "legacy_tool"
    tool = {
        "toolName": name,
        "title": state.get("title") or name,
        "kind": "other",
        "status": st if st in _SNAP_TOOL_STATUS else "completed",
        "input": state.get("input"),
    }
    if state.get("output"):
        tool["output"] = state["output"]
    t = state.get("time") or {}
    if isinstance(t.get("start"), int):
        tool["startedAt"] = t["start"]
    if isinstance(t.get("end"), int):
        tool["completedAt"] = t["end"]
    if pd.get("callID"):
        tool["callID"] = pd["callID"]
    if state.get("error"):
        err = state["error"]
        tool["error"] = err if isinstance(err, str) else str(err)
    if "raw" in state:
        tool["raw"] = state["raw"]
    return tool


def build_snapshot(meta, msgs, parts):
    """Build a ZCode restore-legacy-sessions snapshot {meta, messages}.

    Snapshot layout on disk: <outdir>/<workspaceHash>/<session id>.json,
    where workspaceHash = first 12 hex chars of sha256(workspacePath).
    """
    by_msg = {}
    for p in parts:
        by_msg.setdefault(p["message_id"], []).append(json.loads(p["data"]))

    model, mode = "", "build"
    for m in msgs:
        info = json.loads(m["data"])
        if info.get("role") == "assistant":
            model = info.get("modelID") or model
            mode = info.get("mode") or mode

    smeta = {
        "taskId": meta["id"],
        "workspacePath": meta["directory"],
        "provider": "glm",
        "title": meta["title"] or "Untitled session",
        "mode": mode or "build",
        "createdAt": meta["time_created"],
        "updatedAt": meta["time_updated"],
    }
    if model:
        smeta["model"] = model
    if meta["trace_id"]:
        smeta["traceId"] = meta["trace_id"]
    if meta["parent_id"]:
        smeta["forkedFromTaskId"] = meta["parent_id"]

    messages = []
    for m in msgs:
        info = json.loads(m["data"])
        role = "assistant" if info.get("role") == "assistant" else "user"
        tinfo = info.get("time") or {}
        created = tinfo.get("created")
        timestamp = created if isinstance(created, int) else m["time_created"]
        msg = {"role": role, "timestamp": timestamp}
        completed = tinfo.get("completed")
        if (role == "assistant" and isinstance(created, int)
                and isinstance(completed, int) and completed >= created):
            msg["durationMs"] = completed - created

        text_bits, parts_out, tools_out = [], [], []
        for pd in by_msg.get(m["id"], []):
            ty = pd.get("type")
            if ty == "text":
                txt = pd.get("text", "") or ""
                if txt:
                    parts_out.append({"type": "content", "content": txt})
                    text_bits.append(txt)
            elif ty == "reasoning":
                txt = pd.get("text", "") or ""
                if txt:
                    parts_out.append({"type": "thought", "content": txt})
            elif ty == "tool":
                tools_out.append(_snapshot_tool(pd))
                parts_out.append({"type": "tool-call", "toolIndex": len(tools_out) - 1})

        if not text_bits:
            base = info.get("content")
            if not isinstance(base, str) or not base:
                sem = info.get("semantics")
                base = (sem if isinstance(sem, str) else "") or (
                    sem.get("text") if isinstance(sem, dict) else "")
            if isinstance(base, str) and base:
                text_bits.append(base)
        msg["content"] = "\n".join(text_bits)

        if role == "assistant":
            thought = info.get("thought")
            if isinstance(thought, str) and thought:
                msg["thought"] = thought
            if parts_out:
                msg["parts"] = parts_out
            if tools_out:
                msg["tools"] = tools_out
        messages.append(msg)

    ws_hash = hashlib.sha256(meta["directory"].encode("utf-8")).hexdigest()[:12]
    return ws_hash, {"meta": smeta, "messages": messages}


def expand_children(con, sids):
    """Recursively add descendant sessions (subagent_child / fork / grandkids).

    Walks session.parent_id (same-table links) to a fixpoint; keeps the
    original order and appends children after their ancestors.
    """
    out = []
    seen = set()

    def walk(sid):
        if sid in seen:
            return
        seen.add(sid)
        out.append(sid)
        for (cid,) in con.execute(
                "SELECT id FROM session WHERE parent_id=?", (sid,)):
            walk(cid)

    for sid in sids:
        walk(sid)
    return out


def list_sessions(con):
    rows = con.execute("SELECT * FROM session ORDER BY time_created").fetchall()
    print(f"{'#':>3}  {'when':16}  {'msgs':>4}  title / id")
    for i, s in enumerate(rows, 1):
        n = con.execute("SELECT COUNT(*) FROM message WHERE session_id=?",
                        (s["id"],)).fetchone()[0]
        when = time.strftime("%Y-%m-%d %H:%M", time.localtime(s["time_created"] / 1000))
        parent = f" [child of {s['parent_id'][:13]}]" if s["parent_id"] else ""
        print(f"{i:>3}  {when}  {n:>4}  {(s['title'] or '')[:46]}{parent}")
        print(f"{'':17}  {s['id']}")


def export(con, sids, outdir, formats):
    os.makedirs(outdir, exist_ok=True)

    metas = []
    for sid in sids:
        meta = con.execute("SELECT * FROM session WHERE id=?", (sid,)).fetchone()
        if not meta:
            print(f"ERR: not found: {sid}")
            continue
        metas.append(meta)

    # pre-assign opencode session ids so run-local parent links resolve
    sid_map = {m["id"]: oc_id("ses", m["time_created"]) for m in metas}
    version = oc_version() if "opencode" in formats else None

    for meta in metas:
        sid = meta["id"]
        msgs = con.execute(
            "SELECT * FROM message WHERE session_id=? ORDER BY COALESCE(sequence,0), time_created, id",
            (sid,)).fetchall()
        parts = con.execute(
            "SELECT * FROM part WHERE session_id=? ORDER BY message_id, COALESCE(sequence,0), time_created, id",
            (sid,)).fetchall()

        base = os.path.join(outdir, f"{stamp(meta['time_created'])}_{safe_name(meta['title'])}")
        done = []
        for fmt in formats:
            if fmt == "snapshot":
                ws_hash, snap = build_snapshot(meta, msgs, parts)
                sdir = os.path.join(outdir, ws_hash)
                os.makedirs(sdir, exist_ok=True)
                path = os.path.join(sdir, f"{meta['id']}.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(snap, f, ensure_ascii=False, indent=2)
                done.append(f"{fmt}={os.path.getsize(path):,}B")
                continue
            path = base + {"md": ".md", "json": ".json", "opencode": ".opencode.json"}[fmt]
            if fmt == "md":
                with open(path, "w", encoding="utf-8") as f:
                    f.write(render_md(meta, build(meta, msgs, parts)["messages"]))
            elif fmt == "json":
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(build(meta, msgs, parts), f, ensure_ascii=False, indent=2)
            else:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(build_opencode(meta, msgs, parts, version, sid_map),
                              f, ensure_ascii=False, indent=2)
            done.append(f"{fmt}={os.path.getsize(path):,}B")

        print(f"OK  {os.path.basename(base)}  {'  '.join(done)}  msgs={len(msgs)}")

    print(f"\nsaved {len(metas)} sessions to {outdir}")


def main():
    args = sys.argv[1:]
    if not args or args[0] not in {"list", "export"}:
        print(__doc__)
        sys.exit(1)

    if not os.path.exists(ZDB):
        sys.exit(f"ERR: zcode db not found: {ZDB}")
    con = sqlite3.connect(f"file:{ZDB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row

    cmd = args[0]
    if cmd == "list":
        list_sessions(con)
        return

    rest = args[1:]
    outdir = OUTDIR
    formats = {"md", "json"}
    with_children = False
    targets_args: list[str] = []

    i = 0
    while i < len(rest):
        a = rest[i]
        if a in ("-t", "--type"):
            formats = set()
            for p in rest[i + 1].split(","):
                p = p.strip()
                if p in TYPES:
                    formats.add(p)
                else:
                    sys.exit(f"ERR: bad type '{p}' (choose from: {', '.join(sorted(TYPES))})")
            i += 2
        elif a == "--out":
            if i + 1 >= len(rest):
                sys.exit("ERR: --out requires a directory")
            outdir = rest[i + 1]
            i += 2
        elif a == "--with-children":
            with_children = True
            i += 1
        else:
            targets_args.append(a)
            i += 1

    rows = con.execute("SELECT id FROM session ORDER BY time_created").fetchall()
    ids = [r["id"] for r in rows]
    targets = []
    for a in targets_args:
        if a == "all":
            targets = list(ids)
            break
        if a.isdigit():
            n = int(a)
            if not 1 <= n <= len(ids):
                sys.exit(f"ERR: ordinal {n} out of range (1..{len(ids)})")
            targets.append(ids[n - 1])
        elif re.fullmatch(r"sess_\S+", a):
            targets.append(a)
        else:
            sys.exit(f"ERR: bad argument: {a}")
    if not targets:
        sys.exit("nothing to export")
    if with_children:
        targets = expand_children(con, targets)

    export(con, targets, os.path.expanduser(outdir), formats)


if __name__ == "__main__":
    main()