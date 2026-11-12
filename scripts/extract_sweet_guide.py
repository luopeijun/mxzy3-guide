"""Build public/data/sweet/guide.json for 明星志愿3 甜蜜乐章.

Usage:
    python scripts/extract_sweet_guide.py

Only the Python standard library is required. 甜蜜乐章 与 明星志愿3 是两个平级
站点，数据各自一份：这里只产出 public/data/sweet/guide.json，不碰原站的
public/data/guide.json。

目录结构（类目 / 每节的标题 / 排序）写在下面的 CATEGORIES 里，正文按节放在
sources/sweet/*.txt，由 PARSERS 里登记的解析函数读入，塞进对应节点。还没有
正文的节点保留 status="missing"，页面上给出「这一页还没整理」的占位提示。

目前有两种页面形态：

**事件页**（主线攻略、公司改建攻略）

    主线任务（落日相关）      ← 首行，当作正文页的副标题
    投资                      ← 不带编号的行 = 章节（section）
    4.改建                    ← 带编号的章节，「4.」只是章节号，标题取「改建」
    1-1．可别乱花我的钱！      ← 「数字-数字．」= 一个事件（编号 1-1 + 标题）
    　　　　时间：第一年五月    ← 事件的细节行，按前缀决定类型（缩进可有可无，
    　　　　概要：杜司臣前来拜访……   公司改建攻略里就是顶格写的）
    　　　　提示：若资金不足……  ← 「提示：」与「（……」都渲染成金色备注
    作者个人注解：……           ← 主线攻略文末的作者注，收成「结局分歧」一节

**表格页**（国外通告接拍条件）

    国外通告接拍条件          ← 首行，页面副标题
    东京                      ← 之后每三行一组：城市 / 公司（类型）/ 接拍条件
    京风唱片（唱片）
    推出3张唱片以上（个人、团体分开计算）
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources" / "sweet"
OUTPUT = ROOT / "public" / "data" / "sweet" / "guide.json"

# 「1-1．可别乱花我的钱！」——源文本的句点有全角也有半角，两种都认。
EVENT_RE = re.compile(r"^(\d+)-(\d+)[．.](.+)$")
# 「4.改建」——章节自带编号。事件是 `4-1`，靠 `(?!\d)` 把两者区分开。
CHAPTER_RE = re.compile(r"^(\d+)[．.](?!\d)(.+)$")

# 事件细节行的前缀：正文进普通段落，其余渲染成金色备注。
DETAIL_PREFIXES = ("时间：", "概要：", "条件：", "奖励：", "地点：", "备注：", "其他：")
NOTE_PREFIXES = ("提示：", "（")


def _clean_title(title: str) -> str:
    """源文本的句尾省略号是全角句点（`．．`），统一成 `…`。"""
    return re.sub(r"．+", "…", title).strip()


def parse_event_page(path: Path, ending_title: str | None = None) -> tuple[list[dict], str]:
    """事件页 → (blocks, 页面副标题)。

    `ending_title` 给定时，文末那段不带前缀的冒号行（主线攻略的作者注解）会收进
    该标题下的一个备注块；不给则那种行按普通章节处理，避免误吞正文。
    """
    lines = path.read_bytes().decode("utf-8").replace("\r\n", "\n").split("\n")

    blocks: list[dict] = []
    group = 0
    started = False
    page_title = ""
    seen_event = False
    ending: list[str] = []

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for raw in lines:
        if not raw.strip():
            continue
        text = raw.strip()

        # 首行是整页的副标题（原攻略写着「主线任务（落日相关）」）。
        if not started:
            started = True
            page_title = text
            continue

        # 作者在文末单独写下的结局分歧，接在最后一个章节之后。
        if ending:
            ending.append(text)
            continue

        match = EVENT_RE.match(text)
        if match:
            group += 1
            seen_event = True
            push(
                "event",
                _clean_title(match.group(3)),
                label=f"{match.group(1)}-{match.group(2)}",
            )
            continue

        chapter = CHAPTER_RE.match(text)
        if chapter:
            group += 1
            push("section", _clean_title(chapter.group(2)), depth=0)
            continue

        if text.startswith(NOTE_PREFIXES):
            push("note", text)
            continue
        if text.startswith(DETAIL_PREFIXES):
            push("paragraph", text)
            continue

        if raw[0] not in " \t\u3000":
            # 不带编号、不带前缀的行：要么是章节标题（主线攻略的「投资」），
            # 要么是文末的作者注解（只有允许收尾注的页面才这么判）。
            if ending_title and seen_event and "：" in text:
                ending.append(text)
            else:
                group += 1
                push("section", text, depth=0)
            continue

        if seen_event:
            push("paragraph", text)

    if ending and ending_title:
        group += 1
        blocks.append({"kind": "section", "text": ending_title, "depth": 0, "group": group})
        group += 1
        body = "\n".join(ending).replace("作者个人注解：", "个人注解：", 1)
        blocks.append({"kind": "note", "text": body, "group": group})

    return blocks, page_title


def parse_main_story(path: Path) -> tuple[list[dict], str]:
    """主线攻略 → 事件页 + 文末的「结局分歧」。"""
    return parse_event_page(path, ending_title="结局分歧")


def parse_company(path: Path) -> tuple[list[dict], str]:
    """公司改建攻略 → 事件页（比主线少一段作者注解）。"""
    return parse_event_page(path)


def parse_abroad_notices(path: Path) -> tuple[list[dict], str]:
    """国外通告接拍条件 → 一张「城市 / 公司 / 接拍条件」的表。"""
    lines = [line.strip() for line in path.read_bytes().decode("utf-8").split("\n")]
    rows_text = [line for line in lines[1:] if line]
    if not rows_text or len(rows_text) % 3:
        raise ValueError(
            f"{path.name}: 期望「城市 / 公司（类型）/ 条件」三行一组，实际 {len(rows_text)} 行"
        )

    rows: list[dict] = []
    for start in range(0, len(rows_text), 3):
        city, company, requirement = rows_text[start : start + 3]
        if "（" not in company:
            raise ValueError(
                f"{path.name}: 第 {start // 3 + 1} 组的公司行不像「名称（类型）」：{company!r}"
            )
        rows.append({"city": city, "company": company, "requirement": requirement})

    block = {
        "kind": "table",
        "text": "",
        "group": 1,
        "table": {
            "columns": [
                {"key": "city", "label": "城市"},
                {"key": "company", "label": "公司（通告类型）"},
                {"key": "requirement", "label": "接拍条件"},
            ],
            "rows": rows,
        },
    }
    return [block], ""


PARSERS = {
    "main-story": parse_main_story,
    "company": parse_company,
    "abroad-notices": parse_abroad_notices,
}

# 类目 / 子节点：(slug, 标题)。有正文的节由 PARSERS 覆盖 status 与 blocks。
# 副标题一律来自原文首行，这里不写任何概述——目录上的说明文字同样不写。
CATEGORIES: list[dict] = [
    {
        "id": "sweet-guide",
        "title": "经纪人事件簿",
        "children": [
            ("main-story", "主线攻略"),
            ("company", "公司改建攻略"),
            ("abroad-notices", "国外通告接拍条件"),
            ("self-notices", "自制通告一览"),
            ("outfits", "服装获得方法和剧情"),
            ("festivals", "三大节日相关"),
            ("sweet-mode", "甜蜜模式的影响"),
            ("favorite-gifts", "角色喜爱物品一览"),
            ("career-endings", "女主事业结局达成条件"),
            ("endings", "结局条件一览"),
        ],
    },
    {
        "id": "sweet-characters",
        "title": "角色攻略",
        "children": [
            ("cheng-zhongxuan", "城仲瑄"),
            ("danisi", "丹尼斯"),
            ("ji-xiang", "纪翔"),
            ("murong-hexi", "慕容和希"),
            ("shen-weizhen", "沈惟真"),
            ("shi-difen", "史蒂芬"),
            ("wei-ya", "卫亚"),
            ("yao-ziqi", "姚子奇"),
        ],
    },
    {
        "id": "sweet-side",
        "title": "支线攻略",
        "children": [
            ("stage-shadow", "舞台秘影"),
            ("tian-qing", "关于天晴"),
            ("xia-yijun", "关于夏以军"),
            ("xu-shijie", "关于徐世杰"),
            ("du-sichen", "关于杜司臣"),
            ("jin-haoxun", "关于金皓薰"),
        ],
    },
]


def build() -> dict:
    categories: list[dict] = []
    for category in CATEGORIES:
        children: list[dict] = []
        for entry in category["children"]:
            slug, title = entry[0], entry[1]
            node: dict = {
                "id": f"{category['id']}/{slug}",
                "title": title,
                "status": "missing",
                "blocks": [],
                "children": [],
            }

            parser = PARSERS.get(slug)
            if parser is not None:
                blocks, subtitle = parser(SOURCES / f"{slug}.txt")
                node["blocks"] = blocks
                node["status"] = "ready"
                # 副标题只取原文首行；与页面标题重复（或原文没写）就不写，绝不自己编一句概述。
                if subtitle and subtitle != title:
                    node["description"] = subtitle
            children.append(node)

        categories.append(
            {
                "id": category["id"],
                "title": category["title"],
                "status": "ready",
                "blocks": [],
                "children": children,
            }
        )

    items = blocks = ready = missing = 0
    for category in categories:
        for node in category["children"]:
            items += 1
            blocks += len(node["blocks"])
            if node["status"] == "ready":
                ready += 1
            else:
                missing += 1

    return {
        "meta": {
            "title": "明星志愿3 甜蜜乐章 · 攻略助手",
            "source": "sources/sweet",
            "generatedBy": "scripts/extract_sweet_guide.py",
            "stats": {
                "categories": len(categories),
                "items": items,
                "blocks": blocks,
                "readyItems": ready,
                "missingItems": missing,
                "sourceParagraphs": sum(
                    len(node["blocks"]) for category in categories for node in category["children"]
                ),
            },
        },
        "categories": categories,
    }


def main() -> int:
    missing = [slug for slug in PARSERS if not (SOURCES / f"{slug}.txt").exists()]
    if missing:
        print("missing source files: " + ", ".join(missing), file=sys.stderr)
        return 1
    data = build()
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stats = data["meta"]["stats"]
    print(
        f"wrote {OUTPUT.relative_to(ROOT)}: {stats['categories']} categories, "
        f"{stats['items']} items, {stats['blocks']} blocks "
        f"({stats['readyItems']} ready / {stats['missingItems']} missing)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
