// export-dsh-session.js — 导出 DeepSeek Harness 会话记录为 Markdown
// 用法: node tools/export-dsh-session.js [会话目录] [输出.md]
//   会话目录 = C:\Users\Mell\.dsh\sessions\<workspace>\<session-xxx>\（含 session.v4.jsonl.zstd）
//   缺省导出 LuckyClover-Mod 当前活跃会话（按 mtime 自动选）
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("node:zlib");

function findSessionDir() {
    const root = "C:/Users/Mell/.dsh/sessions/--E-Code-LuckyClover-Mod--";
    let best = null, bestMt = 0;
    for (const d of fs.readdirSync(root)) {
        const full = path.join(root, d);
        const f = fs.readdirSync(full).find((n) => n.endsWith(".zstd"));
        if (!f) continue;
        const mt = fs.statSync(path.join(full, f)).mtimeMs;
        if (mt > bestMt) { bestMt = mt; best = full; }
    }
    return best;
}

function decompressMultiFrame(file) {
    const buf = fs.readFileSync(file);
    const starts = [];
    for (let i = 0; i + 4 <= buf.length; i++) {
        if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) starts.push(i);
    }
    const parts = [];
    for (let k = 0; k < starts.length; k++) {
        const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
        parts.push(zlib.zstdDecompressSync(buf.subarray(starts[k], end)));
    }
    return Buffer.concat(parts).toString("utf8");
}

const trunc = (s, n) => {
    s = String(s);
    return s.length > n ? s.slice(0, n) + `…[截断，原文 ${s.length} 字符]` : s;
};
const fmtTime = (ms) =>
    new Date(ms).toLocaleString("zh-CN", { hour12: false, hour12: false }).replace(/\//g, "-");
const quote = (s) => String(s).split("\n").map((l) => "> " + l).join("\n");

function renderToolResult(name, raw) {
    if (!raw) return null;
    if (name === "ask_user_question") {
        try {
            const j = JSON.parse(raw);
            const rows = (j.answers || []).map((a) => `${a.id} → ${(a.selected || []).join(" / ")}`);
            return rows.length ? "> **用户答复**: " + rows.join("；") : null;
        } catch (e) {
            return "> **用户答复**: " + trunc(raw, 400);
        }
    }
    return null; // 其余工具结果（读文件/网页等）不入聊天记录，与既有导出格式一致
}

function main() {
    const dir = process.argv[2] || findSessionDir();
    if (!dir) throw new Error("找不到会话目录");
    const zfile = fs.readdirSync(dir).find((n) => n.endsWith(".zstd"));
    const raw = decompressMultiFrame(path.join(dir, zfile));
    const records = [];
    for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try { records.push(JSON.parse(line)); } catch (e) { /* skip */ }
    }

    // 预扫描
    let sessionId = "", createdAt = 0, title = "会话", cwd = "";
    const toolNames = {};       // callId -> tool name
    const approvals = {};       // callId -> {reason, decision}
    const askedById = {};
    const titles = [];
    const counts = { user: 0, assistant: 0, tool: 0 };
    for (const r of records) {
        if (r.type === "session") { sessionId = r.id; createdAt = r.createdAt; cwd = r.cwd || cwd; }
        if (r.type === "session/title") titles.push(r.data.title);
        if (r.type === "tool/call") toolNames[r.data.callId] = r.data.name;
        if (r.type === "approval/asked") askedById[r.data.id] = r.data;
        if (r.type === "approval/decided") {
            const ask = askedById[r.data.id];
            if (ask) approvals[ask.callId] = { reason: ask.reason, decision: r.data.decision || JSON.stringify(r.data) };
        }
        if (r.type === "user/message") counts.user++;
        if (r.type === "assistant/message") counts.assistant++;
        if (r.type === "tool/call") counts.tool++;
    }
    if (titles.length) title = titles[titles.length - 1];

    const out = [];
    out.push(`# 会话记录 —— ${title}`);
    out.push("");
    out.push(`- **Session ID**: \`${sessionId}\``);
    out.push(`- **目录**: ${cwd || "E:\\Code\\LuckyClover-Mod"}`);
    out.push(`- **创建时间**: ${fmtTime(createdAt)}`);
    out.push(`- **导出时间**: ${fmtTime(Date.now())}`);
    out.push(`- **规模**: 用户 ${counts.user} 条 / 助手 ${counts.assistant} 条 / 工具调用 ${counts.tool} 次`);
    out.push(`- **原始数据**: \`${path.basename(dir)}/${zfile}\`（zstd 多帧，可再导出）`);
    out.push("");
    out.push("---");

    for (const r of records) {
        const t = r.time;
        const d = r.data || {};
        if (r.type === "user/message") {
            out.push("");
            out.push(`## USER  (${fmtTime(t)})`);
            out.push("");
            for (const p of d.content || []) {
                if (p.type === "text") out.push(p.text);
                else if (p.type === "file") out.push(`[附件: ${p.attachment && p.attachment.name}（${(((p.attachment && p.attachment.bytes) || 0) / 1024 / 1024).toFixed(1)} MB）]`);
                else if (p.type === "image") out.push(`[图片附件${p.attachment && p.attachment.name ? ": " + p.attachment.name : ""}]`);
                else out.push(`[${p.type}]`);
            }
            out.push("");
            out.push("---");
        } else if (r.type === "assistant/message") {
            out.push("");
            out.push(`## ASSISTANT  (${fmtTime(t)})`);
            out.push("");
            for (const b of (d.message && d.message.content) || []) {
                if (b.type === "reasoning" && b.text) {
                    out.push(quote("THINKING: " + b.text));
                    out.push("");
                } else if (b.type === "text" && b.text) {
                    out.push(b.text);
                    out.push("");
                } else if (b.type === "tool-call") {
                    const lim = b.name === "ask_user_question" ? 3000 : 800;
                    out.push(quote(`TOOL \`${b.name}\`: input = ${trunc(b.arguments, lim)}`));
                    const ap = approvals[b.id];
                    if (ap) out.push(quote(`🔒 授权: ${trunc(ap.reason, 300)} → ${ap.decision}`));
                    out.push("");
                }
            }
        } else if (r.type === "tool/result") {
            // toolCallId 可能在 data 顶层，也可能嵌在 data.message（本会话为后者）
            const callId = d.toolCallId || (d.message && d.message.toolCallId)
                || (d.message && d.message.source && d.message.source.callId);
            const name = toolNames[callId] || "?";
            const text = ((d.message && d.message.content) || []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
            const extra = renderToolResult(name, text);
            if (extra) { out.push(extra); out.push(""); }
        } else if (r.type === "deliverables/presented") {
            const files = (d.files || []).map((f) => `${f.path}${f.description ? " — " + f.description : ""}`);
            out.push(quote("📦 已交付: " + files.join("；")));
            out.push("");
        } else if (r.type === "system/message") {
            out.push("");
            out.push(`## SYSTEM  (${fmtTime(t)})`);
            out.push("");
            for (const p of (d.message && d.message.content) || []) {
                if (p.type === "text") out.push("```");
                if (p.type === "text") out.push(trunc(p.text, 4000));
                if (p.type === "text") out.push("```");
            }
            out.push("");
            out.push("---");
        }
    }

    const date = new Date(createdAt);
    const ymd = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    const hm = String(date.getHours()).padStart(2, "0") + String(date.getMinutes()).padStart(2, "0");
    const safeTitle = String(title).replace(/[\\/:*?"<>|]/g, "_");
    const outFile = process.argv[3] || path.join(cwd || "E:/Code/LuckyClover-Mod", `${ymd}_${hm}_${safeTitle}_会话记录.md`);
    fs.writeFileSync(outFile, out.join("\n"));
    console.log("导出完成: " + outFile);
    console.log("大小: " + (fs.statSync(outFile).size / 1024).toFixed(0) + " KB");
    console.log("记录: user=" + counts.user + " assistant=" + counts.assistant + " tool=" + counts.tool);
}

main();
