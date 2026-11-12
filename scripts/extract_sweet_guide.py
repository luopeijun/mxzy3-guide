"""Build public/data/sweet/guide.json for 明星志愿3 甜蜜乐章.

Usage:
    python scripts/extract_sweet_guide.py

Only the Python standard library is required. 甜蜜乐章 与 明星志愿3 是两个平级
站点，数据各自一份：这里只产出 public/data/sweet/guide.json，不碰原站的
public/data/guide.json。

目录结构（类目 / 每节的标题 / 排序）写在下面的 CATEGORIES 里，正文按节放在
sources/sweet/*.txt，由 PARSERS 里登记的解析函数读入，塞进对应节点。还没有
正文的节点保留 status="missing"，页面上给出「这一页还没整理」的占位提示。

目前有八种页面形态：

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
    沈惟真：沈惟真的蓝色缎带    ← 名单行用圆点；带序号的行不用（序号本身就是标记）
    第1年-不限次数            ← 年份门槛缩进一级，挂在「约会次数要求：」下面

**结局页**（女主事业结局达成条件）

    女主事业结局达成条件      ← 首行，与页面标题同名 → 不当副标题
    天王巨星：女主角的称号…    ← 每个结局都是一个大标题（section），条件跟在下面
    巨星条件                  ← 分章（section）
    ●数值条件                 ← 小标题（heading）
    歌唱：600↑                ← 门槛数值都是普通段落

**表格页（带说明）**（结局条件一览）

    结局条件一览              ← 首行，页内不重复
    公司显示名称   知名度   公关   ← 原表头（列间用两个以上空格对齐，读入时跳过）
    1.傲视全球的演艺帝国  2500以上  150以上
    完成夏以军相关剧情……       ← 紧跟着的一行是这一个结局的条件说明

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


def parse_character(path: Path) -> tuple[list[dict], str]:
    """角色页 → 开头一段基础信息 + 可创作作品 + 事件 + 三个结局条件小节。

    8 位角色的源文本是同一套排法，所以一个解析器吃全部。四个区靠小节名切换：
    `可创作作品：` / `事件：` / 三个「…条件：」，在区外的编号行不能按编号猜
    ——「1.公司自制作品10个以上」是条件条目，`6-2.取消友好度检查…` 也不是事件。
    """
    lines = _read_lines(path)
    blocks: list[dict] = []
    group = 0
    zone = "info"

    def push(kind: str, text: str, **extra) -> None:
        blocks.append({"kind": kind, "text": text, "group": group, **extra})

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
            title = _clean_title(event.group(3))
            mark = CHARACTER_MARK_RE.search(title)
            extra: dict = {}
            parts = [part.strip() for part in mark.group(1).split("、") if part.strip()] if mark else []
            # 括号里是这条事件的效果标记。CG 单独走徽标（和原站一套处理：
            # 卡片描边转玫红、编号反白底），剩下的（友好度上升）留作 tag。
            # 「出去走走吧～（2）」这种括号是标题的一部分，不是标记，不能拆。
            if parts and all(part.upper() in CHARACTER_MARKS for part in parts):
                if any(part.upper() == "CG" for part in parts):
                    extra["cg"] = True
                rest = [part for part in parts if part.upper() != "CG"]
                if rest:
                    extra["tag"] = "、".join(rest)
                title = title[: mark.start()].rstrip()
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
    "endings": parse_endings,
    "cheng-zhongxuan": parse_character,
    "danisi": parse_character,
    "ji-xiang": parse_character,
    "murong-hexi": parse_character,
    "shen-weizhen": parse_character,
    "shi-difen": parse_character,
    "wei-ya": parse_character,
    "yao-ziqi": parse_character,
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
