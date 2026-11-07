"""Extract 明星志愿3攻略.docx into structured JSON for the web app.

Usage:
    python scripts/extract_guide.py [path/to/明星志愿3攻略.docx]

Only the Python standard library is required. The generated data is committed to
public/data/guide.json and loaded at runtime, so updating the guide does not
require rebuilding the front-end bundle.
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
SOURCES = ROOT / "sources"
DEFAULT_QUESTIONS = SOURCES / "game-initial-questions.txt"
DEFAULT_EVENTS = SOURCES / "initial-events.txt"
OUTPUT = ROOT / "public" / "data" / "guide.json"

EVENT_RE = re.compile(r"^([0-9０-９]+(?:[－\-][0-9０-９]+)?(?:丵)?)\s*[（(]")
OPTION_RE = re.compile(r"^[A-Za-zＡ-Ｚａ-ｚ][\.．、]\s*")
# Plain-text sources: `#` and `*` are the same heading level by design.
SECTION_RE = re.compile(r"^[#*]\s*(.+)$")
# `1.（自动）` / `3－1 （跟随）` / `6 （手动）` — keep the trailing marker in the body.
EVENT_LINE_RE = re.compile(r"^([0-9０-９]+(?:[－\-][0-9０-９]+)?)[\.．]?\s*[（(]")
CHARACTER_OPTION_RE = re.compile(r"^旗下艺人为")
QUESTION_RE = re.compile(r"^问题([0-9０-９]+)[：:]\s*(.+)$")
QUESTION_OPTION_RE = re.compile(r"^([１２３123])[．.、]\s*(.+)$")
QUESTION_LINK_RE = re.compile(r"^接问题([0-9０-９]+)$")
FULLWIDTH_DIGITS = str.maketrans("0123456789", "０１２３４５６７８９")
HALFWIDTH_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
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


def _read_text(path: Path) -> str:
    """Decode a plain-text source, tolerating the GBK files the game guides use."""
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"cannot decode {path}")


def _parse_question_option(number: str, body: str) -> dict:
    """`１．爱的教育→林芬芬的友好度＋20，获得道具→接问题３` -> option block."""
    parts = [part.strip() for part in body.split("→") if part.strip()]
    action = parts[0] if parts else ""
    effects: list[str] = []
    target = ""
    target_label = ""

    for part in parts[1:]:
        link = QUESTION_LINK_RE.match(part)
        if link:
            number_next = link.group(1).translate(HALFWIDTH_DIGITS)
            target = f"q{number_next}"
            target_label = f"接问题{number_next.translate(FULLWIDTH_DIGITS)}"
            continue
        if part.startswith("问题结束"):
            target_label = "问题结束"
            extra = part[len("问题结束"):].strip().strip("（）()")
            if extra:
                effects.append(extra)
            continue
        effects.append(part)

    text = "，".join(effects)
    block: dict = {
        "kind": "option",
        "text": text,
        "label": number.translate(HALFWIDTH_DIGITS),
        "action": action,
    }
    reward = re.search(r"[，,]?\s*获得(.+)$", text)
    if reward:
        block["reward"] = reward.group(1).strip()
        block["text"] = text[:reward.start()].strip("，, ")
    if target:
        block["target"] = target
    if target_label:
        block["targetLabel"] = target_label
    return block


def build_question_blocks(path: Path) -> list[dict]:
    """Turn the 游戏初始问题 txt into anchor-linked question cards.

    Each question becomes a `heading` block carrying a stable `id` (q1, q2 …),
    and every option records the question it flows into as `target`, so the
    front-end can render "接问题３" as an in-page jump link.
    """
    blocks: list[dict] = []
    group = 0
    in_question = False
    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line:
            continue

        question = QUESTION_RE.match(line)
        if question:
            group += 1
            in_question = True
            number = question.group(1).translate(HALFWIDTH_DIGITS)
            blocks.append({
                "kind": "heading",
                "text": question.group(2).strip(),
                "label": f"问题{number.translate(FULLWIDTH_DIGITS)}",
                "id": f"q{number}",
                "group": group,
            })
            continue

        option = QUESTION_OPTION_RE.match(line)
        if option and in_question:
            blocks.append({**_parse_question_option(option.group(1), option.group(2)), "group": group})
            continue

        group += 1
        in_question = False
        kind = "note" if not blocks else "paragraph"
        blocks.append({"kind": kind, "text": line, "group": group})

    return blocks


def build_event_blocks(path: Path) -> tuple[str, list[dict]]:
    """Turn the 初始事件 txt into (description, blocks).

    `#` and `*` mark the same heading level, so both become `heading` blocks.
    Numbered lines become `event` blocks (the number survives as `label`),
    A./B. lines become options, `提醒：` lines become notes, and per-character
    alternatives (`旗下艺人为…`) are indented like options.
    """
    blocks: list[dict] = []
    description = ""
    group = 0
    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if not blocks and not description and line.endswith(("：", ":")):
            description = line.rstrip("：:")
            continue

        section = SECTION_RE.match(line)
        if section:
            group += 1
            blocks.append({"kind": "section", "text": section.group(1).strip(), "group": group})
            continue

        event = EVENT_LINE_RE.match(line)
        if event:
            group += 1
            blocks.append({
                "kind": "event",
                "text": line[event.end() - 1:].strip(),
                "label": event.group(1),
                "group": group,
            })
            continue

        if line.startswith("提醒"):
            blocks.append({"kind": "note", "text": line, "group": group})
            continue
        if OPTION_RE.match(line) or CHARACTER_OPTION_RE.match(line):
            blocks.append({"kind": "option", "text": line, "group": group})
            continue
        blocks.append({"kind": "paragraph", "text": line, "group": group})

    return description, blocks


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


def build(docx: Path, questions: Path, events: Path) -> dict:
    rows = read_paragraphs(docx)
    sections = Sections(rows)
    events_description, event_blocks = build_event_blocks(events)

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
        make_node(
            "game-guide/initial-questions", "游戏初始问题",
            description="开局访谈的 14 道问题：选项影响艺人初始友好度与道具，点「接问题Ｎ」可跳到下一题。",
            blocks=build_question_blocks(questions),
        ),
        make_node(
            "game-guide/initial-events", "初始事件",
            description=events_description or None,
            blocks=event_blocks,
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
    questions = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_QUESTIONS
    events = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_EVENTS
    if not docx.exists():
        raise SystemExit(f"docx not found: {docx}")
    if not questions.exists():
        raise SystemExit(f"questions txt not found: {questions}")
    if not events.exists():
        raise SystemExit(f"events txt not found: {events}")
    data = build(docx, questions, events)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"written: {OUTPUT}")
    print(json.dumps(data["meta"]["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
