"""把「路欧桑剧情整理」的 CG 行合并成一节，并把整页跳转的 CG 标出来。

背景：桑禾蓓 / 欧怡青 / 路风 的感情线在攻略里按「情况1~5」写了五遍（桑禾蓓页里有一份，
「其他事件 · 路欧桑剧情整理」下又按分支各写一份），同一张 CG 会落在三四个分支的同名
事件上，逐个事件指定落点没有意义。所以：

  * 角色表里的「情况X」行与末尾的四个分支表合并成「## 路欧桑剧情整理（18 条）」；
  * 这些 CG 的「攻略›」统一跳 **其他事件 · 路欧桑剧情整理** 整页（`sources/cg-node-links.tsv`）；
  * 角色表里其余命中的感情 CG 只标注「页面级 → 路欧桑整页」，不再暗示事件锚点。

原始文件另存 `cg-event-mapping.md.bak`；本脚本读 .bak、写回正文，可重复运行。
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "outputs" / "cg-event-mapping.md"
BAK = DOC.with_name("cg-event-mapping.md.bak")

BRANCHES = {
    "只有路风在旗下": "情况1",
    "只有欧怡青在旗下": "情况2",
    "只有桑禾蓓在旗下": "情况3",
    "路风和欧怡青都在旗下": "情况4",
    "路风和桑禾蓓都在旗下": "情况5",
}
# 合并后的「建议 CG」：键是 (分支, 事件号)。
SUGGEST: dict[tuple[str, str], str] = {
    ("只有路风在旗下", "7"): "CG 04 与禾蓓陪练剧本 · CG 04 路风指导演技?",
    ("只有路风在旗下", "18"): "CG 05 和路风在公园 · CG 05 与禾蓓公园讨论",
    ("只有桑禾蓓在旗下", "23"): "CG 05 和路风在公园 · CG 05 与禾蓓公园讨论",
    ("只有桑禾蓓在旗下", "35"): "—（已删 CG 标记）",
    ("只有桑禾蓓在旗下", "37"): "CG 07 安慰",
    ("只有桑禾蓓在旗下", "43"): "CG 06 与路风结婚 · CG 06 与禾蓓结婚照",
    ("路风和欧怡青都在旗下", "3"): "CG 03 认识路风 · CG 07 认识欧怡青",
    ("路风和欧怡青都在旗下", "8"): "CG 04 19号酒馆与路风相谈甚欢 · CG 08 三角关系",
    ("路风和欧怡青都在旗下", "11"): "CG 03 记者质问",
    ("路风和欧怡青都在旗下", "23"): "CG 06 一起过生日 · CG 10 庆祝欧怡青生日",
    ("路风和欧怡青都在旗下", "51"): "CG 09 与欧怡青嬉戏 · CG 05 工作中不忘休闲?",
    ("路风和欧怡青都在旗下", "63"): "CG 08 告别演唱会",
    ("路风和欧怡青都在旗下", "69"): "CG 11 与欧怡青结婚",
    ("路风和桑禾蓓都在旗下", "11"): "CG 04 与禾蓓陪练剧本 · CG 04 路风指导演技?",
    ("路风和桑禾蓓都在旗下", "29"): "CG 05 和路风在公园 · CG 05 与禾蓓公园讨论",
    ("路风和桑禾蓓都在旗下", "46"): "—（已删 CG 标记）",
    ("路风和桑禾蓓都在旗下", "48"): "CG 07 安慰",
    ("路风和桑禾蓓都在旗下", "54"): "CG 06 与路风结婚 · CG 06 与禾蓓结婚照",
}

SECTION_NOTE = """> 这三段感情线在攻略里按「情况1~5」写了五遍（桑禾蓓页里一份，本节点下再按分支各一份），
> 同一张 CG 会出现在三四个分支的同名事件上，所以**不锚具体事件**：图鉴里这些 CG 的「攻略›」
> 统一跳到 **其他事件 · 路欧桑剧情整理** 整页。
> 这一节只用来核对「哪张 CG 属于哪条线」，`建议 CG` 已按 `sources/cg-node-links.tsv` 填好，
> **回复列留空 = 认可**，要改就写 CG 编号。
>
> 已接页面级跳转的 16 张：桑禾蓓 CG03 / CG05 / CG06 / CG07，欧怡青 CG03 / CG04 / CG06 / CG08，
> 路风 CG04 / CG05 / CG06 / CG07 / CG08 / CG09 / CG10 / CG11。
> 带 `?` 的两张（**桑禾蓓 CG04 路风指导演技**、**欧怡青 CG05 工作中不忘休闲**）疑似同类但攻略里
> 找不到完全对得上的事件，暂时没给入口；要我挂上就回一句。
"""

HEAD_COLUMNS = ["#", "章节", "事件号", "触发", "事件正文（CG 附近）", "建议 CG", "我的回复"]

# 表头补一条总规则，并把正文快照跟源文本对齐（那句误导性的 CG 已删）。
HEAD_OLD = """填完我会据此生成跳转数据：攻略里的金色 CG 徽标 → 对应 CG 卡片，CG 卡片 / 大图 → 对应攻略事件。

反向入口只在「该事件唯一对应一张 CG」时出现。"""
HEAD_NEW = """- **路欧桑的感情线单独看最后一节**：桑禾蓓 / 欧怡青 / 路风的感情剧情在攻略里按「情况1~5」写了五遍，
  同一张 CG 落在三四个分支的同名事件上，所以这些 CG 不锚具体事件，**统一跳「其他事件 · 路欧桑剧情整理」整页**；
  对应的行已经从各角色表里抽出来，合成「路欧桑剧情整理」一节。

填完我会据此生成跳转数据：攻略里的金色 CG 徽标 → 对应 CG 卡片，CG 卡片 / 大图 → 对应攻略事件。

反向入口只在「该事件唯一对应一张 CG」时出现；页面级（路欧桑）那一批不设反向入口。"""
SNAPSHOT_FIX = ("之后可到SOSA看到CG，但路桑恋无法修成正果", "之后可到SOSA看到后续事件，但路桑恋无法修成正果")
COVER_RE = re.compile(r"^情况\d[：:]")
COUNT_RE = re.compile(r"（\d+ 条）$")


def display_width(text: str) -> int:
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def pad_row(cells: list[str], widths: list[int]) -> str:
    padded = [cell + " " * max(0, widths[i] - display_width(cell)) for i, cell in enumerate(cells)]
    return "| " + " | ".join(padded) + " |"


def parse(lines: list[str]):
    head: list[str] = []
    sections: list[tuple[str, list[list[str]]]] = []
    title: str | None = None
    rows: list[list[str]] = []
    for line in lines:
        if line.startswith("## "):
            if title is not None:
                sections.append((title, rows))
            title, rows = line[3:].strip(), []
            continue
        stripped = line.rstrip()
        if title is None:
            head.append(line)
            continue
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if not cells or cells[0] == "#" or set("".join(cells)) <= {"-"}:
            continue
        rows.append(cells)
    if title is not None:
        sections.append((title, rows))
    return head, sections


def main() -> None:
    source = BAK if BAK.exists() else DOC
    head, sections = parse(source.read_text(encoding="utf-8").splitlines())

    merged: list[list[str]] = []
    kept: list[tuple[str, list[list[str]]]] = []
    for title, rows in sections:
        branch = COUNT_RE.sub("", title)
        if branch in BRANCHES:
            for cells in rows:
                cells[1] = branch
                merged.append(cells)
            continue
        rest = [cells for cells in rows if not COVER_RE.match(cells[1])]
        kept.append((title, rest))

    for cells in merged:
        cells[4] = cells[4].replace(*SNAPSHOT_FIX)
        key = (cells[1], cells[2])
        if key in SUGGEST:
            cells[5] = SUGGEST[key]

    # 角色表里还留着的感情 CG 行：只标「页面级」，不暗示能锚到某个事件。
    for title, rows in kept:
        name = COUNT_RE.sub("", title)
        for cells in rows:
            if len(cells) < 7:
                continue  # 经纪人 / 写真集两节是 5 列，按 CG 反查，不走这里的修正
            cells[5] = cells[5].replace("主角请吃宵夜（第二次）", "主角请吃宵夜")
            if name.endswith("桑禾蓓"):
                if cells[1] == "签约方法" and cells[2] == "2":
                    cells[5] = "CG 01 桑禾蓓参加综艺节目"
                if cells[1] == "达成结局条件" and cells[2] == "2":
                    cells[5] = "CG 08 主角请吃宵夜"
            if name.endswith("林芬芬") and cells[1] == "与SD相关事件" and cells[2] == "21":
                cells[5] = "CG 04 SD兄弟演唱会嘉宾"
            if name.endswith("萧依莉") and cells[1] == "泪洒片场":
                cells[5] = "—（无 CG，已删标记）"
            if (name.endswith("欧怡青") and cells[1] == "路欧恋") or (
                name.endswith("路风") and cells[1] in ("暗恋", "冷淡", "好友", "爱人")
            ):
                cells[5] = "页面级 → 路欧桑整页（见下节）"

    order: list[tuple[str, list[list[str]], bool, bool]] = []
    for title, rows in kept:
        base = COUNT_RE.sub("", title)
        if base.startswith("经纪人"):
            order.append(("路欧桑剧情整理", merged, True, False))
        order.append((base, rows, False, "张" in title))


    counter = 0
    chunks: list[str] = ["\n".join(head).rstrip() + "\n"]
    for title, rows, is_merged, custom in order:
        if not rows:
            continue
        for cells in rows:
            counter += 1
            cells[0] = str(counter)
        widths = [display_width(cell) for cell in HEAD_COLUMNS]
        for cells in rows:
            for i, cell in enumerate(cells):
                widths[i] = max(widths[i], display_width(cell))
        body = [pad_row(HEAD_COLUMNS, widths), pad_row(["-" * width for width in widths], widths)]
        body += [pad_row(cells, widths) for cells in rows]
        heading = f"## {title}" + ("" if custom else f"（{len(rows)} 条）")
        chunk = heading + "\n\n"
        if is_merged:
            chunk += SECTION_NOTE + "\n"
        chunks.append(chunk + "\n".join(body) + "\n")

    text = "\n".join(chunks).rstrip() + "\n"
    text = text.replace(HEAD_OLD, HEAD_NEW)
    DOC.write_text(text, encoding="utf-8")
    print(f"merged {len(merged)} 路欧桑 rows; total {counter} rows")


if __name__ == "__main__":
    main()
