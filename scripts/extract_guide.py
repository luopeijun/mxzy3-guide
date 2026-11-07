"""Extract 明星志愿3攻略.docx into structured JSON for the web app.

Usage:
    python scripts/extract_guide.py [path/to/明星志愿3攻略.docx]

Only the Python standard library is required. The generated data is committed to
src/data/guide.json so the front-end has no build-time dependency on the docx.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DOCX = Path("E:/Downloads/明星志愿3攻略.docx")
OUTPUT = ROOT / "src" / "data" / "guide.json"

EVENT_RE = re.compile(r"^([0-9０-９]+(?:[－\-][0-9０-９]+)?(?:丵)?)\s*[（(]")
OPTION_RE = re.compile(r"^[A-Za-zＡ-Ｚａ-ｚ][\.．、]\s*")
NOTE_PREFIXES = (
    "（提示", "（注意", "（PS", "（特别", "（如果",
    "PS：", "PS:", "超PS", "重要前提", "提示：", "注意：", "BTW：",
)

# Screenshot order of the original directory tree.
CHARACTERS = [
    ("林芬芬", "lin-fenfen", []),
    ("萧依莉", "xiao-yili", []),
    ("桑禾蓓", "sang-hebei", []),
    ("苏嫚君", "su-manjun", ["苏曼君"]),
    ("欧怡青", "ou-yiqing", []),
    ("路敏", "lu-min", []),
    ("路风", "lu-feng", []),
    ("姚子奇", "yao-ziqi", []),
    ("天晴", "tian-qing", []),
    ("关古威", "guan-guwei", []),
    ("陈奕夫", "chen-yifu", []),
    ("纪翔", "ji-xiang", []),
    ("新名纱雪", "xinming-shaxue", []),
    ("姚子莹", "yao-ziying", []),
    ("聆香", "ling-xiang", []),
    ("克烈斯", "ke-liesi", []),
    ("卫亚", "wei-ya", []),
    ("原少纬", "yuan-shaowei", []),
]

SIX_NOTICES = [
    ("落入凡间的天使", "angel"),
    ("万年之恋", "eternal-love"),
    ("银河", "galaxy"),
    ("末日战士", "doomsday-warrior"),
    ("昆仑历险", "kunlun-adventure"),
    ("笑傲天际", "proud-of-the-world"),
]

CHILD_SLUGS = {
    "★制作人选择": [
        "record-producer", "tv-producer", "film-director",
        "relaxed-rules", "songs", "scripts",
    ],
    "打工相关": ["attribute-gain", "training", "certificates"],
    "演艺圈前辈事件": ["gu-qianjing", "fang-ruoqi", "ma-zhiwen"],
}


def read_paragraphs(docx: Path) -> list[tuple[str, str]]:
    """Return (style, text) for every paragraph, TOC paragraphs included."""
    with zipfile.ZipFile(docx) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find(W + "body")
    result = []
    for paragraph in body.iter(W + "p"):
        text = "".join(node.text or "" for node in paragraph.iter(W + "t")).strip()
        paragraph_props = paragraph.find(W + "pPr")
        style = ""
        if paragraph_props is not None:
            style_node = paragraph_props.find(W + "pStyle")
            if style_node is not None:
                style = style_node.get(W + "val", "")
        result.append((style, text))
    return result


def classify(line: str) -> dict:
    compact = line.strip()
    match = EVENT_RE.match(compact)
    if match:
        return {"kind": "event", "text": compact, "label": match.group(1)}
    if OPTION_RE.match(compact):
        return {"kind": "option", "text": compact}
    if compact.startswith(NOTE_PREFIXES):
        return {"kind": "note", "text": compact}
    plain = compact.replace(" ", "")
    if (
        len(plain) <= 22
        and not re.search(r"[，,。！？；;]", plain)
        and not re.match(r"^[0-9０-９＋\-—－]", plain)
    ):
        return {"kind": "heading", "text": compact}
    if (
        len(plain) <= 24
        and plain.endswith(("：", ":"))
        and not re.search(r"[，,。！？]", plain)
    ):
        return {"kind": "heading", "text": compact}
    return {"kind": "paragraph", "text": compact}


def build_blocks(lines: list[str]) -> list[dict]:
    """Split on blank paragraphs, keep group index for visual separation."""
    groups: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if line.strip():
            current.append(line.strip())
        elif current:
            groups.append(current)
            current = []
    if current:
        groups.append(current)

    blocks: list[dict] = []
    for index, group in enumerate(groups):
        for line in group:
            blocks.append({**classify(line), "group": index})
    return blocks


def make_node(
    node_id: str,
    title: str,
    *,
    aliases: list[str] | None = None,
    source_title: str | None = None,
    description: str | None = None,
    blocks: list[dict] | None = None,
    children: list[dict] | None = None,
    status: str = "ready",
) -> dict:
    node: dict = {"id": node_id, "title": title, "status": status}
    if aliases:
        node["aliases"] = aliases
    if source_title:
        node["sourceTitle"] = source_title
    if description:
        node["description"] = description
    node["blocks"] = blocks or []
    node["children"] = children or []
    return node


class Sections:
    """Heading-2 chapters with their heading-3 sub-chapters."""

    def __init__(self, rows: list[tuple[str, str]]):
        self.texts = [text for _, text in rows]
        markers = [
            (index, style, text)
            for index, (style, text) in enumerate(rows)
            if style in ("2", "3") and text
        ]
        first = next(index for index, style, _ in markers if style == "2")
        self.body_start = first
        markers = [marker for marker in markers if marker[0] >= first]

        self.chapters: list[dict] = []
        for position, (index, style, title) in enumerate(markers):
            end = markers[position + 1][0] if position + 1 < len(markers) else len(rows)
            if style == "2":
                self.chapters.append({
                    "title": title,
                    "start": index,
                    "end": end,
                    "children": [],
                })
            elif self.chapters:
                self.chapters[-1]["children"].append({
                    "title": title,
                    "start": index,
                    "end": end,
                })
        self.index = {chapter["title"]: chapter for chapter in self.chapters}

    def intro(self, title: str) -> list[str]:
        chapter = self.index[title]
        stop = chapter["children"][0]["start"] if chapter["children"] else chapter["end"]
        return self.texts[chapter["start"] + 1:stop]

    def whole(self, title: str) -> list[str]:
        chapter = self.index[title]
        return self.texts[chapter["start"] + 1:chapter["end"]]

    def child(self, chapter_title: str, child_title: str) -> dict:
        for child in self.index[chapter_title]["children"]:
            if child["title"] == child_title:
                return child
        raise KeyError(f"missing sub-chapter: {chapter_title} / {child_title}")

    def child_lines(self, chapter_title: str, child_title: str) -> list[str]:
        child = self.child(chapter_title, child_title)
        return self.texts[child["start"] + 1:child["end"]]

    def sub_nodes(self, chapter_title: str, parent_id: str) -> list[dict]:
        chapter = self.index[chapter_title]
        slugs = CHILD_SLUGS.get(chapter_title, [])
        nodes = []
        for position, child in enumerate(chapter["children"]):
            slug = slugs[position] if position < len(slugs) else f"part-{position + 1}"
            nodes.append(make_node(
                f"{parent_id}/{slug}",
                child["title"],
                blocks=build_blocks(self.texts[child["start"] + 1:child["end"]]),
            ))
        return nodes


def build(docx: Path) -> dict:
    rows = read_paragraphs(docx)
    sections = Sections(rows)

    required = [
        "角色攻略", "初始问题选项", "场景开启方法", "★制作人选择", "打工相关",
        "艺人称号说明", "接手第一周细节", "小秘书相关事件（不涉艺人）",
        "蛮羊事件：", "史麦克的拜访", "美丽之星事件", "演艺圈前辈事件",
        "威尔相关事件", "六大传说级通告（99%获奖）", "老爸相关事件", "SD相关事件",
    ]
    missing = [title for title in required if title not in sections.index]
    if missing:
        raise ValueError(f"document structure changed, missing chapters: {missing}")

    # ---- Split the trailing SD chapter into SD events / endings / fatigue ----
    sd = sections.index["SD相关事件"]
    sd_start, sd_end = sd["start"] + 1, sd["end"]
    ending_marker = next(
        i for i in range(sd_start, sd_end)
        if sections.texts[i].startswith("若要说明3的遗憾")
    )
    fatigue_marker = next(
        i for i in range(ending_marker, sd_end)
        if sections.texts[i].strip() == "压力疲劳增加"
    )
    sd_lines = sections.texts[sd_start:ending_marker]
    ending_lines = sections.texts[ending_marker:fatigue_marker]
    fatigue_lines = sections.texts[fatigue_marker:sd_end]

    # ---- 游戏攻略 ----
    game_items = [
        make_node("game-guide/character-intro", "角色介绍", status="missing"),
        make_node("game-guide/relationship-map", "人物关系图", status="missing"),
        make_node(
            "game-guide/initial-questions", "游戏初始问题",
            source_title="初始问题选项",
            blocks=build_blocks(sections.intro("初始问题选项")),
        ),
        make_node(
            "game-guide/initial-events", "初始事件",
            source_title="接手第一周细节",
            blocks=build_blocks(sections.intro("接手第一周细节")),
        ),
        make_node("game-guide/initial-stats", "所有人物初始属性", status="missing"),
        make_node(
            "game-guide/scenes", "场景开启方法",
            blocks=build_blocks(sections.intro("场景开启方法")),
        ),
    ]

    work_children = sections.sub_nodes("打工相关", "game-guide/work-and-courses")
    work_children.append(make_node(
        "game-guide/work-and-courses/fatigue", "压力疲劳增加",
        blocks=build_blocks(fatigue_lines),
    ))
    game_items += [
        make_node(
            "game-guide/work-and-courses", "打工课程详解",
            source_title="打工相关",
            blocks=build_blocks(sections.intro("打工相关")),
            children=work_children,
        ),
        make_node("game-guide/items", "物品总览", status="missing"),
        make_node("game-guide/favorite-items", "艺人喜爱物品一览", status="missing"),
        make_node("game-guide/monopoly-answers", "大富翁B&B&B答案", status="missing"),
        make_node("game-guide/self-made-works", "艺人自制作品详解", status="missing"),
        make_node(
            "game-guide/producers", "制作人推荐",
            source_title="★制作人选择",
            blocks=build_blocks(sections.intro("★制作人选择")),
            children=sections.sub_nodes("★制作人选择", "game-guide/producers"),
        ),
        make_node(
            "game-guide/titles", "明星称号详解",
            source_title="艺人称号说明",
            blocks=build_blocks(sections.intro("艺人称号说明")),
        ),
        make_node(
            "game-guide/endings", "结局条件一览",
            blocks=build_blocks(ending_lines),
        ),
    ]

    # ---- 角色攻略 ----
    character_children = sections.index["角色攻略"]["children"]
    character_by_title = {child["title"]: child for child in character_children}
    character_items = []
    for title, slug, aliases in CHARACTERS:
        child = character_by_title[title]
        character_items.append(make_node(
            f"characters/{slug}", title,
            aliases=aliases or None,
            blocks=build_blocks(sections.texts[child["start"] + 1:child["end"]]),
        ))
    unused = set(character_by_title) - {title for title, _, _ in CHARACTERS}
    if unused:
        raise ValueError(f"unmapped character chapters: {sorted(unused)}")

    # ---- 六大特殊通告 ----
    notice_items = []
    for title, slug in SIX_NOTICES:
        child = sections.child("六大传说级通告（99%获奖）", title)
        notice_items.append(make_node(
            f"notices/{slug}", title,
            blocks=build_blocks(sections.texts[child["start"] + 1:child["end"]]),
        ))

    # ---- 其他事件 ----
    other_items = [
        make_node(
            "other-events/golden-father", "金父相关事件",
            source_title="老爸相关事件",
            blocks=build_blocks(sections.intro("老爸相关事件")),
        ),
        make_node(
            "other-events/will", "威尔相关事件",
            blocks=build_blocks(sections.intro("威尔相关事件")),
        ),
        make_node(
            "other-events/manyang", "蛮羊事件",
            blocks=build_blocks(sections.intro("蛮羊事件：")),
        ),
        make_node(
            "other-events/hollywood", "进军好莱坞",
            source_title="史麦克的拜访",
            blocks=build_blocks(sections.intro("史麦克的拜访")),
        ),
        make_node("other-events/sd", "SD相关事件", blocks=build_blocks(sd_lines)),
        make_node("other-events/president-he", "贺总相关事件", status="missing"),
        make_node(
            "other-events/secretary", "小秘书莉铃相关事件",
            source_title="小秘书相关事件（不涉艺人）",
            blocks=build_blocks(sections.intro("小秘书相关事件（不涉艺人）")),
        ),
        make_node("other-events/expansion", "资料片新增事件", status="missing"),
        make_node(
            "other-events/seniors", "演艺圈前辈事件",
            blocks=build_blocks(sections.intro("演艺圈前辈事件")),
            children=sections.sub_nodes("演艺圈前辈事件", "other-events/seniors"),
        ),
        make_node(
            "other-events/beauty-star", "美丽之星事件",
            blocks=build_blocks(sections.intro("美丽之星事件")),
        ),
    ]

    categories = [
        make_node(
            "game-guide", "游戏攻略",
            source_title="明3 · 原片+资料集 · 攻略",
            description="系统机制、数值、称号与结局条件等基础资料。",
            children=game_items,
        ),
        make_node(
            "characters", "角色攻略",
            source_title="全角色事件攻略",
            description="18 位可签约艺人的签约方法、事件链与感情线。",
            children=character_items,
        ),
        make_node(
            "notices", "六大特殊通告",
            source_title="六大特殊国际通告",
            description="六个传说级国际通告的道具、剧本与达成流程。",
            blocks=build_blocks(sections.intro("六大传说级通告（99%获奖）")),
            children=notice_items,
        ),
        make_node(
            "other-events", "其他事件",
            source_title="其他事件相关攻略",
            description="金父、威尔、SD、小秘书等支线事件整理。",
            children=other_items,
        ),
    ]

    def collect(nodes: list[dict], key: str) -> int:
        return sum(
            len(node[key]) + collect(node["children"], key)
            for node in nodes
        )

    all_items = [item for category in categories for item in category["children"]]
    meta = {
        "title": "明星志愿3 攻略",
        "source": docx.name,
        "generatedBy": "scripts/extract_guide.py",
        "stats": {
            "categories": len(categories),
            "items": len(all_items) + sum(
                len(item["children"]) for item in all_items
            ),
            "blocks": collect(categories, "blocks"),
            "readyItems": sum(1 for item in all_items if item["status"] == "ready"),
            "missingItems": sum(1 for item in all_items if item["status"] == "missing"),
            "sourceParagraphs": len(rows) - sections.body_start,
        },
    }
    return {"meta": meta, "categories": categories}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    docx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DOCX
    if not docx.exists():
        raise SystemExit(f"docx not found: {docx}")
    data = build(docx)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"written: {OUTPUT}")
    print(json.dumps(data["meta"]["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
