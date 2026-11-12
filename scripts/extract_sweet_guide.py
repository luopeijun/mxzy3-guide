"""Build public/data/sweet/guide.json for 明星志愿3 甜蜜乐章.

Usage:
    python scripts/extract_sweet_guide.py

Only the Python standard library is required. 甜蜜乐章 与 明星志愿3 是两个平级
站点，数据各自一份：这里只产出 public/data/sweet/guide.json，不碰原站的
public/data/guide.json。

目录结构（类目 / 每节的标题 / 排序）写在下面的 CATEGORIES 里，正文按节放在
sources/sweet/*.txt，由 PARSERS 里登记的解析函数读入，塞进对应节点。还没有
正文的节点保留 status="missing"，页面上给出「这一页还没整理」的占位提示。

节内格式（主线攻略）：

    主线任务（落日相关）      ← 首行，当作正文页的副标题
    投资                      ← 不带编号的行 = 章节（section）
    1-1．可别乱花我的钱！      ← 「数字-数字．」= 一个事件（编号 1-1 + 标题）
    　　　　时间：第一年五月    ← 缩进行 = 该事件的细节，按前缀决定类型
    　　　　概要：杜司臣前来拜访……
    　　　　提示：若资金不足……  ← 「提示：」与「（……」都渲染成金色备注
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources" / "sweet"
OUTPUT = ROOT / "public" / "data" / "sweet" / "guide.json"

# 「1-1．可别乱花我的钱！」
EVENT_RE = re.compile(r"^(\d+)-(\d+)．(.+)$")


def _clean_title(title: str) -> str:
    """源文本的句尾省略号是全角句点（`．．`），统一成 `…`。"""
    return re.sub(r"．+", "…", title).strip()


def parse_main_story(path: Path) -> tuple[list[dict], str]:
    """主线攻略 → (blocks, 页面副标题)。"""
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

        indented = raw[0] in " \t\u3000"

        if not indented:
            match = EVENT_RE.match(text)
            if match:
                group += 1
                seen_event = True
                push(
                    "event",
                    _clean_title(match.group(3)),
                    label=f"{match.group(1)}-{match.group(2)}",
                )
            elif "：" in text:
                # 不缩进但带冒号 = 文末的作者注解，后面缩进的行是它的续行。
                ending.append(text)
            else:
                group += 1
                push("section", text, depth=0)
            continue

        if not seen_event:
            # 章节标题与第一个事件之间的空行/杂行，忽略。
            continue
        if text.startswith("提示：") or text.startswith("（"):
            push("note", text)
        else:
            push("paragraph", text)

    if ending:
        group += 1
        blocks.append({"kind": "section", "text": "结局分歧", "depth": 0, "group": group})
        group += 1
        body = "\n".join(ending).replace("作者个人注解：", "个人注解：", 1)
        blocks.append({"kind": "note", "text": body, "group": group})

    return blocks, page_title


PARSERS = {
    "main-story": parse_main_story,
}

# 类目 / 子节点：(slug, 标题)。有正文的节由 PARSERS 覆盖 status 与 blocks。
CATEGORIES: list[dict] = [
    {
        "id": "sweet-guide",
        "title": "经纪人事件簿",
        "description": "经纪人相关的主线与经营事件：投资、骗局、摩登时代、落日",
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
        "description": "每位角色一页，感情线与约会选项合并",
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
        "childDescription": "感情线与约会选项",
    },
    {
        "id": "sweet-side",
        "title": "支线攻略",
        "description": "配角与舞台相关的支线",
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
        for slug, title in category["children"]:
            node: dict = {
                "id": f"{category['id']}/{slug}",
                "title": title,
                "status": "missing",
                "blocks": [],
                "children": [],
            }
            if category.get("childDescription"):
                node["description"] = category["childDescription"]

            parser = PARSERS.get(slug)
            if parser is not None:
                blocks, subtitle = parser(SOURCES / f"{slug}.txt")
                node["blocks"] = blocks
                node["status"] = "ready"
                if subtitle:
                    node["description"] = subtitle
            children.append(node)

        categories.append(
            {
                "id": category["id"],
                "title": category["title"],
                "description": category["description"],
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
