"""导出「甜蜜乐章攻略里标有 CG 的事件」核对表。

两个来源：
1. ``public/data/sweet/guide.json`` 里 ``kind == "event"`` 且 ``cg == True`` 的事件块
   —— 这些是标题尾部带「（…CG…）」、由 ``_split_effect_marks`` 解析出来的。
2. 原文 ``sources/sweet/*.txt`` 里**不在事件标题括号中**的 CG 提及（服装页「得到 CG」、
   节日「情人节 CG 图取得条件」、作品「获得 kissCG 后」、注「圣诞节事件没有 CG 图」
   等），这些不会被标成事件 `cg`，单独列出让人确认要不要也做跳转。

输出 markdown 到 ``outputs/sweet-cg-event-checklist.md``，并打印到 stdout。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "public" / "data" / "sweet" / "guide.json"
CG = ROOT / "public" / "data" / "sweet" / "cg.json"
SOURCES = ROOT / "sources" / "sweet"
OUT = ROOT / "outputs" / "sweet-cg-event-checklist.md"

# 标题尾部括号里含 CG 的标准事件标记（如「（友好度上升、CG）」/「（CG）」）。
TRAILING_MARK = re.compile(r"（[^（）]*CG[^（）]*）\s*$")
CG_RE = re.compile(r"CG|ＣＧ")
# 事件 / 步骤行首：`1-2.` / `（23）` / `1.` —— 只有这类行带尾部 CG 标记时才算
# 「已在上表」。结局行「公司结局：…（与郭秘书CG1张）」不是步骤行，要保留。
EVENT_LINE = re.compile(r"^(?:\d+-\d+[.．]?|（\d+）|\d+[.．])")


def main() -> int:
    guide = json.loads(GUIDE.read_text(encoding="utf-8"))
    cgjson = json.loads(CG.read_text(encoding="utf-8"))
    cg_counts = {g["id"]: g["count"] for g in cgjson["groups"]}

    lines: list[str] = []
    lines.append("# 甜蜜乐章 · 攻略里标有 CG 的事件核对表")
    lines.append("")
    lines.append(
        "> 来源：`public/data/sweet/guide.json`（事件块 `cg: true`，"
        "由标题尾部「（…CG…）」解析）。用于核对「哪些攻略事件会出 CG」，"
        "核对无误后我再建立 事件 ↔ CG 图片 的双向映射。"
    )
    lines.append("")

    total = 0
    for category in guide["categories"]:
        rows: list[tuple[str, str, str, str]] = []  # (node title, slug, label, title)
        for node in category["children"]:
            slug = node["id"].rsplit("/", 1)[-1]
            for block in node["blocks"]:
                if block.get("kind") == "event" and block.get("cg"):
                    label = block.get("label", "")
                    rows.append((node["title"], slug, label, block["text"]))
        if not rows:
            continue
        lines.append(f"## {category['title']}（{len(rows)} 个）")
        lines.append("")
        # 按节点分组，保持目录顺序。
        by_node: dict[str, list[tuple[str, str, str, str]]] = {}
        for row in rows:
            by_node.setdefault(row[1], []).append(row)
        for slug, items in by_node.items():
            title = items[0][0]
            count = cg_counts.get(slug)
            if count is None:
                extra = "本组无独立 CG 分组（CG 可能在主角组）"
            else:
                extra = f"本组 CG {count} 张"
            lines.append(f"### {title} · {len(items)} 个（{extra}）")
            for _title, _slug, label, text in items:
                lines.append(f"- {label}　{text}" if label else f"- {text}")
            lines.append("")
        total += len(rows)

    lines.append(f"**小计：{total} 个标 CG 的事件。**")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 另：非「事件标题」的 CG 提及（请确认是否也要做跳转）")
    lines.append("")
    lines.append(
        "> 这些行提到了 CG，但不是标题带「（CG）」的事件卡，"
        "解析器没有标 `cg`。它们在页面上是作品 / 节日 / 服装 / 注释的正文。"
    )
    lines.append("")

    special = 0
    for path in sorted(SOURCES.glob("*.txt")):
        hits: list[tuple[int, str]] = []
        raw = path.read_bytes().decode("utf-8").replace("\r\n", "\n").split("\n")
        for i, text in enumerate(raw, start=1):
            stripped = text.strip()
            if not stripped or not CG_RE.search(stripped):
                continue
            if TRAILING_MARK.search(stripped) and EVENT_LINE.match(stripped):
                continue  # 标准事件标题，已在上面
            hits.append((i, stripped))
        if not hits:
            continue
        lines.append(f"### sources/sweet/{path.name}")
        for i, text in hits:
            lines.append(f"- L{i}：{text}")
        lines.append("")
        special += len(hits)

    lines.append(f"**小计：{special} 处特殊提及。**")
    lines.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(lines) + "\n"
    OUT.write_bytes(body.encode("utf-8"))
    print(body)
    print(f"--- wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
