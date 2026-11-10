"""生成「攻略事件 ⇄ CG」对照表，供人工填写映射（outputs/cg-event-mapping.md）。

两节：

1. 艺人 / 其他事件：沿用已有清单，只补一列「我的回复」——留空 = 不关联。
2. 经纪人：经纪人事件簿（game-guide 14 页）里没有任何块带 cg 标记（cg=true 计数为 0），
   所以这节反过来按 CG 列行，给出「建议攻略落点」，由人工在回复列确认或改。

可重复运行：表格已补过列就跳过，只会刷新第二节。落点判断在 BIZ_LINKS，
改判就改这里再跑。首次运行会留一份 .bak。
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs" / "cg-event-mapping.md"
BAK = OUT.with_name("cg-event-mapping.md.bak")
CG_JSON = ROOT / "public" / "data" / "cg.json"

HEADER = """# 攻略 ⇄ CG 映射表

**怎么填「我的回复」这一列**

- **留空 = 不关联**：这个事件不出 CG，或者那张 CG 是自动触发 / 结局图，不需要跳转入口，不用做任何解释。
- 要关联就写 CG 编号，例：`CG01`；同一事件出两张写 `CG01+CG05`。
- 只想纠错也行：只填我建议错的行，正确的留空即可。
- 「建议 CG」是我按正文与 CG 条件的字面相似度自动猜的，`?` / `??` 的基本不可靠，**以你的回复为准**。

填完我会据此生成跳转数据：攻略里的金色 CG 徽标 → 对应 CG 卡片，CG 卡片 / 大图 → 对应攻略事件。

"""

BIZ_NOTE = """## 经纪人（12 张，按 CG 反查）

> 经纪人事件簿（初始事件 / 打工 / 训练 / 制作人 / 结局等 14 页）里**没有一个事件带 CG 标记**，
> 所以这节反过来列：以 CG 为行，我给「建议攻略落点」。落点写成「攻略页面 · 事件号」，
> 找不到落点的写 `—`（片头 / 结局 / 自动取得）。你在回复列写 `#81` 这样确认或改编号，
> **留空 = 不关联**。

| # | CG | 获得条件 | 建议攻略落点 | 我的回复 |
|---|---|---|---|---|
"""

# CG code -> 建议攻略落点（手写判断；确认后改这里即可重生成）
BIZ_LINKS: dict[str, str] = {
    "CG01": "—（观看片头，自动取得）",
    "CG02": "—（观看片头，自动取得）",
    "CG03": "六大特殊通告 · 笑傲天际 #81（影友会当天点市民音乐厅；#91 宣传会昏倒另有一张）",
    "CG04": "其他事件 · 秘书莉铃事件 #3（第二年情人节）",
    "CG05": "—（2008-12-31 自动取得）",
    "CG06": "—（结局：与威尔合作 / 超越威尔且无感情结局）",
    "CG07": "—（结局：与威尔合作，与旗下女艺人无感情结局）",
    "CG08": "其他事件 · SD相关事件 #21（尾段：结局与威尔合作或超越威尔时出回归 CG）",
    "CG09": "—（结局：连续三个月赤字）",
    "CG10": "—（攻略无对应事件；带艺人于 2007-1-1 参加 SD 兄弟演唱会即出图）",
    "CG11": "其他事件 · SD相关事件 #21（同 CG08，老爸去世版）",
    "CG12": "—（结局：贺总承认的一流经纪公司）",
}

DATA_ROW = re.compile(r"^\|\s*\d+\s*\|")


def load_main_group() -> list[dict]:
    data = json.loads(CG_JSON.read_text(encoding="utf-8"))
    items = [it for it in data["items"] if it["groupId"] == "main"]
    items.sort(key=lambda it: (it.get("order") or 0, it["code"]))
    return items


def pad_tables(text: str) -> tuple[str, int]:
    """给每张表补「我的回复」列（已补过则原样返回）。"""
    if "我的回复" in text:
        return text, 0
    out: list[str] = []
    added = 0
    for line in text.splitlines():
        stripped = line.rstrip()
        if stripped.startswith("| # |"):
            out.append(stripped + " 我的回复 |")
            added += 1
            continue
        if stripped.startswith("|---"):
            out.append(stripped + "---|")
            continue
        if DATA_ROW.match(stripped):
            out.append(stripped + " |")
            continue
        out.append(line)
    return "\n".join(out) + "\n", added


def biz_section() -> str:
    lines = [BIZ_NOTE.rstrip("\n")]
    for i, it in enumerate(load_main_group(), 1):
        link = BIZ_LINKS.get(it["code"].replace(" ", ""), "—")
        lines.append(f"| {i} | {it['code']} {it['name']} | {it['condition']} | {link} | |")
    return "\n".join(lines) + "\n"


def main() -> None:
    text = OUT.read_text(encoding="utf-8")
    if not BAK.exists():
        shutil.copy2(OUT, BAK)

    tables = "## " + text.split("\n## ", 1)[1]
    tables = tables.split("## 经纪人", 1)[0].rstrip() + "\n"
    tables, added = pad_tables(tables)

    OUT.write_text(HEADER + tables + "\n" + biz_section(), encoding="utf-8")
    print(f"reply column added to {added} table(s) -> {OUT}")


if __name__ == "__main__":
    main()
