"""Build public/data/sweet/guide.json for 明星志愿3 甜蜜乐章.

Usage:
    python scripts/extract_sweet_guide.py

Only the Python standard library is required. 甜蜜乐章 与 明星志愿3 是两个平级
站点，数据各自一份：这里只产出 public/data/sweet/guide.json，不碰原站的
public/data/guide.json。

目录结构（类目 / 每节的标题 / 排序）写在下面的 CATEGORIES 里，正文按节放在
sources/sweet/*.txt，由 PARSERS 里登记的解析函数读入，塞进对应节点。还没有
正文的节点保留 status="missing"，页面上给出「这一页还没整理」的占位提示。

目前有五种页面形态：

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

**清单页**（自制通告一览）

    自制通告一览              ← 首行，与页面标题同名 → 不当副标题
    1、触发剧情后直接获得；    ← ●…● 之前是整页的获得方式说明，普通段落
    ●唱片●                   ← 分章（section），后面的艺人分组是 heading
    1）《晴天娃娃》特殊，…     ← 一首歌一张卡：歌名当标题、编号进 pill
    歌艺700、名气500、…       ← 属性行留在同一张卡里（行首括号的折行也接回去）

**事件页（带时间）**（服装获得方法和剧情）

    服装获得方法              ← 首行，页面副标题
    春夏洋装                  ← 服装名（heading）
    1-1差不多该换季了…2008/3   ← 编号 + 标题 + 省略号后的条件与年月
    ※杜云芊仪态350↑才触发     ← 提示
    虚拟服装相关剧情           ← 分章（section）
    1-1.穿上小红帽服装后…      ← 编号带句点、整行都是正文

**分段页**（三大节日相关）

    ▲主角生日▲               ← 分章（section），源文本没有整页标题
    第一年生日                ← 小标题（heading）
    1.如果有交往对象，…        ← 列表项与箭头流程都是普通段落，编号原样保留
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


GENRE_RE = re.compile(r"^●(.+)●$")
GROUP_RE = re.compile(r"^(\d+)、(.*)$")
NOTICE_RE = re.compile(r"^(\d+)）(.*)$")
BOOK_RE = re.compile(r"^《([^》]+)》(.*)$")

# 小标题的判定：短、不带句读的行（服装名 / 节日里的「第一年生日」这类）。
# 全角括号不算句读——「甜美小红帽（坚定的友谊）」本身就是一节的名字。
HEADING_PUNCT = "。，、：；！？—…"
# 源文本里混进来的 ASCII 控制字符（BOM、软连字符之类）。
CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _read_lines(path: Path) -> list[str]:
    """按行读源文本：统一换行、去掉首尾空白与空行。

    原攻略是从别处拷贝来的，个别地方混进了 ASCII 控制字符（自制通告那页就有一个
    0x18），这里一并清掉，免得进到页面源码里。
    """
    raw = path.read_bytes().decode("utf-8").replace("\r\n", "\n").split("\n")
    return [CTRL_RE.sub("", line).strip() for line in raw if line.strip()]


def _is_heading(text: str) -> bool:
    """节日页的小标题：短、不带句读、不是列表项。"""
    if len(text) > 14 or any(ch in text for ch in HEADING_PUNCT):
        return False
    # 「第1年-不限次数」「1.如果有交往对象…」是列表项，不是标题。
    return not re.match(r"^(第\d+年-|\d)", text)


def _is_outfit_heading(text: str) -> bool:
    """服装页的服装名：都是不含数字的名词短语（带括号的是「服装（结局/效果）」）。

    这页的正文里也会出现「星期2前往追梦广告公司」这种又短又没标点的句子，
    所以不能像节日页那样只看长度——带数字的一律不是服装名。
    """
    if any(ch in text for ch in HEADING_PUNCT) or re.search(r"\d", text):
        return False
    return len(text) <= 14 if "（" in text else len(text) <= 6


def parse_self_notices(path: Path) -> tuple[list[dict], str]:
    """自制通告一览 → ●唱片 / ●电视剧 / ●电影 分章，每个艺人一节，一首歌一张卡。

    源文本有两种「1、」编号：开头的获得方式说明和后面的艺人都长这样，只能靠
    「是否已经出现过 ●…●」来区分。歌名后的说明与属性行留在同一张卡里。
    """
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0
    in_genre = False

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    def open_event(title: str, rest: str, label: str | None = None) -> None:
        blocks.append(
            {"kind": "event", "text": title, "group": group, **({"label": label} if label else {})}
        )
        detail = rest.strip("，, ")
        if detail:
            push("paragraph", detail)

    for text in lines[1:]:
        genre = GENRE_RE.match(text)
        if genre:
            in_genre = True
            group += 1
            push("section", genre.group(1).strip())
            continue

        song = NOTICE_RE.match(text)
        if song:
            group += 1
            book = BOOK_RE.match(song.group(2))
            if book:
                open_event(f"《{book.group(1)}》", book.group(2), song.group(1))
            else:
                open_event(song.group(2), "", song.group(1))
            continue

        numbered = GROUP_RE.match(text)
        if numbered and in_genre:
            group += 1
            push("heading", numbered.group(2).strip(), depth=1)
            continue

        book = BOOK_RE.match(text) if in_genre else None
        if book:
            group += 1
            open_event(f"《{book.group(1)}》", book.group(2))
            continue

        # 行首括号是上一句的折行（电影《讨厌爱上你》那条的片种说明）。
        if text.startswith("（") and blocks:
            last = blocks[-1]
            if last["kind"] == "paragraph":
                last["text"] += text
                continue
            if last["kind"] == "event":
                push("paragraph", text)
                continue

        push("paragraph", text)

    return blocks, lines[0]


# 「1-1差不多该换季了…2008/3」——编号紧跟标题，省略号后面是条件与年月。
OUTFIT_TIMED_RE = re.compile(r"^(\d+(?:-\d+)+)[.]?(.+?)…(.+)$")
# 「1-1.穿上小红帽服装后…」——后半段虚拟服装剧情，整行都是正文。
# 句点可有可无：源文本的 `2-8周三,继续去酒吧…` 就漏了那个点。
OUTFIT_STEP_RE = re.compile(r"^(\d+(?:-\d+)+)[.]?(.+)$")
# 源文本里这两块是并列的；只有「虚拟服装相关剧情」是分章标题，其余短行是服装名。
OUTFIT_SECTIONS = {"虚拟服装相关剧情"}


def parse_outfits(path: Path) -> tuple[list[dict], str]:
    """服装获得方法和剧情 → 每件衣服一节，事件卡里带上「时间：」与提示。"""
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines[1:]:
        if text in OUTFIT_SECTIONS:
            group += 1
            push("section", text)
            continue

        timed = OUTFIT_TIMED_RE.match(text)
        if timed:
            group += 1
            push("event", timed.group(2).strip(), label=timed.group(1))
            push("paragraph", f"时间：{timed.group(3).strip()}")
            continue

        step = OUTFIT_STEP_RE.match(text)
        if step:
            group += 1
            push("event", step.group(2).strip(), label=step.group(1))
            continue

        if text.startswith("※"):
            push("note", text)
            continue

        if _is_outfit_heading(text):
            group += 1
            push("heading", text, depth=1)
            continue

        push("paragraph", text)

    return blocks, lines[0]


FESTIVAL_SECTION_RE = re.compile(r"^▲(.+)▲$")


def parse_festivals(path: Path) -> tuple[list[dict], str]:
    """三大节日相关 → ▲…▲ 分章，其余是短标题与说明段落（源文本没有页面总标题）。"""
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines:
        section = FESTIVAL_SECTION_RE.match(text)
        if section:
            group += 1
            push("section", section.group(1).strip())
            continue

        if _is_heading(text):
            group += 1
            push("heading", text, depth=1)
            continue

        push("paragraph", text)

    return blocks, ""


PARSERS = {
    "main-story": parse_main_story,
    "company": parse_company,
    "abroad-notices": parse_abroad_notices,
    "self-notices": parse_self_notices,
    "outfits": parse_outfits,
    "festivals": parse_festivals,
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
