#!/usr/bin/env python3
"""Validate sources/special-notices.tsv and render a review page.

Usage: python scripts/build_specials_review.py
Reads: sources/special-notices.tsv, public/data/guide.json
Writes: outputs/specials-review.html

Every guide deep link is checked against the real event blocks in guide.json:
`notices/angel#3` must resolve to an event labelled 3, otherwise the build
fails. This keeps the condition table honest instead of hand-waving links.
"""

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TSV = ROOT / "sources" / "special-notices.tsv"
GUIDE = ROOT / "public" / "data" / "guide.json"
OUT = ROOT / "outputs" / "specials-review.html"

FIELDS = [
    "id", "notice", "slot", "phase", "kind", "type", "scope",
    "name", "target", "hint", "link", "source", "verify",
]
NOTICE_TITLES = {
    "_global": "全局前提",
    "proud-of-the-world": "笑傲天际",
    "doomsday-warrior": "末日战士",
    "eternal-love": "万年之恋",
    "angel": "落入凡间的天使",
    "kunlun-adventure": "昆仑历险",
    "galaxy": "银河",
}
ORDER = list(NOTICE_TITLES)
KINDS = {"condition", "note"}
PHASES = {"prepare", "trigger", "notice", "-"}
SCOPES = {"global", "artist", "group", "role", "notice", "-"}
TYPES = {"stat", "count", "item", "cert", "course", "resource", "flag", "-"}
SITE = "http://localhost:5173/"

# Resolved on 2026-11-11. Kept in the review page so future edits can tell
# why a row reads the way it does (and which source won a disagreement).
DECISIONS = [
    "CD-PRO1 攻略正文未提 → 删除该条件，时间线备注里的提及一并去掉",
    "末日战士采用条件表的具体日期 4/27 初选、7/27 决选（攻略只给月份），仅作标签不计时",
    "万年之恋「名气 600」触发前置加入（攻略事件 14 明写）",
    "「大型演唱会需 4000 万」×3 保留为条件，标注金额来自条件表",
    "万年之恋 4 条属性区间采信条件表，攻略正文未列",
    "「精灵的祈祷」占卜按攻略 10 次定稿（截图写 3 次）",
    "昆仑「只有女艺人会中断」降级为只读备注，不进达标数",
    "道具名按攻略正字统一为「真虹羽纱」（items.txt / notices.txt）",
    "昆仑 4 条属性区间采信条件表，攻略正文未列",
    "银河 4 条属性保持只读备注，数值不达标也能接，不计达标数",
]


def load_nodes():
    data = json.loads(GUIDE.read_bytes().decode("utf-8"))
    nodes = {}
    for category in data["categories"]:
        for node in category.get("children", []):
            nodes[node["id"]] = node
    return nodes


def build_anchors(nodes):
    anchors = {}
    for node_id, node in nodes.items():
        for index, block in enumerate(node.get("blocks", [])):
            if block.get("kind") == "event" and block.get("label"):
                anchors[f"{node_id}#{block['label']}"] = f"ev{index}"
    return anchors


def read_rows(nodes, anchors):
    lines = TSV.read_bytes().decode("utf-8-sig").splitlines()
    header = lines[0].split("\t")
    if header != FIELDS:
        raise SystemExit(f"header mismatch: {header}")
    rows, seen, problems = [], set(), []
    for line_no, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) != len(FIELDS):
            problems.append(f"line {line_no}: {len(parts)} fields, want {len(FIELDS)}")
            continue
        row = dict(zip(FIELDS, parts))
        row["line"] = line_no
        if row["id"] in seen:
            problems.append(f"line {line_no}: duplicate id {row['id']}")
        seen.add(row["id"])
        if row["notice"] not in NOTICE_TITLES:
            problems.append(f"line {line_no}: unknown notice {row['notice']}")
        if row["kind"] not in KINDS:
            problems.append(f"line {line_no}: bad kind {row['kind']}")
        if row["phase"] not in PHASES:
            problems.append(f"line {line_no}: bad phase {row['phase']}")
        if row["scope"] not in SCOPES:
            problems.append(f"line {line_no}: bad scope {row['scope']}")
        if row["type"] not in TYPES:
            problems.append(f"line {line_no}: bad type {row['type']}")
        link = row["link"]
        if link.startswith("tracker:"):
            target = link.split(":", 1)[1]
            if target not in nodes:
                problems.append(f"line {line_no}: tracker node missing {target}")
        elif "#" in link:
            if link not in anchors:
                problems.append(f"line {line_no}: no such event {link}")
        elif link not in nodes and link != "-":
            problems.append(f"line {line_no}: guide node missing {link}")
        rows.append(row)
    if problems:
        raise SystemExit("validation failed:\n  " + "\n  ".join(problems))
    return rows


def href_for(link, anchors):
    if link.startswith("tracker:"):
        return SITE + "#/tracker", "事件追踪器 ›"
    if "#" in link:
        node_id, label = link.split("#", 1)
        return SITE + f"#/guide/{node_id}~{anchors[link]}", f"攻略 · 事件 {label}"
    if link == "-":
        return None
    return SITE + f"#/guide/{link}", "攻略 · 本页"


def esc(text):
    return html.escape(text, quote=True)


def render(rows, anchors):
    conditions = [r for r in rows if r["kind"] == "condition"]
    notes = [r for r in rows if r["kind"] == "note"]
    question_groups = {}
    for r in rows:
        note = r["verify"]
        if note and note != "-":
            question_groups.setdefault(note, []).append(r)
    questions = list(question_groups.items())
    q_index = {
        r["id"]: i + 1
        for i, (_, group) in enumerate(questions)
        for r in group
    }
    scopes = {}
    for r in conditions:
        scopes[r["scope"]] = scopes.get(r["scope"], 0) + 1

    out = []
    out.append("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>")
    out.append("<meta name='viewport' content='width=device-width,initial-scale=1'>")
    out.append("<title>六大通告条件表 · 审阅草稿</title>")
    out.append("""<style>
:root{--ink:#23262b;--muted:#6b7280;--line:#e5e7eb;--soft:#f7f8fa;--warn:#a32d2d;--warnbg:#fcebeb;--ok:#0f6e56;--okbg:#e1f5ee;--blue:#185fa5}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1400px;margin:0 auto;padding:28px 32px 80px}
h1{font-size:22px;font-weight:600;margin:0 0 6px}h2{font-size:17px;font-weight:600;margin:34px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
h3{font-size:14px;font-weight:600;margin:0 0 10px}.sub{color:var(--muted);font-size:13px;margin:0 0 20px}
.metrics{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 24px}
.metric{background:var(--soft);border-radius:10px;padding:10px 16px;min-width:120px}.metric b{display:block;font-size:22px;font-weight:600}.metric span{font-size:12px;color:var(--muted)}
.box{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:14px 0 24px;font-size:13px}
.box p{margin:4px 0}.box code{background:#fff;border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-size:12px}
.qbox{border:1px solid #f2c9c9;background:var(--warnbg);border-radius:10px;padding:14px 18px;margin:14px 0 28px}
    .qbox ol{margin:8px 0 0;padding-left:22px}.qbox li{margin:6px 0;font-size:13px}
    .qbox b{color:var(--warn)}
    .dbox{border:1px solid #b8e2d2;background:var(--okbg);border-radius:10px;padding:14px 18px;margin:14px 0 28px}
    .dbox ol{margin:8px 0 0;padding-left:22px}.dbox li{margin:5px 0;font-size:13px}
    .dbox b{color:var(--ok)}
table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
th{background:var(--soft);text-align:left;font-weight:600;color:var(--muted);font-size:12px;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;word-break:break-word}
tr.note td{background:#fafafa;color:var(--muted)}
.tag{display:inline-block;border:1px solid var(--line);border-radius:5px;padding:0 6px;font-size:11px;color:var(--muted);white-space:nowrap}
.tag.scope-global{background:var(--okbg);border-color:#b8e2d2;color:var(--ok)}
.tag.scope-artist{background:#eef3fd;border-color:#c9dcf7;color:var(--blue)}
.tag.scope-group{background:#f3edfb;border-color:#ddd0f2;color:#5b3d94}
.tag.scope-role{background:#fdf1e3;border-color:#f3d9b5;color:#95591b}
.tag.kind-condition{background:var(--okbg);border-color:#b8e2d2;color:var(--ok)}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.qmark{display:inline-block;margin-left:6px;color:var(--warn);font-weight:600;font-size:12px;text-decoration:none}
.hint{color:var(--muted);font-size:12px}.target{font-variant-numeric:tabular-nums;white-space:nowrap}
</style></head><body><div class='wrap'>""")
    out.append("<h1>六大通告条件表 · 审阅定稿</h1>")
    out.append("<p class='sub'>来源：你整理的六列条件表截图 + 站内攻略正文，已按 10 条裁决定稿。条件行计入达标数；灰底的时间线行只读、不计数、只跳事件追踪器。深链已逐条对过 guide.json 的事件号。</p>")
    out.append("<div class='metrics'>")
    for label, value in [
        ("总条目", len(rows)), ("条件行", len(conditions)), ("时间线/备注行", len(notes)),
        ("待裁决类别", len(questions)),
    ]:
        out.append(f"<div class='metric'><b>{value}</b><span>{label}</span></div>")
    out.append("</div>")
    out.append("<div class='box'><h3>「共享」到底共享给谁（这张表比草图更精确的一处修正）</h3>")
    out.append("<p><code>global</code> 公司级：资金、就医、占卜、精品店、日本旅游、塞外观光、电影累计、金父未死 —— 一处改动全站生效，谁做的都算。</p>")
    out.append("<p><code>artist</code> 按艺人：属性、证书、个人唱片数、课程等级 —— <b>只有同一个艺人被指派到多张卡时才自动同步</b>，不同艺人各算各的。上一版草图里把「国际音乐证书 / 个人唱片 5 张」笼统叫共享，其实不是全站共享。</p>")
    out.append("<p><code>group</code> 按团体：团体唱片数、团体名气/人气、成员证书（银河）。<code>role</code> 按角色位：昆仑男主/女主一/女主二，三位证书各不相同。<code>notice</code> 仅本通告。</p>")
    out.append(f"<p>条件行归属分布：" + "、".join(f"{k} {v} 条" for k, v in sorted(scopes.items())) + "。</p></div>")

    if questions:
        out.append("<div class='qbox'><h3>需要你裁决的疑点（同类已归并，回个编号就行）</h3><ol>")
        for i, (note, group) in enumerate(questions, start=1):
            titles = "、".join(dict.fromkeys(NOTICE_TITLES[r["notice"]] for r in group))
            out.append(
                f"<li id='q{i}'><b>[{esc(titles)}]</b> 共 {len(group)} 条 — "
                f"{esc(note.lstrip('?'))}</li>"
            )
        out.append("</ol></div>")
    else:
        out.append("<div class='dbox'><h3>0 条待裁决 · 本表已定稿</h3>")
        out.append("<p class='sub' style='margin:0 0 4px'>以下是 10 条裁决记录，日后改表时可回查取值依据。</p><ol>")
        for i, decision in enumerate(DECISIONS, start=1):
            out.append(f"<li><b>{i}.</b> {esc(decision)}</li>")
        out.append("</ol></div>")

    for notice_id in ORDER:
        group = [r for r in rows if r["notice"] == notice_id]
        if not group:
            continue
        n_cond = sum(1 for r in group if r["kind"] == "condition")
        n_note = len(group) - n_cond
        out.append(f"<h2>{esc(NOTICE_TITLES[notice_id])} <span class='sub' style='font-weight:400'>· {n_cond} 条条件 / {n_note} 条只读备注</span></h2>")
        out.append("<table><colgroup><col style='width:26%'><col style='width:9%'><col style='width:8%'><col style='width:8%'><col style='width:30%'><col style='width:7%'><col style='width:12%'></colgroup>")
        out.append("<tr><th>条目</th><th>类别 / 阶段</th><th>归属</th><th>槽位</th><th>怎么拿 / 说明</th><th>出处</th><th>深链</th></tr>")
        for r in group:
            cls = "note" if r["kind"] == "note" else ""
            q = ""
            if r["id"] in q_index:
                q = f"<a class='qmark' href='#q{q_index[r['id']]}'>?{q_index[r['id']]}</a>"
            name = esc(r["name"])
            if r["target"] not in ("-", ""):
                name += f" <span class='target tag' style='margin-left:4px'>{esc(r['target'])}</span>"
            link_html = "—"
            parsed = href_for(r["link"], anchors)
            if parsed:
                url, text = parsed
                link_html = f"<a href='{esc(url)}' target='_blank'>{esc(text)}</a>"
            kind_cls = "kind-condition" if r["kind"] == "condition" else ""
            scope_cls = "scope-" + r["scope"] if r["scope"] != "-" else ""
            out.append("<tr class='" + cls + "'>")
            out.append(f"<td>{name}{q}</td>")
            out.append(f"<td><span class='tag {kind_cls}'>{esc(r['kind'])}</span><br><span class='tag' style='margin-top:3px'>{esc(r['type'])} / {esc(r['phase'])}</span></td>")
            out.append(f"<td><span class='tag {scope_cls}'>{esc(r['scope'])}</span></td>")
            out.append(f"<td><span class='hint'>{esc(r['slot'])}</span></td>")
            out.append(f"<td class='hint'>{esc(r['hint'])}</td>")
            out.append(f"<td><span class='hint'>{esc(r['source'])}</span></td>")
            out.append(f"<td>{link_html}</td>")
            out.append("</tr>")
        out.append("</table>")
    out.append("</div></body></html>")
    OUT.write_text("\n".join(out), encoding="utf-8")
    return len(rows), len(conditions), len(notes), len(questions)


def main():
    nodes = load_nodes()
    anchors = build_anchors(nodes)
    rows = read_rows(nodes, anchors)
    total, cond, note, questions = render(rows, anchors)
    print(f"OK  {total} rows | {cond} conditions | {note} notes | {questions} questions")
    print(f"    deep links checked against {len(anchors)} event blocks")
    print(f"    -> {OUT}")


if __name__ == "__main__":
    main()
