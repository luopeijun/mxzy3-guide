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
DEFAULT_STATS = SOURCES / "character-stats.txt"
DEFAULT_SCENES = SOURCES / "scenes.txt"
DEFAULT_WORK = SOURCES / "work.txt"
DEFAULT_TRAINING = SOURCES / "training.txt"
DEFAULT_CERTIFICATES = SOURCES / "certificates.txt"
DEFAULT_PRODUCERS = SOURCES / "producers.txt"
DEFAULT_SELFMADE = SOURCES / "self-made.txt"
DEFAULT_TITLES = SOURCES / "titles.txt"
DEFAULT_MONOPOLY = SOURCES / "monopoly.txt"
DEFAULT_ENDINGS = SOURCES / "endings.txt"
OUTPUT = ROOT / "public" / "data" / "guide.json"

EVENT_RE = re.compile(r"^([0-9０-９]+(?:[－\-][0-9０-９]+)?(?:丵)?)\s*[（(]")
# `A.xxx` in most paragraphs, but the docx also writes `C 关古威…` with a plain
# space; the CJK lookahead keeps headings such as `M V 演出：` out of the match.
OPTION_RE = re.compile(r"^[A-Za-zＡ-Ｚａ-ｚ](?:[\.．、]\s*|[ 　]+(?=[\u4e00-\u9fff]))")
# Plain-text sources: `#` and `*` are the same heading level by design.
SECTION_RE = re.compile(r"^[#*]\s*(.+)$")
# Untagged source titles: `初始女艺人的事件（指…）：` — a lone colon-terminated
# line with no sentence punctuation of its own.
SECTION_END_RE = re.compile(r"^[^，,。！？；;]{2,40}[：:]$")
# `女艺人的疑惑` — a bare short line inside a section becomes a sub-heading.
SUBTITLE_RE = re.compile(r"^[^，,。！？；;：:\dA-Za-z]{2,16}$")
SUBTITLE_BLOCKERS = ("提醒", "以上", "该", "此", "主角", "谈话", "日后")
# `1.（自动）` / `3－1 （跟随）` / `6 （手动）` — the marker becomes a tag.
EVENT_LINE_RE = re.compile(r"^([0-9０-９]+(?:[－\-][0-9０-９]+)?)[\.．]?\s*[（(]([^）)]+)[）)]\s*")
CHARACTER_OPTION_RE = re.compile(r"^旗下艺人为")
QUESTION_RE = re.compile(r"^问题([0-9０-９]+)[：:]\s*(.+)$")
QUESTION_OPTION_RE = re.compile(r"^([１２３123])[．.、]\s*(.+)$")
QUESTION_LINK_RE = re.compile(r"^接问题([0-9０-９]+)$")
# Leading line of a plain-text source: `标题（补充说明）`.
PREAMBLE_RE = re.compile(r"^(?P<title>[^（(]+?)\s*[（(](?P<note>.+?)[）)]\s*$")
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


DASH_RE = re.compile(r"(?<!-)--(?!-)")
CJK_COMMA_RE = re.compile(r",(?=[\u3400-\u9fff])")


def _tidy(text: str) -> str:
    """Normalise the ASCII punctuation the plain-text sources mix in."""
    return CJK_COMMA_RE.sub("，", DASH_RE.sub("——", text))


def _parse_question_option(number: str, body: str) -> dict:
    """`１．爱的教育→林芬芬的友好度＋20，获得道具→接问题３` -> option block.

    The trailing `问题结束（补充说明）` keeps `问题结束` as the chip label and
    moves the bracket text into `hint`, so the option still reads as terminal.
    """
    parts = [part.strip() for part in body.split("→") if part.strip()]
    action = parts[0] if parts else ""
    effects: list[str] = []
    target = ""
    target_label = ""
    hint = ""

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
                hint = extra
            continue
        effects.append(part.replace("＋", "+"))

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
    if hint:
        block["hint"] = hint
    return block


def build_question_blocks(path: Path, page_title: str = "") -> list[dict]:
    """Turn the 游戏初始问题 txt into anchor-linked question cards.

    Each question becomes a `heading` block carrying a stable `id` (q1, q2 …),
    and every option records the question it flows into as `target`, so the
    front-end can render "接问题３" as an in-page jump link.

    The opening line is the page heading: `★标题`, or `标题（补充说明）` where
    the bracket part becomes a `note` (yellow hint). A title that repeats
    `page_title` is dropped, since the article header already shows it.
    Lines before the first question are the opening premises and collapse into
    one `note` block (one line per row).
    """
    lines = [line.strip() for line in _read_text(path).splitlines() if line.strip()]
    if not lines:
        return []

    blocks: list[dict] = []
    group = 0

    heading = re.sub(r"^[★☆]\s*", "", lines[0])
    preamble = PREAMBLE_RE.match(heading)
    title = preamble.group("title").strip() if preamble else heading
    title_note = preamble.group("note").strip() if preamble else ""
    if title == page_title or title.endswith(page_title):
        lines = lines[1:]
        if title_note:
            group += 1
            blocks.append({"kind": "note", "text": f"（{title_note}）", "group": group})
    elif preamble:
        lines = lines[1:]
        group += 1
        blocks.append({"kind": "section", "text": title, "group": group})
        group += 1
        blocks.append({"kind": "note", "text": f"（{title_note}）", "group": group})

    pending: list[str] = []
    in_question = False
    for line in lines:
        question = QUESTION_RE.match(line)
        if question:
            if pending:
                group += 1
                blocks.append({"kind": "note", "text": "\n".join(pending), "group": group})
                pending = []

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

        if not in_question:
            pending.append(line)
            continue

        group += 1
        blocks.append({"kind": "paragraph", "text": line, "group": group})

    if pending:
        group += 1
        blocks.append({"kind": "note", "text": "\n".join(pending), "group": group})

    return blocks


def build_event_blocks(path: Path) -> list[dict]:
    """Turn the 初始事件 txt into blocks.

    `#` and `*` mark the same heading level, so both become `section` blocks;
    an untagged title such as `初始女艺人的事件（指…）：` is recognised by its
    trailing colon, and a bare short line inside a section (`女艺人的疑惑`)
    becomes a `heading` sub-title. Numbered lines become `event` blocks (the
    number survives as `label`), A./B. lines become options, `提醒：` lines
    become notes, and per-character alternatives (`旗下艺人为…`) are indented
    like options. The leading `★标题` line is the page title and is skipped.
    """
    blocks: list[dict] = []
    group = 0
    in_section = False
    has_section = False
    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if not blocks and line.startswith(("★", "☆")):
            continue

        section = SECTION_RE.match(line)
        if section:
            group += 1
            in_section = True
            has_section = True
            blocks.append({
                "kind": "section", "text": _tidy(section.group(1).strip()),
                "depth": 0, "group": group,
            })
            continue

        event = EVENT_LINE_RE.match(line)
        if event:
            # The txt drops the old `#初始剧情` label, so the opening events would
            # hang directly under the page. Give them their own section instead.
            if not has_section:
                group += 1
                in_section = True
                has_section = True
                blocks.append({"kind": "section", "text": "初始剧情", "depth": 0, "group": group})
            group += 1
            blocks.append({
                "kind": "event",
                "text": _tidy(line[event.end():].strip()),
                "label": event.group(1),
                "tag": event.group(2),
                "group": group,
            })
            continue

        if line.startswith("提醒"):
            blocks.append({"kind": "note", "text": _tidy(line), "group": group})
            continue
        if OPTION_RE.match(line) or CHARACTER_OPTION_RE.match(line):
            blocks.append({"kind": "option", "text": _tidy(line), "group": group})
            continue
        if SECTION_END_RE.match(line):
            group += 1
            in_section = True
            has_section = True
            blocks.append({
                "kind": "section", "text": _tidy(line.rstrip("：:")),
                "depth": 0, "group": group,
            })
            continue
        if (
            in_section
            and SUBTITLE_RE.match(line)
            and not line.startswith(SUBTITLE_BLOCKERS)
        ):
            group += 1
            blocks.append({"kind": "heading", "text": _tidy(line), "depth": 1, "group": group})
            continue
        blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})

    return blocks


# Attribute columns of the stats sheet, in source order: (label, key).
STATS_ATTRS = [
    ("演技", "acting"),
    ("歌艺", "singing"),
    ("口才", "eloquence"),
    ("才智", "wit"),
    ("仪态", "etiquette"),
    ("自信", "confidence"),
    ("动感", "dynamism"),
    ("体能", "stamina"),
    ("名气", "fame"),
    ("叛逆", "rebellion"),
    ("性感", "sexiness"),
    ("亲和", "affinity"),
]
STATS_ATTR_KEYS = {label: key for label, key in STATS_ATTRS}
STATS_GROWTH_LABEL = "成长"
STATS_NUMBER_RE = re.compile(r"^[0-9]+(?:\.[0-9]+)?$")


def _stats_cells(line: str) -> list[str]:
    return [cell.strip() for cell in re.split(r"\t+", line) if cell.strip()]


def build_stats_blocks(path: Path) -> list[dict]:
    """Turn the 初始属性 screenshots into one `table` block.

    The source keeps the shape of the game screen: a block starts with a row of
    character names, then one row per attribute and a `成长` row right after it
    (the growth multiplier of that attribute). 女 and 男 are two such blocks;
    they are merged into a single table — one row per character, one column per
    attribute, each cell carrying the value and its growth on a second line.
    """
    blocks: list[dict] = []
    current: dict | None = None
    last_attr = ""
    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line or line.startswith(("★", "☆", "【", "（")):
            continue
        cells = _stats_cells(line)
        if not cells:
            continue

        if all(not STATS_NUMBER_RE.match(cell) for cell in cells[1:]):
            current = {"names": cells, "attrs": {}, "order": []}
            blocks.append(current)
            last_attr = ""
            continue
        if current is None:
            raise ValueError(f"stats row before any character header: {line!r}")

        label, body = cells[0], cells[1:]
        if len(body) != len(current["names"]):
            raise ValueError(
                f"{label} has {len(body)} values for {len(current['names'])} characters"
            )
        if label == STATS_GROWTH_LABEL:
            if not last_attr:
                raise ValueError("growth row without a preceding attribute")
            current["attrs"][last_attr]["growth"] = body
            continue
        if label not in STATS_ATTR_KEYS:
            continue
        current["attrs"][label] = {"value": body, "growth": []}
        current["order"].append(label)
        last_attr = label

    if not blocks:
        raise ValueError("stats sheet is empty")

    labels: list[str] = []
    has_growth: set[str] = set()
    for block in blocks:
        for label in block["order"]:
            if label not in labels:
                labels.append(label)
            if block["attrs"][label]["growth"]:
                has_growth.add(label)
    missing = [label for label, _ in STATS_ATTRS if label not in labels]
    if missing:
        raise ValueError(f"stats sheet misses attributes: {missing}")

    rows: list[dict] = [{"name": name} for block in blocks for name in block["names"]]
    cursor = 0
    for block in blocks:
        for index, name in enumerate(block["names"]):
            row = rows[cursor + index]
            row["name"] = name
            for label, data in block["attrs"].items():
                key = STATS_ATTR_KEYS[label]
                row[key] = data["value"][index]
                if data["growth"]:
                    row[f"{key}G"] = data["growth"][index]
        cursor += len(block["names"])

    columns: list[dict] = [{"key": "name", "label": "姓名"}]
    for label, key in STATS_ATTRS:
        column: dict = {"key": key, "label": label, "numeric": True, "highlight": True}
        if label in has_growth:
            column["growthKey"] = f"{key}G"
        columns.append(column)

    broken = [
        (row.get("name", "?"), column["key"])
        for row in rows
        for column in columns
        if column["key"] not in row
        or ("growthKey" in column and column["growthKey"] not in row)
    ]
    if broken:
        raise ValueError(f"stats sheet is incomplete: {broken}")

    return [{
        "kind": "table",
        "text": f"{len(rows)} 位可签约艺人的初始属性与成长加成",
        "table": {"columns": columns, "rows": rows},
        "group": 1,
    }]


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


def build_scenes_blocks(path: Path) -> list[dict]:
    """Turn the 场景开启方法 txt into grouped scene/condition blocks.

    The txt groups scenes into 国内场景 / 国外场景（旅游项目）. A grouped
    heading line (`国内场景：` or `国外场景（旅游项目）`) becomes a `section`;
    a domestic `名称：条件` line splits into a `heading` + `paragraph`;
    an overseas project line `名称（注释）` becomes a `heading`; `A./B./C/D`
    lines become `option` (lettered badge), and `提示：` lines become `note`
    (yellow hint). Everything else is a `paragraph` attached to the current
    project group.
    """
    lines = [raw.strip() for raw in _read_text(path).splitlines()]
    lines = [ln for ln in lines if ln]
    blocks: list[dict] = []
    group = 0
    for line in lines:
        # Group heading: ends with a full-width colon, or starts with 国内/国外.
        if line.endswith("：") or line.startswith(("国内", "国外")):
            group += 1
            blocks.append({
                "kind": "section",
                "text": _tidy(line.rstrip("：").strip()),
                "depth": 0,
                "group": group,
            })
            continue
        # 提示 / 提醒 lines fold into a note (yellow hint) of the current project.
        if line.startswith(("提示", "提醒")):
            text = re.sub(r"^(提示|提醒)[：:]?\s*", "", line)
            blocks.append({"kind": "note", "text": _tidy(text), "group": group})
            continue
        # Domestic scene: 名称：条件 -> heading + paragraph, opening a new group.
        if "：" in line:
            name, _, cond = line.partition("：")
            group += 1
            blocks.append({"kind": "heading", "text": _tidy(name.strip()), "group": group})
            if cond.strip():
                blocks.append({"kind": "paragraph", "text": _tidy(cond.strip()), "group": group})
            continue
        # Lettered prerequisites (A./B./C /D …) -> option with a badge.
        if OPTION_RE.match(line):
            blocks.append({"kind": "option", "text": _tidy(line), "group": group})
            continue
        # Overseas project title: 名称（注释） -> heading, opening a new group.
        if "（" in line and "）" in line and len(line) <= 18:
            group += 1
            blocks.append({"kind": "heading", "text": _tidy(line), "group": group})
            continue
        # Otherwise a continuation line of the current project.
        blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})
    return blocks


# Short bare sub-heading inside a reference page (no colon), e.g. `证书取得`.
REFERENCE_SUBTITLE_RE = re.compile(r"^[^，,。！？；;：:\dA-Za-z]{2,12}$")


def build_reference_blocks(path: Path) -> list[dict]:
    """Turn a plain-text reference source (打工/训练/证书相关) into blocks.

    The `★` title line is the page heading and skipped. Short `：`-terminated
    lines (`增加属性：`, `打工升级条件：`) become diamond sub-headings; `提示：`
    / `提醒：` lines plus their continuation become a yellow note; everything
    else is a paragraph, one block per source line so the per-打工 / per-课程
    list reads cleanly.
    """
    lines = [raw.strip() for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0
    if not lines:
        return blocks
    start = 1 if lines[0].startswith(("★", "☆")) else 0
    pending_note = False
    for line in lines[start:]:
        if line.startswith(("提示", "提醒")):
            group += 1
            text = re.sub(r"^(提示|提醒)[：:]?\s*", "", line)
            blocks.append({"kind": "note", "text": _tidy(text), "group": group})
            pending_note = True
            continue
        if pending_note:
            if line.endswith("：") and len(line) <= 16:
                pending_note = False
            else:
                blocks[-1]["text"] += "\n" + _tidy(line)
                continue
        if line.endswith("：") and len(line) <= 16:
            group += 1
            blocks.append({
                "kind": "heading", "text": _tidy(line.rstrip("：")), "group": group,
            })
            continue
        if REFERENCE_SUBTITLE_RE.match(line):
            group += 1
            blocks.append({"kind": "heading", "text": _tidy(line), "group": group})
            continue
        group += 1
        blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})
    return blocks


def build_producers_blocks(path: Path) -> list[dict]:
    """Turn the 制作人相关 txt into blocks.

    The leading `★` line is the page title and skipped. A second `★` marks a
    major section (`制作人放水情况`, hairline above); `☆ …：` marks a diamond
    sub-heading (唱片 / 电视剧 / 电影 制作人选择). `注意：` becomes a yellow
    note; every other line is a paragraph — producer names (`林永育：`) and the
    `擅长类型－…` / `出现条件－…` attributes are list items, not headings.
    """
    lines = [raw.strip() for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0
    if not lines:
        return blocks
    start = 1 if lines[0].startswith(("★", "☆")) else 0
    for line in lines[start:]:
        if line.startswith("★"):
            group += 1
            blocks.append({
                "kind": "section", "text": _tidy(line.lstrip("★").strip()),
                "depth": 0, "group": group,
            })
            continue
        if line.startswith("☆"):
            group += 1
            blocks.append({
                "kind": "heading",
                "text": _tidy(line.lstrip("☆").rstrip("：").strip()),
                "group": group,
            })
            continue
        if line.startswith(("提示", "提醒", "注意")):
            group += 1
            text = re.sub(r"^(提示|提醒|注意)[：:]?\s*", "", line)
            blocks.append({"kind": "note", "text": _tidy(text), "group": group})
            continue
        group += 1
        blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})
    return blocks


def build_selfmade_blocks(path: Path) -> list[dict]:
    """Turn the 自制通告创作条件一览 txt into blocks.

    The opening `★当公司资金…。` is the page's only lead-in paragraph (it ends
    with a full stop, so it is not a section divider). The two `★歌曲部分…` /
    `★剧本部分…` lines (no full stop) are major sections, each with a hairline
    above it. Under each section a bare character name (`林芬芬`, `其他`) or a
    name with an annotation (`纪翔（…）`) is a diamond sub-heading, and every
    song line that carries the `－` separator (`歌名－条件`) is a paragraph.
    """
    lines = [raw.strip() for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0
    for line in lines:
        if line.startswith("★"):
            group += 1
            rest = line.lstrip("★").strip()
            if rest.endswith("。"):
                blocks.append({"kind": "paragraph", "text": _tidy(rest), "group": group})
            else:
                blocks.append({
                    "kind": "section", "text": _tidy(rest), "depth": 0, "group": group,
                })
            continue
        if "－" in line or "-" in line:
            group += 1
            blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})
            continue
        group += 1
        blocks.append({"kind": "heading", "text": _tidy(line), "group": group})
    return blocks


TITLE_NOTE_RE = re.compile(r"^(PS|P\.S|注意|注)[：:，,]?\s*")
TITLE_PAIR_RE = re.compile(r"^([^：:]{1,20})[：:]\s*(.+)$")


def build_titles_blocks(path: Path) -> list[dict]:
    """Turn the 明星称号详解 txt into blocks.

    `xx路线--` lines are major sections (hairline above). A `称号：条件` line
    splits into a diamond `heading` (the title) plus a `paragraph` (its
    condition); `PS:` / `P.S：` / `注：` / `注意` lines become yellow notes;
    a line ending with a bare colon (`各有两种达成条件：`) is a lead-in, kept as
    a paragraph. The closing priority rules (`若同时满足…`) get their own
    section so they do not read as part of the last route.
    """
    lines = [raw.strip() for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0

    def add(kind: str, text: str, **extra) -> None:
        nonlocal group
        group += 1
        blocks.append({"kind": kind, "text": _tidy(text), "group": group, **extra})

    for line in lines:
        if line.endswith("--"):
            add("section", line.rstrip("-").strip(), depth=0)
            continue
        if line.startswith("若同时满足"):
            add("section", "称号显示优先级", depth=0)
            add("paragraph", line)
            continue
        if TITLE_NOTE_RE.match(line):
            add("note", TITLE_NOTE_RE.sub("", line))
            continue
        if not line.endswith(("：", ":")):
            pair = TITLE_PAIR_RE.match(line)
            if pair:
                add("heading", pair.group(1).strip())
                add("paragraph", pair.group(2).strip())
                continue
        add("paragraph", line)
    return blocks


MONOPOLY_QUESTION_RE = re.compile(r"^([0-9]+)\)\s*(.+)$")
MONOPOLY_ANSWER_RE = re.compile(r"^Ans[:：]\s*(.+)$")
# `Ans: 斧头帮 1) 明星志愿三中，…` — the answer and the next question on one line.
MONOPOLY_MERGED_RE = re.compile(r"^(Ans[:：]\s*.*?)\s+([0-9]+\)\s*.+)$")


def build_monopoly_blocks(path: Path) -> list[dict]:
    """Turn the 大富翁题目答案 txt into a per-question answer bank.

    Every `N) 题目` line carries the same N for a whole batch, since each batch
    is the set of questions that can be dealt at slot N; a change of N opens a
    new `第N题` sub-heading and every `Ans: …` line under it becomes one `qa`
    block (question + answer). The trailing `卡片功用` block is a section whose
    `名称: 说明` lines are paragraphs.
    """
    raw = [line.strip() for line in _read_text(path).splitlines()]
    lines: list[str] = []
    for line in raw:
        merged = MONOPOLY_MERGED_RE.match(line)
        if merged:
            lines.extend([merged.group(1).strip(), merged.group(2).strip()])
        else:
            lines.append(line)

    blocks: list[dict] = []
    group = 0
    number: int | None = None
    question = ""
    in_cards = False
    for line in lines:
        if not line or line.startswith("★"):
            continue
        if line.startswith("卡片功用"):
            in_cards = True
            group += 1
            blocks.append({"kind": "section", "text": "卡片功用", "depth": 0, "group": group})
            continue
        if in_cards:
            blocks.append({
                "kind": "paragraph",
                "text": _tidy(re.sub(r"\s*[:：]\s*", "：", line, count=1)),
                "group": group,
            })
            continue
        ask = MONOPOLY_QUESTION_RE.match(line)
        if ask:
            current = int(ask.group(1))
            question = ask.group(2).strip()
            if current != number:
                number = current
                group += 1
                blocks.append({"kind": "heading", "text": f"第{current}题", "group": group})
            continue
        ans = MONOPOLY_ANSWER_RE.match(line)
        if ans:
            blocks.append({
                "kind": "qa",
                "text": _tidy(question),
                "answer": _tidy(ans.group(1).strip()),
                "group": group,
            })
            continue
        group += 1
        blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})
    return blocks


ENDING_RE = re.compile(r"^结局\s*([0-9]+)\s+(.+?)[：:]\s*(.*)$")
ENDING_LEAD_RE = re.compile(r"^(达成条件[0-9]?)[：:]?\s*(.*)$")
ENDING_ITEM_RE = re.compile(r"^([0-9]+)[.．、]\s*(.+)$")
ENDING_SUBITEM_RE = re.compile(r"^([a-zA-Z])[.．、]\s*(.+)$")


def _angle_asides(text: str) -> str:
    """`<2种选1种>` → `（2种选1种）`: the sources use ASCII angle brackets as asides."""
    if "<" in text and text.count("<") == text.count(">"):
        return text.replace("<", "（").replace(">", "）")
    return text


def build_endings_blocks(path: Path) -> list[dict]:
    """Turn the 结局条件一览 txt into one card per ending.

    `结局N 名称：描述` opens a diamond sub-heading (`结局N 名称`) plus the
    description paragraph under it. `达成条件…` lines are lead-ins, the
    numbered lines are the conditions (indent 1) and the `a.` / `b.` lines are
    the alternatives inside them (indent 2). The opening `★提示：…` is the
    page's only caution.
    """
    lines = [_tidy(raw.strip()) for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0

    def add(kind: str, text: str, **extra) -> None:
        blocks.append({
            "kind": kind, "text": _angle_asides(text), "group": group, **extra,
        })

    for line in lines:
        if line.startswith("★"):
            group += 1
            text = re.sub(r"^(提示|注意)[：:]?\s*", "", line.lstrip("★").strip())
            # `…与钜子合作） 才有主角…` — drop the stray space after a bracket.
            add("note", re.sub(r"(?<=[）】」》])\s+(?=[\u4e00-\u9fff])", "", text))
            continue
        ending = ENDING_RE.match(line)
        if ending:
            group += 1
            add("heading", f"结局{ending.group(1)} {ending.group(2).strip()}")
            if ending.group(3).strip():
                add("paragraph", ending.group(3).strip())
            continue
        lead = ENDING_LEAD_RE.match(line)
        if lead:
            body = _angle_asides(lead.group(2).strip())
            if not body:
                add("paragraph", lead.group(1))
            elif body.startswith("（"):
                add("paragraph", f"{lead.group(1)}{body}")
            else:
                add("paragraph", f"{lead.group(1)}：{body}")
            continue
        item = ENDING_ITEM_RE.match(line)
        if item:
            add("paragraph", f"{item.group(1)}. {item.group(2).strip()}", depth=1)
            continue
        sub = ENDING_SUBITEM_RE.match(line)
        if sub:
            add("paragraph", f"{sub.group(1)}. {sub.group(2).strip()}", depth=2)
            continue
        add("paragraph", line)
    return blocks


def build(
    docx: Path,
    questions: Path,
    events: Path,
    stats: Path,
    scenes: Path,
    work: Path,
    training: Path,
    certificates: Path,
    producers: Path,
    selfmade: Path,
    titles: Path,
    monopoly: Path,
    endings: Path,
) -> dict:
    rows = read_paragraphs(docx)
    sections = Sections(rows)
    event_blocks = build_event_blocks(events)
    stats_blocks = build_stats_blocks(stats)

    required = [
        "角色攻略", "初始问题选项",
        "接手第一周细节", "小秘书相关事件（不涉艺人）",
        "蛮羊事件：", "史麦克的拜访", "美丽之星事件", "演艺圈前辈事件",
        "威尔相关事件", "六大传说级通告（99%获奖）", "老爸相关事件", "SD相关事件",
    ]
    missing = [title for title in required if title not in sections.index]
    if missing:
        raise ValueError(f"document structure changed, missing chapters: {missing}")

    # ---- The SD chapter ends with the 结局 section, now sourced from endings.txt ----
    sd = sections.index["SD相关事件"]
    sd_start, sd_end = sd["start"] + 1, sd["end"]
    ending_marker = next(
        i for i in range(sd_start, sd_end)
        if sections.texts[i].startswith("若要说明3的遗憾")
    )
    sd_lines = sections.texts[sd_start:ending_marker]

    # ---- 经纪人事件簿 ----
    game_items = [
        make_node(
            "game-guide/initial-questions", "游戏初始问题",
            description="开局访谈的 14 道问题：选项影响艺人初始友好度与道具，点「接问题Ｎ」可跳到下一题。",
            blocks=build_question_blocks(questions, page_title="游戏初始问题"),
        ),
        make_node(
            "game-guide/initial-events", "初始事件",
            description="开局第一周的新手事件，以及初始女艺人（林芬芬、苏嫚君、萧依莉、姚子莹）的疑惑与请求；序号后的标签是触发方式。",
            blocks=event_blocks,
        ),
        make_node(
            "game-guide/work", "打工相关",
            source_title="打工相关.txt",
            blocks=build_reference_blocks(work),
        ),
        make_node(
            "game-guide/training", "训练相关",
            blocks=build_reference_blocks(training),
        ),
        make_node(
            "game-guide/certificates", "证书相关",
            source_title="证书相关.txt",
            blocks=build_reference_blocks(certificates),
        ),
        make_node(
            "game-guide/producers", "制作人相关",
            source_title="制作人相关.txt",
            blocks=build_producers_blocks(producers),
        ),
        make_node(
            "game-guide/self-made", "自制通告创作条件一览",
            source_title="自制通告创作条件一览.txt",
            description="各艺人可创作的自制歌曲 / 剧本及其触发或属性条件；满足条件的歌曲需安排自由活动大于 20 天、剧本大于 40 天。",
            blocks=build_selfmade_blocks(selfmade),
        ),
        make_node(
            "game-guide/initial-stats", "所有人物初始属性",
            description="18 位可签约艺人（含资料片新增）在游戏开始时的属性与成长加成。",
            blocks=stats_blocks,
        ),
        make_node(
            "game-guide/scenes", "场景开启方法",
            blocks=build_scenes_blocks(scenes),
        ),
        make_node(
            "game-guide/titles", "明星称号详解",
            source_title="明星称号详解.txt",
            blocks=build_titles_blocks(titles),
        ),
    ]

    game_items += [
        make_node("game-guide/items", "物品总览", status="missing"),
        make_node("game-guide/favorite-items", "艺人喜爱物品一览", status="missing"),
        make_node("game-guide/monopoly-answers", "大富翁BaBaBa答案",
                  source_title="大富翁题目答案.txt",
                  blocks=build_monopoly_blocks(monopoly)),
        make_node(
            "game-guide/endings", "结局条件一览",
            source_title="结局条件一览.txt",
            description="公司结局 1–22 的达成条件；结局 2–5 才会出现主角的感情结局。",
            blocks=build_endings_blocks(endings),
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
            "game-guide", "经纪人事件簿",
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
    stats = Path(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_STATS
    scenes = Path(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_SCENES
    work = Path(sys.argv[6]) if len(sys.argv) > 6 else DEFAULT_WORK
    training = Path(sys.argv[7]) if len(sys.argv) > 7 else DEFAULT_TRAINING
    certificates = Path(sys.argv[8]) if len(sys.argv) > 8 else DEFAULT_CERTIFICATES
    producers = Path(sys.argv[9]) if len(sys.argv) > 9 else DEFAULT_PRODUCERS
    selfmade = Path(sys.argv[10]) if len(sys.argv) > 10 else DEFAULT_SELFMADE
    titles = Path(sys.argv[11]) if len(sys.argv) > 11 else DEFAULT_TITLES
    monopoly = Path(sys.argv[12]) if len(sys.argv) > 12 else DEFAULT_MONOPOLY
    endings = Path(sys.argv[13]) if len(sys.argv) > 13 else DEFAULT_ENDINGS
    if not docx.exists():
        raise SystemExit(f"docx not found: {docx}")
    if not questions.exists():
        raise SystemExit(f"questions txt not found: {questions}")
    if not events.exists():
        raise SystemExit(f"events txt not found: {events}")
    if not stats.exists():
        raise SystemExit(f"stats txt not found: {stats}")
    if not scenes.exists():
        raise SystemExit(f"scenes txt not found: {scenes}")
    if not work.exists():
        raise SystemExit(f"work txt not found: {work}")
    if not training.exists():
        raise SystemExit(f"training txt not found: {training}")
    if not certificates.exists():
        raise SystemExit(f"certificates txt not found: {certificates}")
    if not producers.exists():
        raise SystemExit(f"producers txt not found: {producers}")
    if not selfmade.exists():
        raise SystemExit(f"self-made txt not found: {selfmade}")
    if not titles.exists():
        raise SystemExit(f"titles txt not found: {titles}")
    if not monopoly.exists():
        raise SystemExit(f"monopoly txt not found: {monopoly}")
    if not endings.exists():
        raise SystemExit(f"endings txt not found: {endings}")
    data = build(docx, questions, events, stats, scenes, work, training, certificates, producers, selfmade, titles, monopoly, endings)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"written: {OUTPUT}")
    print(json.dumps(data["meta"]["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
