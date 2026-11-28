"""Build public/data/sweet/guide.json for 明星志愿3 甜蜜乐章.

Usage:
    python scripts/extract_sweet_guide.py

Only the Python standard library is required. 甜蜜乐章 与 明星志愿3 是两个平级
站点，数据各自一份：这里只产出 public/data/sweet/guide.json，不碰原站的
public/data/guide.json。

目录结构（类目 / 每节的标题 / 排序）写在下面的 CATEGORIES 里，正文按节放在
sources/sweet/*.txt，由 PARSERS 里登记的解析函数读入，塞进对应节点。还没有
正文的节点保留 status="missing"，页面上给出「这一页还没整理」的占位提示。

目前的页面形态有（解析器按首行与行形态识别）：

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
    ※杜云芊仪态350↑才触发     ← 提示（「提示：」同样走便签）
    虚拟服装相关剧情           ← 分章（section）
    1-1.穿上小红帽服装后…      ← 编号带句点、整行都是正文

**分段页**（三大节日相关）

    ▲主角生日▲               ← 分章（section），源文本没有整页标题
    第一年生日                ← 小标题（heading）
    沈惟真：沈惟真的蓝色缎带    ← 名单行用圆点；带序号的行不用（序号本身就是标记）
    第1年-不限次数            ← 年份门槛缩进一级，挂在「约会次数要求：」下面

**结局页**（女主事业结局达成条件）

    女主事业结局达成条件      ← 首行，与页面标题同名 → 不当副标题
    天王巨星：女主角的称号…    ← 每个结局都是一个大标题（section），条件跟在下面
    巨星条件                  ← 分章（section）
    ●数值条件                 ← 小标题（heading）
    歌唱：600↑                ← 门槛数值都是普通段落

**表格页（带说明）**（结局条件一览，已并入 career-endings 页尾）

    结局条件一览              ← 首行，合并后当作页尾小节的标题
    公司显示名称   知名度   公关   ← 原表头（列间用两个以上空格对齐，读入时跳过）
    1.傲视全球的演艺帝国  2500以上  150以上
    完成夏以军相关剧情……       ← 紧跟着的一行是这一个结局的条件说明

**奖项表页**（各类奖项颁奖日期及内容）

    各类奖项颁奖日期及内容      ← 首行，与页面标题同名 → 不当副标题
    金星奖 － 广告              ← 四个奖项各开一章（section）
    公布时间：...               ← 单行说明，颁奖时间同理
    入围名单08/02/04(一)　颁奖08/02/29(五)  ← 年份进 pill，日期留在正文
    奖项：                      ← 次级标题，下面是圆点条列的奖项名单

**结局清单页**（感情结局）

    感情结局（结婚图取得条件）   ← 首行与页面标题同名 → 不当副标题
    杜云芊与任何一人…            ← 页首三条总纲走金色便签
    沈惟真结婚                   ← 每位角色一章（section）
    角色：沈惟真                 ← 原文第二列，角色名进 pill
    收到喜欢的礼物10个以上       ← 其余条件圆点条列

**清单页（按角色）**（甜蜜模式的影响 / 角色喜爱物品一览）

    影响                      ← 分章（section）；甜蜜模式这页没有页面总标题
    a.哥哥送钱剧情…           ← 「影响」的条目，次级标题（heading depth 1）
    #以下列出使用甜蜜模式时…   ← 作者注释（note）
    沈惟真： 收到喜欢的礼物…    ← 艺人包在白底卡片里（heading depth 2 + card），
                                续行是卡内的细则
    4-1.约会2次以上…          ← 告白条件：编号单独进 tag，正文跟在后面
    玫瑰之星、爱神巧克力、…    ← 喜爱物品：一个角色一个大标题（section）

**角色页**（8 位角色的感情攻略）

    城仲瑄                    ← 首行，与页面标题同名 → 不当副标题
    签约金：0万                ← 开头三行是列表（分红 / 限制），不加自拟的「基础信息」标题
    可创作作品：               ← 分章（section）
    唱片·如雪：自由活动20天后   ← 每条作品一个圆点；源文本带 `*` 的是特殊作品（金色菱形）
    事件：                     ← 分章（section）
    1.加入                    ← 章节（heading depth 1）
    1-1.樱花绽放的季节（友好度上升、CG）  ← 事件卡：编号进 pill，括号里 CG 走徽标、
    　　　　　　　　　　　　　　　　　 其余效果（友好度上升）单独成 tag
    时间：第1年3月             ← 事件的细节行，「提示：」渲染成金色备注
    普通模式下结婚图取得条件：   ← 分章（section），下面的编号条目原样排（不重复加圆点）
    6-2.取消友好度检查、…      ← 告白条件：事件编号进 pill，条件跟在后面
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources" / "sweet"
OUTPUT = ROOT / "public" / "data" / "sweet" / "guide.json"
# CG ↔ 攻略事件的映射表（由 scripts/build_sweet_cg_links.py 从核对表 xlsx 生成）。
# 四列：cgId / nodeId / event|text / key。命中后写到块上：`cgIds`（正向，前端据此
# 反查图鉴落点）+ `anchor`（页内 DOM id，形如 `ev12`，与 ContentBlockList 的兜底
# 同一套编号）。`event` 类还会补 `cg: true`，让卡片和原生标了（CG）的事件长得一样。
CG_LINKS = SOURCES / "cg-links.tsv"
# 服装页的事件说明：挂在事件块上，不新增块（追踪器按块下标存进度）。
# 五列：服装名 / 事件编号 / 分组标题 / 条件 / 正文；编号在不同服装间会重复，
# 所以用服装名 + 编号做键。
OUTFIT_EVENT_NOTES = SOURCES / "outfit-event-notes.tsv"
# 支线页的事件说明：同样挂在事件块上，不新增块。五列，键是（页面 slug，事件编号），
# 因为 2-1 / 1-1 这类编号在六页之间会重复。
SIDE_EVENT_NOTES = SOURCES / "side-event-notes.tsv"
# 艺人基本资料不再是独立页面：源文件只作为结构化卡片的真源，读出来挂到
# 对应角色页的 `profile` 字段，由 ContentPanel 渲染在页头，不进 blocks。
ARTIST_PROFILES = SOURCES / "artist-profiles.txt"
# 杜云芊没有独立角色页，她的资料挂在主线攻略页头。
PROFILE_PINNED = {"sweet-guide/main-story": "杜云芊"}
# 角色头像按约定命名放在 public/images/sweet/：`<slug>-logo.*` 是目录与
# 角色卡在人名左侧展示的圆圈头像（与主站 images/characters/ 同一套约定）。
SWEET_IMAGES = ROOT / "public" / "images" / "sweet"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")


def _character_avatar(slug: str) -> str | None:
    """Return the web path (relative to BASE_URL) of `<slug>-logo` image."""
    for ext in IMAGE_EXTS:
        path = SWEET_IMAGES / f"{slug}-logo{ext}"
        if path.exists():
            return f"images/sweet/{slug}-logo{ext}"
    return None


def _character_cover(slug: str) -> str | None:
    """Return the web path (relative to BASE_URL) of `<slug>-cover` image."""
    for ext in IMAGE_EXTS:
        path = SWEET_IMAGES / f"{slug}-cover{ext}"
        if path.exists():
            return f"images/sweet/{slug}-cover{ext}"
    return None

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
    """主线攻略 → 事件页 + 文末的「结局分歧」+ 初期攻略。

    初期攻略是开局五条提示，整段追加在页尾，原文不改；这里只生成普通段落，
    不新增 event 块，主线 80 个原有块的顺序和追踪下标完全不动。
    """
    blocks, title = parse_event_page(path, ending_title="结局分歧")
    early, _ = parse_generic_list(SOURCES / "early-guide.txt")
    base = max((b["group"] for b in blocks), default=0)
    blocks.append({"kind": "section", "text": "初期攻略", "group": base + 1})
    for block in early:
        # 源文本的分节空行不渲染成空标题/空段落。
        if not block["text"].strip():
            continue
        block["group"] = base + 1
        blocks.append(block)
    return blocks, title


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

    作品取得条件已经写在本页每条作品的说明里，存档解析另有按作品码对齐的
    数据可直查，所以不再重复附「艺人创作取得」整表——那是同一批作品的
    第二种视角。原有事件块一个不动，追踪器与 CG 锚点都不受影响。
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
        # 作者补的 PS 是整段的附加说明，走便签样式；不能进下面「行首括号＝折行」的合并。
        if text.startswith(("（PS", "（ps")):
            push("note", text)
            continue

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


def read_outfit_event_notes(path: Path) -> dict[tuple[str, str], list[dict]]:
    """读服装页补充说明，键是（服装名，事件编号）；编号跨服装会重复。"""
    if not path.exists():
        return {}
    notes: dict[tuple[str, str], list[dict]] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 5:
            raise ValueError(f"{path.name}:{number}: expected 5 columns, got {raw!r}")
        outfit, label, group, condition, text = (part.strip() for part in parts)
        if not all((outfit, label, group, condition, text)):
            raise ValueError(f"{path.name}:{number}: empty field in {raw!r}")
        groups = notes.setdefault((outfit, label), [])
        bucket = next((g for g in groups if g["title"] == group), None)
        if bucket is None:
            bucket = {"title": group, "items": []}
            groups.append(bucket)
        bucket["items"].append({"label": condition, "text": text})
    return notes


def read_side_event_notes(path: Path) -> dict[tuple[str, str], list[dict]]:
    """读支线页补充说明，键是（页面 slug，事件编号）。"""
    if not path.exists():
        return {}
    notes: dict[tuple[str, str], list[dict]] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 5:
            raise ValueError(f"{path.name}:{number}: expected 5 columns, got {raw!r}")
        page, label, group, condition, text = (part.strip() for part in parts)
        if not all((page, label, group, condition, text)):
            raise ValueError(f"{path.name}:{number}: empty field in {raw!r}")
        groups = notes.setdefault((page, label), [])
        bucket = next((g for g in groups if g["title"] == group), None)
        if bucket is None:
            bucket = {"title": group, "items": []}
            groups.append(bucket)
        bucket["items"].append({"label": condition, "text": text})
    return notes


def parse_outfits(path: Path, event_notes: dict[tuple[str, str], list[dict]] | None = None) -> tuple[list[dict], str]:
    """服装获得方法和剧情 → 每件衣服一节，事件卡里带上「时间：」与提示。"""
    lines = _read_lines(path)
    event_notes = event_notes if event_notes is not None else read_outfit_event_notes(OUTFIT_EVENT_NOTES)
    blocks: list[dict] = []
    group = 0
    outfit = ""

    def push(kind: str, text: str, **extra) -> None:
        nonlocal outfit
        if kind == "heading":
            outfit = text
        block = {"kind": kind, "text": text, "group": group, **extra}
        if kind == "event":
            groups = event_notes.get((outfit, str(extra.get("label", ""))))
            if groups:
                block["eventNotes"] = groups
        blocks.append(block)

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

        if text.startswith(("※", "提示：")):
            push("note", text)
            continue

        if _is_outfit_heading(text):
            group += 1
            push("heading", text, depth=1)
            continue

        push("paragraph", text)

    return blocks, lines[0]


FESTIVAL_SECTION_RE = re.compile(r"^▲(.+)▲$")
# 「沈惟真：沈惟真的蓝色缎带」——名单行用圆点；带序号的行不用，序号本身就是标记。
FESTIVAL_ITEM_RE = re.compile(r"^[^\s：:\d]{2,10}[：:]")
# 「第1年-不限次数」——年份门槛挂在「约会次数要求：」下面，缩进一级。
FESTIVAL_YEAR_RE = re.compile(r"^第\d+年[-－]")


def parse_festivals(path: Path) -> tuple[list[dict], str]:
    """三大节日相关 → ▲…▲ 分章，其余是短标题与说明段落（源文本没有页面总标题）。

    这一页大半是名单：生日礼物 8 个人、情人节 CG 8 个人、两组邀约条件里的编号条目。
    「谁：什么」这种名单行渲染成圆点条目；带序号的行不加圆点（序号已经是标记），
    年份门槛再缩进一级挂在「约会次数要求：」下面。
    """
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

        if text.startswith("注："):
            push("note", text)
            continue

        if FESTIVAL_YEAR_RE.match(text):
            push("paragraph", text, bullet=True, depth=1)
            continue

        if FESTIVAL_ITEM_RE.match(text):
            push("paragraph", text, bullet=True)
            continue

        push("paragraph", text)

    return blocks, ""


# 「天王巨星：女主角的称号为超级天后」——结局名 + 达成条件，一个结局一张卡。
CAREER_ENDING_RE = re.compile(r"^([^：:]{2,12})[：:](.+)$")

# 「歌唱：600↑」——巨星的六项数值门槛，是并列名单，渲染成圆点条目。
GIANT_STAT_RE = re.compile(r"^(歌唱|演技|仪态|自信|名气|人气)[：:]")

# 「金星奖（2月29日）：最佳模特儿奖」——四个奖项，缩进挂在「☆必须为以下奖项：」下面。
GIANT_AWARD_RE = re.compile(r"^金[星钟曲像]奖[（(]")


def parse_career_endings(path: Path) -> tuple[list[dict], str]:
    """女主事业结局达成条件 → 11 个结局各一张卡，后面接「巨星条件」四项细则。

    「巨星条件」里的六项数值与四个奖项都是并列名单，加圆点；带数字序号的
    通告 / 其他条件不加（序号本身已经是标记），奖项再缩进一级。

    结局条件一览（公司结局表）也收在本页末尾，原文当作一个小节，单独成章。
    """
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0
    in_giant = False
    giant_block = ""  # 当前处在「巨星条件」的哪一项细则下
    in_awards = False  # 是否已越过「☆必须为以下奖项：」这一行引导句

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines[1:]:
        # 「巨星条件」之后是巨星的数值 / 通告 / 奖项门槛，形态与前面的结局列表不同。
        if text.startswith("巨星条件"):
            in_giant = True
            group += 1
            push("section", "巨星条件")
            continue

        if text.startswith("●"):
            group += 1
            giant_block = text.lstrip("●").strip()
            in_awards = False
            push("heading", giant_block, depth=1)
            continue

        if in_giant and GIANT_STAT_RE.match(text):
            push("paragraph", text, bullet=True)
            continue

        if in_giant and giant_block == "奖项条件":
            if text.startswith("☆"):
                push("paragraph", text)
                in_awards = True
                continue
            if in_awards and GIANT_AWARD_RE.match(text):
                push("paragraph", text, bullet=True, depth=1)
                continue

        ending = CAREER_ENDING_RE.match(text) if not in_giant else None
        if ending:
            group += 1
            # 每个结局是一个大标题（天王巨星 … 公司倒闭），条件跟在下面一行。
            push("section", ending.group(1).strip())
            push("paragraph", ending.group(2).strip())
            continue

        push("paragraph", text)

    # 结局条件一览（公司结局）合并到本页：只追加末尾的小节与表格，
    # 前面事业结局的块顺序、下标都不动。
    endings = SOURCES / "endings.txt"
    if endings.exists():
        extra, extra_title = parse_endings(endings)
        base = max((b["group"] for b in blocks), default=0)
        blocks.append({"kind": "section", "text": extra_title, "group": base + 1})
        for block in extra:
            block["group"] += base + 1
            blocks.append(block)

    return blocks, lines[0]


# 「1.傲视全球的演艺帝国       2500以上             150以上」——列之间用两个以上空格对齐。
ENDINGS_ROW_RE = re.compile(r"^(\d+)\.(.+?)\s{2,}(\S+)\s{2,}(\S+)$")


def parse_endings(path: Path) -> tuple[list[dict], str]:
    """结局条件一览 → 16 行「序号 / 公司名称 / 知名度 / 公关 / 达成条件」的表。

    原表里每个结局下面还有一行条件说明，收进同一行的「达成条件」列；
    第 16 条原文没写说明，留空。
    """
    lines = _read_lines(path)
    rows: list[dict] = []
    for text in lines[2:]:  # 首行是页面标题，第二行是原表的表头
        match = ENDINGS_ROW_RE.match(text)
        if match:
            rows.append(
                {
                    "index": match.group(1),
                    "name": match.group(2).strip(),
                    "fame": match.group(3),
                    "pr": match.group(4),
                    "condition": "",
                }
            )
            continue
        if not rows:
            raise ValueError(f"{path.name}: 表头之后的行不属于任何结局：{text!r}")
        rows[-1]["condition"] = text

    columns = [
        {"key": "index", "label": "序号"},
        {"key": "name", "label": "公司显示名称"},
        {"key": "fame", "label": "知名度"},
        {"key": "pr", "label": "公关"},
        # 「达成条件」是整句话，允许折行，否则整张表会被撑出横向滚动条。
        {"key": "condition", "label": "达成条件", "wrap": True},
    ]
    return [{"kind": "table", "text": "", "group": 1, "table": {"columns": columns, "rows": rows}}], lines[0]


# 「金星奖 － 广告」——四个奖项各开一章，章名保留原文的破折号写法。
AWARD_SECTION_RE = re.compile(r"^金[星钟曲像]奖\s*[－-]\s*.+$")
# 「入围名单08/02/04(一)　颁奖08/02/29(五)」——源文本用半角括号，这里两种都认。
AWARD_DATE_RE = re.compile(
    r"^入围名单(\d{2}/\d{2}/\d{2})[（(]([一二三四五六日])[）)]\s+"
    r"颁奖(\d{2}/\d{2}/\d{2})[（(]([一二三四五六日])[）)]$"
)


def parse_award_dates(path: Path) -> tuple[list[dict], str]:
    """各类奖项颁奖日期及内容 → 四个奖项分章，日期按年份一行一条。

    日期行不做成表格：整页只有「年份 / 入围 / 颁奖」三个短字段，带年份 pill 的
    单行比一张表更紧凑，窄屏也不会出横向滚动条。奖项名用圆点条列。
    """
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines[1:]:
        if AWARD_SECTION_RE.match(text):
            group += 1
            push("section", text)
            continue

        date = AWARD_DATE_RE.match(text)
        if date:
            push(
                "paragraph",
                f"入围名单 {date.group(1)}（{date.group(2)}） 颁奖 {date.group(3)}（{date.group(4)}）",
                label=f"20{date.group(1)[:2]}",
            )
            continue

        if text.rstrip("：:") == "奖项":
            push("heading", "奖项", depth=1)
            continue

        if text.startswith(("公布时间：", "颁奖时间：")):
            push("paragraph", text)
            continue

        push("paragraph", text, bullet=True)

    return blocks, lines[0]


# 「沈惟真结婚」这类行开一章；章内的「角色：」保留原文第二列的角色名。
ROMANCE_END_RE = re.compile(r"^.+结婚$")


def parse_romance_endings(path: Path) -> tuple[list[dict], str]:
    """感情结局（结婚图取得条件）→ 八位各开一章，条件逐条圆点列出。

    页首三条是总纲（开启结局／还要满足条件／艺人不在旗下没有结婚图），走金色
    便签；原文放在表尾，这里提到页首，先讲清再列每位艺人的条件。
    """
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines[1:]:
        if ROMANCE_END_RE.match(text):
            group += 1
            push("section", text)
            continue
        if text.startswith("角色："):
            push("paragraph", text[3:], label="角色")
            continue
        if group == 0:
            push("note", text)
            continue
        push("paragraph", text, bullet=True)

    return blocks, lines[0]


# 甜蜜模式这一页的首行就是「启动方法」，没有单独的页面总标题。
SWEET_MODE_SECTIONS = {"启动方法", "使用时机", "影响"}
# 「沈惟真： 收到喜欢的礼物5个以上。」——角色名 + 该角色的条件。
SWEET_MODE_ROLE_RE = re.compile(r"^([^\s：:]{2,6})[：:]\s*(.*)$")
# 「4-1.约会2次以上…」——告白条件按攻略本的事件编号列出，编号进 tag。
SWEET_MODE_EVENT_RE = re.compile(r"^(\d+-\d+)[.](.+)$")
# 「a.哥哥送钱剧情…」——「影响」与「使用时机」的条目编号。
SWEET_MODE_LETTER_RE = re.compile(r"^([a-f])[.．]\s*(.+)$")


def parse_sweet_mode(path: Path) -> tuple[list[dict], str]:
    """甜蜜模式的影响 → 三段正文 + 两张「结婚 / 告白条件」清单。

    层级是这一页的重点：`a.`~`f.` 是「影响」的六个条目，属于次级标题一级；
    挂在 `c.` / `d.` 下面的结婚、告白清单是它们的细则，要退到更淡更小的一级，
    不能反过来比 `a.`~`f.` 更抢眼（之前做成白底卡片就犯了这个错）。
    """
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0
    part = ""  # 当前大标题：启动方法 / 使用时机 / 影响
    zone = ""  # "" / "marriage" / "confession"：当前是否在某张清单里

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines:
        if text in SWEET_MODE_SECTIONS:
            part, zone = text, ""
            group += 1
            push("section", text)
            continue

        if text.startswith("#"):
            # 注释行与前后的角色清单不共用 group，否则会渲染进上一条里。
            zone = "confession" if "告白" in text else "marriage"
            group += 1
            push("note", text.lstrip("#").strip())
            continue

        letter = SWEET_MODE_LETTER_RE.match(text)
        if letter:
            # 见到 a.~f. 就说明上面的清单结束了。
            zone = ""
            if part == "使用时机":
                push("paragraph", text, bullet=True)
            else:
                group += 1
                push("heading", text, depth=1)
            continue

        if zone == "marriage":
            role = SWEET_MODE_ROLE_RE.match(text)
            if role:
                group += 1
                push("heading", role.group(1).strip(), depth=2, card=True)
                if role.group(2).strip():
                    push("paragraph", role.group(2).strip(), depth=2)
                continue
            push("paragraph", text, depth=2)
            continue

        if zone == "confession":
            role = SWEET_MODE_ROLE_RE.match(text)
            if role and not role.group(2).strip():
                group += 1
                push("heading", role.group(1).strip(), depth=2, card=True)
                continue
            # 「4-1.约会2次以上…」：编号进 tag，正文留在后面。
            event = SWEET_MODE_EVENT_RE.match(text)
            if event:
                push("paragraph", event.group(2).strip(), label=event.group(1), depth=2)
                continue
            push("paragraph", text, depth=2)
            continue

        # 「影响」下 e./f. 年份门槛这类细则。
        push("paragraph", text, depth=2 if part == "影响" else 0)

    return blocks, ""


def parse_favorite_gifts(path: Path) -> tuple[list[dict], str]:
    """角色喜爱物品一览 → 一个角色一个大标题，下面一行是顿号分隔的物品。"""
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines[1:]:
        # 角色名是短名（中间没有顿号），下一行才是物品清单。
        if "、" in text:
            push("paragraph", text)
        else:
            group += 1
            push("section", text)

    return blocks, lines[0]


# 角色页的三个收尾小节：里面的编号条目是条件清单，不是事件，不能当事件卡/章节。
CHARACTER_TAILS = (
    "普通模式下结婚图取得条件",
    "甜蜜模式下结婚图取得条件",
    "甜蜜模式下告白相关事件触发条件",
)
# 「1-1.樱花绽放的季节（友好度上升、CG）」——尾部括号是事件的效果标记。
CHARACTER_MARK_RE = re.compile(r"（([^（）]*)）$")
# 括号里只认这三种效果词；别的（如「出去走走吧～（2）」的序号）是标题的一部分。
CHARACTER_MARKS = ("友好度上升", "好感度上升", "CG")
# 「1、唱片·雨天：进公司一月后主动赠送」——沈惟真的作品清单自带序号。
WORKS_NUMBERED_RE = re.compile(r"^\d+[、.．]")


def _split_effect_marks(title: str) -> tuple[str, dict]:
    """把标题尾部的「（友好度上升、CG）」拆成事件标记。

    括号里是这条事件的效果：CG 单独走徽标（和原站一套处理——卡片描边转玫红、
    编号反白底），剩下的（友好度上升）留作 tag。「出去走走吧～（2）」这种括号是
    标题的一部分，不是标记，不能拆。
    """
    mark = CHARACTER_MARK_RE.search(title)
    parts = [part.strip() for part in mark.group(1).split("、") if part.strip()] if mark else []
    if not parts or not all(part.upper() in CHARACTER_MARKS for part in parts):
        return title, {}
    extra: dict = {}
    if any(part.upper() == "CG" for part in parts):
        extra["cg"] = True
    rest = [part for part in parts if part.upper() != "CG"]
    if rest:
        extra["tag"] = "、".join(rest)
    return title[: mark.start()].rstrip(), extra


def parse_character(path: Path) -> tuple[list[dict], str]:
    """角色页 → 开头一段基础信息 + 可创作作品 + 事件 + 三个结局条件小节。

    8 位角色的源文本是同一套排法，所以一个解析器吃全部。四个区靠小节名切换：
    `可创作作品：` / `事件：` / 三个「…条件：」，在区外的编号行不能按编号猜
    ——「1.公司自制作品10个以上」是条件条目，`6-2.取消友好度检查…` 也不是事件。
    角色页也读 `side-event-notes.tsv`（键＝页面 slug + 事件编号），把用户补的
    说明挂到事件块上，不插块——追踪器按原始块下标存进度。
    """
    lines = _read_lines(path)
    event_notes = read_side_event_notes(SIDE_EVENT_NOTES)
    page = path.stem
    blocks: list[dict] = []
    group = 0
    zone = "info"

    def push(kind: str, text: str, **extra) -> None:
        block = {"kind": kind, "text": text, "group": group, **extra}
        if kind == "event":
            groups = event_notes.get((page, str(extra.get("label", ""))))
            if groups:
                block["eventNotes"] = groups
        blocks.append(block)

    for text in lines[1:]:
        label = text.rstrip("：:")
        if label in ("可创作作品", "事件") or label in CHARACTER_TAILS:
            zone = {"可创作作品": "works", "事件": "events"}.get(label, "tail")
            group += 1
            push("section", label)
            continue

        if zone == "info":
            # 「签约金：0万」这类短项，一行一条列表。
            push("paragraph", text, bullet=True)
            continue

        if zone == "works":
            # 源文本用 `*` 标出特殊作品（丹尼斯的「从接吻开始」要靠 CG 才解锁）。
            special = text.startswith("*")
            body = text.lstrip("*").strip()
            # 已经有「1、」这种序号的条目不再叠圆点（序号本身已是标记）。
            extra = {"special": True} if special else {}
            if not WORKS_NUMBERED_RE.match(body):
                extra["bullet"] = True
            push("paragraph", body, **extra)
            continue

        if zone == "tail":
            condition = SWEET_MODE_EVENT_RE.match(text)
            if condition:
                push("paragraph", condition.group(2).strip(), label=condition.group(1))
            else:
                push("paragraph", text)
            continue

        event = EVENT_RE.match(text)
        if event:
            group += 1
            title, extra = _split_effect_marks(_clean_title(event.group(3)))
            push("event", title, label=f"{event.group(1)}-{event.group(2)}", **extra)
            continue

        chapter = CHAPTER_RE.match(text)
        if chapter:
            group += 1
            push("heading", _clean_title(chapter.group(2)), depth=1)
            continue

        if text.startswith("提示："):
            push("note", text)
            continue

        push("paragraph", text)

    return blocks, lines[0]


# 支线页：六页三种排法，规则并在一起。
# - `#爱情陷阱` / `#豪门爱恋` 用 `#` 分章（徐世杰 / 夏以军 / 天晴）
# - `1.变身` 用编号分章（金皓薰），靠「下一行是 `1-1.`」认出来，不按行首数字瞎猜
# - 步骤 `1-1.xxx`（徐世杰 / 夏以军 / 舞台秘影 / 金皓薰 / 杜司臣）或 `（1）xxx`（天晴）
# - `条件：` / `附注：` / `附：` 自成一个小节
SIDE_CHAPTER_RE = re.compile(r"^[#＃]\s*(.+)$")
SIDE_STEP_RE = re.compile(r"^(\d+)-(\d+)[.．]?\s*(.+)$")
SIDE_PAREN_STEP_RE = re.compile(r"^（(\d+)）\s*(.+)$")
SIDE_NUMBERED_RE = re.compile(r"^(\d+)[.．]\s*(.+)$")
SIDE_SECTION_RE = re.compile(r"^(条件|附注|附)[：:]\s*(.*)$")
SIDE_BULLET_PREFIXES = ("公司结局：", "感情结局：")


def parse_side(path: Path, event_notes: dict[tuple[str, str], list[dict]] | None = None) -> tuple[list[dict], str]:
    """支线页 → 章节 + 步骤 + 条件 / 附注。

    六页排法不完全一样（见上面的常量说明），但都在「分章 → 编号步骤 → 说明行」这
    三层里，所以一个解析器吃全部。步骤做成事件卡：编号进 pill，后面跟在同一步里的
    `※` / `提示：` / 续行成为卡内的备注与细节，和角色页的事件卡是同一套。
    用户补的时间 / 概要 / 提示走 `side-event-notes.tsv`，挂在事件块上不插块。
    """
    lines = _read_lines(path)
    event_notes = event_notes if event_notes is not None else read_side_event_notes(SIDE_EVENT_NOTES)
    page = path.stem
    # 首行是页名（金皓薰 / 杜司臣 / 舞台秘影）时当标题用；其余页首行本身就是正文
    # （徐世杰 / 夏以军首行是「条件：…」，天晴首行是 `#加入志工团`）。
    head_is_title = bool(lines) and len(lines[0]) <= 8 and not re.search(r"[：:#＃（(0-9]", lines[0])
    body = lines[1:] if head_is_title else lines
    blocks: list[dict] = []
    group = 0

    def push(kind: str, text: str, **extra) -> None:
        block = {"kind": kind, "text": text, "group": group, **extra}
        if kind == "event":
            groups = event_notes.get((page, str(extra.get("label", ""))))
            if groups:
                block["eventNotes"] = groups
        blocks.append(block)

    for index, text in enumerate(body):
        chapter = SIDE_CHAPTER_RE.match(text)
        if chapter:
            group += 1
            push("section", _clean_title(chapter.group(1)))
            continue

        section = SIDE_SECTION_RE.match(text)
        if section:
            group += 1
            push("section", section.group(1))
            if section.group(2).strip():
                push("paragraph", section.group(2).strip())
            continue

        step = SIDE_STEP_RE.match(text)
        if step:
            group += 1
            title, extra = _split_effect_marks(_clean_title(step.group(3)))
            push("event", title, label=f"{step.group(1)}-{step.group(2)}", **extra)
            continue

        paren = SIDE_PAREN_STEP_RE.match(text)
        if paren:
            group += 1
            title, extra = _split_effect_marks(_clean_title(paren.group(2)))
            push("event", title, label=paren.group(1), **extra)
            continue

        numbered = SIDE_NUMBERED_RE.match(text)
        if numbered and index + 1 < len(body) and re.match(rf"^{numbered.group(1)}-1[.．]", body[index + 1]):
            # 「1.变身」下面紧跟 `1-1.`，是章；否则是正文里的序号条目。
            group += 1
            push("section", _clean_title(numbered.group(2)))
            continue

        if text.startswith(("※", "提示：")):
            push("note", text)
            continue

        if text.startswith(SIDE_BULLET_PREFIXES):
            push("paragraph", text, bullet=True)
            continue

        push("paragraph", text)

    return blocks, (lines[0] if head_is_title else "")


# 约会页：两组对话选项，下面按地点列「Q / A」。
DATE_SECTIONS = ("普通约会对话选项提示", "亲密约会对话选项提示")
DATE_QUESTION_RE = re.compile(r"^(\d+)[.．]\s*Q[：:](.+)$")
DATE_ANSWER_RE = re.compile(r"^A[：:](.+)$")


def parse_generic_list(
    path: Path, numbered_children_of: str | None = None
) -> tuple[list[dict], str]:
    """通用清单页 → 短标题开 section，其余是说明段落；注释行走金色便签。

    用于从台版手册补进来的附录页（初期攻略 / 制作人 / 称号属性 /
    约会教战总则）。这些页都是「小标题 + 条目」的平铺清单，没有事件卡，
    所以不会进入追踪器的事件下标。签约条件已并入艺人页的「加入」章节，
    不再单独成页。

    `numbered_children_of` 给某一节下面的短人名降级成带编号的子项卡片：
    约会教战总则的「艺人约会守则」是第 5 节，下面的「沈惟真」等名字原本
    和它同级，现在排成 5-1、5-2…，紧随其后的条件行留在同一张卡里。编号
    取父节的序号动态算，别人的清单页不传这个参数，行为完全不变。
    """
    # 原文用全角空格对齐人名（王　金）、全角数字写门槛（名气２００），
    # 展示时统一成半角，数值本身不变。
    lines = [
        line.replace("\u3000", "").translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        for line in _read_lines(path)
    ]
    blocks: list[dict] = []
    group = 0
    section_no = 0
    parent_no: int | None = None
    child_no = 0

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

    for text in lines[1:]:
        if text.startswith("---"):
            # 分隔线是区块边界：艺人守则到这儿结束，后面的「三大节日守则」
            # 不该继续挂 5-n 编号。
            parent_no = None
            child_no = 0
            continue
        diamond = re.match(r"^◆(.+)◆$", text)
        if diamond:
            section_no += 1
            parent_no = None
            group += 1
            push("section", diamond.group(1).strip())
            continue
        if text.startswith(("（注", "(注", "注：", "※", "【")):
            push("note", text)
            continue
        bare = text.rstrip("：: ")
        short = len(text) <= 10 and not any(
            ch in text for ch in "：:，。、；！？（）()－—~～"
        )
        # 目标节下的短人名 → 编号子项（event 块），必须在 section 判断之前拦下。
        if parent_no is not None and short:
            child_no += 1
            group += 1
            push("event", text, label=f"{parent_no}-{child_no}")
            continue
        if (text.endswith(("：", ":")) or short) and not re.match(r"^\d+[.、]", text):
            section_no += 1
            parent_no = section_no if numbered_children_of == bare else None
            child_no = 0
            group += 1
            push("section", bare)
            continue
        push("paragraph", text)

    return blocks, lines[0]


def parse_dating_guide(path: Path) -> tuple[list[dict], str]:
    """约会教战总则：艺人约会守则下的人名降为 5-1 / 5-2 … 子项。

    感情结局（结婚图取得条件）已并入本页末尾：原文与八位艺人的条件一条不删，
    只追加块，约会页原有块的顺序和下标不变。
    """
    blocks, title = parse_generic_list(path, numbered_children_of="艺人约会守则")
    romance, _ = parse_romance_endings(SOURCES / "romance-endings.txt")
    base = max((b["group"] for b in blocks), default=0)
    blocks.append({
        "kind": "section", "text": "感情结局（结婚图取得条件）", "group": base + 1,
    })
    for block in romance:
        # 感情结局自己的 group 从 0 起，整体后移，避免与约会页前面的块混组。
        block["group"] += base + 1
        blocks.append(block)
    return blocks, title


def parse_date(path: Path) -> tuple[list[dict], list[dict]]:
    """约会页 → 开头四条邀约限制 + 两组「地点 / 问题 / 回答」。

    返回 (head, body)：head 由 `_merge_date` 并进角色页的基础信息列表，body 追加到页尾。
    一个问题可能有多个都能过关的回答（咚门商店街「今天想去什么地方？」下面就有
    唱片行 / 服饰店两条 A），所以 answer 里用换行分隔，由 `qa` 块分行渲染。
    """
    lines = _read_lines(path)
    head: list[dict] = []
    body: list[dict] = []
    group = 0
    in_body = False

    for text in lines:
        # 小节名后面带不带冒号各页不一致（卫亚两份都带、姚子奇那份还是半角冒号）。
        section = text.rstrip("：: ")
        if section in DATE_SECTIONS:
            in_body = True
            group += 1
            body.append({"kind": "section", "text": section, "group": group})
            continue

        if not in_body:
            # 「开启邀约条件：…」这类门槛，和签约金 / 分红同属基础信息。
            head.append({"kind": "paragraph", "text": text, "group": 0, "bullet": True})
            continue

        question = DATE_QUESTION_RE.match(text)
        if question:
            body.append(
                {
                    "kind": "qa",
                    "text": question.group(2).strip(),
                    "label": question.group(1),
                    "group": group,
                }
            )
            continue

        answer = DATE_ANSWER_RE.match(text)
        if answer and body and body[-1]["kind"] == "qa":
            previous = body[-1]
            value = answer.group(1).strip()
            previous["answer"] = f"{previous['answer']}\n{value}" if previous.get("answer") else value
            continue

        # 「提示：…」跟在某个地点下面，讲这条对话的附加门槛（慕容和希的购物中心）。
        if text.startswith("提示："):
            body.append({"kind": "note", "text": text, "group": group})
            continue

        # 剩下的都是地点名，一个地点一组。
        group += 1
        body.append({"kind": "heading", "text": text, "depth": 1, "group": group})

    return head, body


# 「<slug>-date.txt」放该角色的约会选项，有就并进角色页。
DATE_SUFFIX = "-date.txt"


def _merge_date(slug: str, blocks: list[dict]) -> list[dict]:
    """把约会页并进角色页：邀约限制接到基础信息后面，对话选项追加到页尾。

    没有 `<slug>-date.txt` 就原样返回，所以只导入正文的角色页不受影响。
    """
    path = SOURCES / f"{slug}{DATE_SUFFIX}"
    if not path.exists():
        return blocks
    head, body = parse_date(path)
    split = 0
    while split < len(blocks) and blocks[split]["kind"] == "paragraph" and blocks[split].get("bullet"):
        split += 1
    # 追加到页尾的块要从最后一段之后重新编号，否则会和前面的块并成一组。
    offset = max((block["group"] for block in blocks), default=0) + 10
    for block in body:
        block["group"] += offset
    return [*blocks[:split], *head, *blocks[split:], *body]


MONOPOLY_QUESTION_RE = re.compile(r"^(\d+)\)\s*(.+)$")
MONOPOLY_ANSWER_RE = re.compile(r"^Ans[:：]\s*(.+)$")


def parse_monopoly(path: Path) -> tuple[list[dict], str]:
    """大富翁题库：`N) 题目` + `Ans: 答案`，N 是「第几题」组号。

    题目与组号来自甜蜜乐章 `Data/RichBa.dat`（`build_sweet_monopoly.py` 生成），
    答案沿用明星志愿3 题库；版式与主站 `build_monopoly_blocks` 完全一致：
    组号变化开一个 `第N题` section，每题一个 `qa`。
    """
    blocks: list[dict] = []
    group = 0
    number: int | None = None
    question = ""
    subtitle = ""
    for line in _read_lines(path):
        if line.startswith("★"):
            subtitle = line.lstrip("★").strip()
            continue
        ask = MONOPOLY_QUESTION_RE.match(line)
        if ask:
            current = int(ask.group(1))
            question = ask.group(2).strip()
            if current != number:
                number = current
                group += 1
                blocks.append({"kind": "section", "text": f"第{current}题", "group": group})
            continue
        ans = MONOPOLY_ANSWER_RE.match(line)
        if ans:
            blocks.append({
                "kind": "qa",
                "text": question,
                "answer": ans.group(1).strip(),
                "group": group,
            })
            continue
    return blocks, subtitle


# `sources/sweet/creations.txt` 仍留作 selfmade.json 的取得条件真源，由
# build_sweet_selfmade.py 单独读取；攻略页不再把它渲染成「艺人创作取得」模块。


def parse_artist_profiles() -> dict[str, dict]:
    """读艺人基本资料源文件，按人名返回可直接挂到节点上的资料卡。

    源文件是「人名 / 字段：值 / 合约内容（第一年签约时）：…」的平铺清单；
    这里只做结构化，文案一个字不改。输出不进 `blocks`，所以角色页的事件
    编号、CG 锚点和追踪进度都不受资料增减影响。
    """
    if not ARTIST_PROFILES.exists():
        return {}
    people: dict[str, dict] = {}
    current: dict | None = None
    contract: dict | None = None

    for raw in _read_lines(ARTIST_PROFILES)[1:]:
        text = raw.strip()
        if not text:
            continue
        if "：" not in text and ":" not in text:
            if text in people:
                raise SystemExit(f"artist-profiles.txt：重复的人名 {text!r}")
            current = {"name": text, "rows": []}
            people[text] = current
            contract = None
            continue
        if current is None:
            raise SystemExit(f"artist-profiles.txt：字段出现在人名之前：{text!r}")
        label, value = re.split(r"[：:]", text, maxsplit=1)
        label, value = label.strip(), value.strip()
        row = {"label": label, "value": value}
        if label.startswith("合约内容"):
            contract = {"title": label, "rows": []}
            current["contract"] = contract
        elif contract is not None:
            contract["rows"].append(row)
        elif label == "人物介绍":
            current["intro"] = row
        else:
            current["rows"].append(row)
    return people


# 特殊创作取得攻略已并入艺人攻略页：78 条事件在艺人页都有对应事件，只是标题
# 有简繁 / 语气词差异（惨澹→惨淡、1次→一次、做我的→做我）。归一后建立索引，
# 给艺人页命中的事件块加 `creation` 字段做高亮，不插块、不改事件下标。
CREATION_TITLE_ALIASES = {
    "专心在工作上吧": "专心在工作吧",
    "史蒂芬跟克烈斯的关系": "史蒂芬跟克烈斯的关系是",
    "唱片销售惨澹": "唱片销售惨淡",
    "仅此1次，下不为例": "仅此一次，下不为例",
    "引导他说出内心话吧": "引导他说出真心话吧",
    "不要让纪翔失望": "不要让纪翔失望喔",
    "不然你做我的男朋友": "不然你做我男朋友",
    "你这个无可救药的滥好人": "你这无可救药的滥好人",
    "你是不是喜欢他": "你不是喜欢他",
}


def _norm_event_title(text: str) -> str:
    text = re.sub(r"[（(].*?[）)]", "", text.strip())
    return re.sub(r"[\s　…．。.！!？?，,、：:；;]", "", text)


def _creation_index() -> dict[str, str]:
    """特殊创作攻略的事件标题 → 作品名（章节名去掉括号内艺人名）。"""
    index: dict[str, str] = {}
    work = ""
    for line in _read_lines(SOURCES / "special-creations.txt"):
        text = line.strip()
        group = re.match(r"^\d+[.．](?!\d)(.+)$", text)
        if group:
            works = [
                re.sub(r"[（(].*?[）)]", "", part).strip()
                for part in group.group(1).split("／")
            ]
            work = "／".join(part for part in works if part)
            continue
        event = re.match(r"^\d+-\d+[.．](.+)$", text)
        if event and work:
            key = _norm_event_title(event.group(1))
            index[key] = work
            for alias, target in CREATION_TITLE_ALIASES.items():
                if key == _norm_event_title(alias):
                    index[_norm_event_title(target)] = work
    return index


def _apply_creation_marks(node: dict, index: dict[str, str]) -> None:
    for block in node["blocks"]:
        if block["kind"] != "event":
            continue
        work = index.get(_norm_event_title(block["text"]))
        if work:
            block["creation"] = work


PARSERS = {
    "main-story": parse_main_story,
    "company": parse_company,
    "abroad-notices": parse_abroad_notices,
    "self-notices": parse_self_notices,
    "outfits": parse_outfits,
    "festivals": parse_festivals,
    "sweet-mode": parse_sweet_mode,
    "favorite-gifts": parse_favorite_gifts,
    "career-endings": parse_career_endings,
    # 感情结局已并入 dating-guide，由 parse_dating_guide 直接调用解析器。
    # 结局条件一览已并入 career-endings，由 parse_career_endings 直接调用解析器。
    "award-dates": parse_award_dates,
    # 特殊创作取得已并入艺人攻略页，事件上标 creation；不再单独成页。
    "monopoly": parse_monopoly,
    # 初期攻略已并入 main-story，由 parse_main_story 直接读取。
    # 台版手册补进来的附录页：平铺清单，无事件卡，不影响追踪器下标。
    # 签约条件已并入艺人页，独有的选项提示走 side-event-notes.tsv。
    "producers": parse_generic_list,
    "titles": parse_generic_list,
    "dating-guide": parse_dating_guide,
    "murong-yaoqi": parse_generic_list,
    "cheng-zhongxuan": parse_character,
    "danisi": parse_character,
    "ji-xiang": parse_character,
    "murong-hexi": parse_character,
    "shen-weizhen": parse_character,
    "shi-difen": parse_character,
    "wei-ya": parse_character,
    "yao-ziqi": parse_character,
    # 支线六页同一套「章节 / 编号步骤 / 条件附注」，共用一个解析器。
    "stage-shadow": parse_side,
    "tian-qing": parse_side,
    "xia-yijun": parse_side,
    "xu-shijie": parse_side,
    "du-sichen": parse_side,
    "jin-haoxun": parse_side,
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
            ("award-dates", "各类奖项颁奖日期及内容"),
            ("monopoly", "大富翁BaBaBa答案"),
            ("producers", "制作人专长与自制作品规则"),
            ("titles", "称号属性"),
            ("dating-guide", "约会教战总则"),
            ("murong-yaoqi", "慕容和希＆姚子奇（双人）"),
        ],
    },
    {
        "id": "sweet-characters",
        "title": "角色攻略",
        # 角色页目录与角色卡要在人名左侧显示圆圈头像，探测 <slug>-logo.*。
        "avatars": True,
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
        # 支线角色页同样在目录里显示圆圈头像（舞台秘影没有头像文件，不写）。
        "avatars": True,
        "children": [
            ("stage-shadow", "舞台秘影"),
            ("tian-qing", "天晴"),
            ("xia-yijun", "夏以军"),
            ("xu-shijie", "徐世杰"),
            ("du-sichen", "杜司臣"),
            ("jin-haoxun", "金皓薰"),
        ],
    },
]


def _read_cg_links() -> dict[str, list[tuple[str, str, str]]]:
    """读 ``sources/sweet/cg-links.tsv``，按节点分组返回 ``[(cgId, kind, key)]``。

    文件缺失时返回空表（映射是可选层，缺了就当没做跳转，别把整条管线卡死）。
    """
    if not CG_LINKS.exists():
        return {}
    table: dict[str, list[tuple[str, str, str]]] = {}
    for raw in CG_LINKS.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 4:
            raise SystemExit(f"cg-links.tsv 格式错误（需要 4 列）：{line!r}")
        cg_id, node_id, kind, key = (part.strip() for part in parts)
        table.setdefault(node_id, []).append((cg_id, kind, key))
    return table


def _apply_cg_links(node: dict, links: dict[str, list[tuple[str, str, str]]]) -> None:
    """把 CG 映射写到节点的事件块上：`cgIds` + `anchor`（+ 事件类补 `cg`）。

    ``anchor`` 用块下标拼成 ``ev<下标>``，和 ContentBlockList 里「没有 anchor
    就按块下标兜底」的规则完全一致，所以深链一定落在同一个 DOM 上。
    """
    for cg_id, kind, key in links.get(node["id"], []):
        for index, block in enumerate(node["blocks"]):
            if kind == "event":
                hit = block.get("kind") == "event" and block.get("label") == key
            elif kind == "text":
                hit = key in block.get("text", "")
            else:  # pragma: no cover - 手改 tsv 才会出现
                raise SystemExit(f"cg-links.tsv 未知 kind={kind!r}")
            if not hit:
                continue
            ids = block.setdefault("cgIds", [])
            if cg_id not in ids:
                ids.append(cg_id)
            block["anchor"] = f"ev{index}"
            if kind == "event":
                block["cg"] = True
            break
        else:
            raise SystemExit(f"cg-links.tsv：{node['id']} 里找不到 {kind} {key!r}（cgId={cg_id}）")


def build() -> dict:
    links = _read_cg_links()
    profiles = parse_artist_profiles()
    creation_index = _creation_index()
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
            if category.get("avatars"):
                avatar = _character_avatar(slug)
                if avatar:
                    node["avatar"] = avatar
                # 封面渲染在正文头部（ContentPanel）；探测不到就不写，绝不留空串。
                cover = _character_cover(slug)
                if cover:
                    node["cover"] = cover

            parser = PARSERS.get(slug)
            if parser is not None:
                blocks, subtitle = parser(SOURCES / f"{slug}.txt")
                node["blocks"] = _merge_date(slug, blocks)
                # 合并完再做映射：anchor 用的是最终块下标。
                _apply_cg_links(node, links)
                # 创作取得只是给已有事件加高亮字段，不插块、不动 anchor。
                _apply_creation_marks(node, creation_index)
                node["status"] = "ready"
                # 副标题只取原文首行；与页面标题重复（或原文没写）就不写，绝不自己编一句概述。
                if subtitle and subtitle != title:
                    node["description"] = subtitle
            # 艺人资料挂在页头字段里，绝不插进 blocks（事件锚点按块下标算）。
            profile = profiles.get(node["title"]) or profiles.get(PROFILE_PINNED.get(node["id"], ""))
            if profile:
                node["profile"] = profile
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
