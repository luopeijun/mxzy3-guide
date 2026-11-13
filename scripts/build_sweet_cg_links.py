# -*- coding: utf-8 -*-
"""把「甜蜜乐章 CG 核对表」xlsx 转成管线用的映射源 ``sources/sweet/cg-links.tsv``。

输入：
  E:/Documents/workbuddy/2026-11-07-22-44-12/甜蜜乐章攻略事件对应CG核对表.xlsx
  （用户手填：F 列「对应角色」+ G 列「对应序号」；末尾另有人工补的徐世杰几行）

输出：``sources/sweet/cg-links.tsv``，四列 ``cgId <TAB> nodeId <TAB> kind <TAB> key``：
  - ``kind=event``：``key`` 是事件块编号（如 ``4-5``）
  - ``kind=text`` ：``key`` 是正文块里的一段特征文字（服装 / 节日 / 结局这类正文提及）

用法：``python scripts/build_sweet_cg_links.py [xlsx路径]``
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "public" / "data" / "sweet" / "guide.json"
CG = ROOT / "public" / "data" / "sweet" / "cg.json"
OUT = ROOT / "sources" / "sweet" / "cg-links.tsv"
DEFAULT_XLSX = Path("E:/Documents/workbuddy/2026-11-07-22-44-12/甜蜜乐章攻略事件对应CG核对表.xlsx")

# 「非事件标题」的 CG 提及：ref → (nodeId, kind, key)。key 必须能唯一定位到一个块。
SPECIAL_TARGETS: dict[str, tuple[str, str, str]] = {
    "danisi L22": ("sweet-characters/danisi", "text", "舞台剧·从接吻开始"),
    "festivals L37": ("sweet-guide/festivals", "text", "情人节CG图取得条件"),
    "festivals L61": ("sweet-guide/festivals", "text", "圣诞节事件没有CG图"),
    "outfits L81": ("sweet-guide/outfits", "text", "安妤与主角冰释前嫌"),
    "outfits L88": ("sweet-guide/outfits", "text", "之后获得CG"),
    "outfits L107": ("sweet-guide/outfits", "text", "收到晚会海报"),
    "stage-shadow L25": ("sweet-side/stage-shadow", "text", "苏嫚君送上照片"),
    "tian-qing L37": ("sweet-side/tian-qing", "event", "23"),
    "tian-qing L58": ("sweet-side/tian-qing", "event", "37"),
    "xia-yijun L4": ("sweet-side/xia-yijun", "text", "古典晚礼服"),
    "xia-yijun L10": ("sweet-side/xia-yijun", "text", "公司结局：傲视全球"),
    "xia-yijun L11": ("sweet-side/xia-yijun", "text", "感情结局：与夏以军结婚"),
}

SKIP_MARKS = {"", "不填"}


def norm(text: object) -> str:
    return str(text).strip() if text is not None else ""


def main(argv: list[str]) -> int:
    xlsx = Path(argv[1]) if len(argv) > 1 else DEFAULT_XLSX
    guide = json.loads(GUIDE.read_text(encoding="utf-8"))
    cg = json.loads(CG.read_text(encoding="utf-8"))

    nodes = {n["id"]: n for c in guide["categories"] for n in c["children"]}
    by_title = {n["title"]: n["id"] for c in guide["categories"] for n in c["children"]}
    group_by_name = {g["name"]: g["id"] for g in cg["groups"]}
    # (groupId, 展示序号) -> item id：用户填的「序号」是 CG NN，即 order。
    item_at = {(it["groupId"], it["order"]): it["id"] for it in cg["items"]}

    ws = load_workbook(xlsx, data_only=True)["填写表"]

    links: list[tuple[str, str, str, str]] = []
    warnings: list[str] = []
    seen: dict[str, str] = {}

    for r in range(5, ws.max_row + 1):
        cat = norm(ws.cell(row=r, column=2).value)
        node_cell = norm(ws.cell(row=r, column=3).value)
        ref = norm(ws.cell(row=r, column=4).value)
        cell_e = norm(ws.cell(row=r, column=5).value)
        role = norm(ws.cell(row=r, column=6).value)
        seq = norm(ws.cell(row=r, column=7).value)

        if not node_cell or not (ref or cell_e):
            continue
        if seq in SKIP_MARKS or not role:
            if seq not in SKIP_MARKS and not role:
                warnings.append(f"第 {r} 行有角色但没序号，跳过：{node_cell} / {ref}")
            continue

        if cat == "特殊提及":
            target = SPECIAL_TARGETS.get(ref)
            if target is None:
                warnings.append(f"第 {r} 行 unknown ref={ref!r}，跳过")
                continue
            node_id, kind, key = target
        else:
            # 正常行：D 列是事件编号；用户手补的行（分类空）把编号写在 E 列「事件1-3」。
            title = re.sub(r"（[^）]*）\s*$", "", node_cell).replace("支线 · ", "").strip()
            node_id = by_title.get(title)
            if re.fullmatch(r"\d+-\d+", ref):
                key = ref
            elif cell_e.startswith("事件"):
                key = cell_e[len("事件"):].strip()
            else:
                key = ref
            kind = "event"

        if node_id is None or node_id not in nodes:
            warnings.append(f"第 {r} 行找不到节点 {node_cell!r}，跳过")
            continue

        group_id = group_by_name.get(role)
        if group_id is None:
            warnings.append(f"第 {r} 行未知角色 {role!r}，跳过")
            continue
        try:
            item_id = item_at[(group_id, int(seq))]
        except (ValueError, KeyError):
            warnings.append(f"第 {r} 行 {role} 没有 CG {seq}，跳过")
            continue

        if item_id in seen:
            warnings.append(f"第 {r} 行 {item_id} 已被第 {seen[item_id]} 行占用，跳过")
            continue

        # 校验 key 能在目标节点里唯一定位到一个块。
        hits = [
            i for i, b in enumerate(nodes[node_id]["blocks"])
            if (
                (b.get("kind") == "event" and b.get("label") == key)
                if kind == "event"
                else key in b["text"]
            )
        ]
        if len(hits) != 1:
            warnings.append(f"第 {r} 行 {node_id} 里 key={key!r} 命中 {len(hits)} 个块，跳过")
            continue

        seen[item_id] = str(r)
        links.append((item_id, node_id, kind, key))

    links.sort(key=lambda row: (row[1], row[2], row[3]))

    lines = [
        "# 甜蜜乐章：CG ↔ 攻略事件的映射（由 scripts/build_sweet_cg_links.py 从核对表 xlsx 生成，勿手改）",
        "# 列：cgId\tnodeId\tkind\tevent=事件编号 / text=正文特征串\tkey",
    ]
    for item_id, node_id, kind, key in links:
        lines.append(f"{item_id}\t{node_id}\t{kind}\t{key}")
    OUT.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))

    print(f"wrote {OUT.relative_to(ROOT)}: {len(links)} links")
    for item_id, node_id, kind, key in links:
        print(f"  {item_id:22s} ← {node_id} [{kind}] {key}")
    if warnings:
        print("\n⚠ skipped:")
        for w in warnings:
            print("  " + w)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
