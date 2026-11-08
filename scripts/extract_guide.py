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
DEFAULT_ITEMS = SOURCES / "items.txt"
DEFAULT_FAVORITES = SOURCES / "favorites.txt"
DEFAULT_EASYSHOP = SOURCES / "easyshop.txt"
DEFAULT_NOTICES = SOURCES / "notices.txt"
DEFAULT_NOTICES_INTRO = SOURCES / "notices-intro.txt"
DEFAULT_SD = SOURCES / "sd.txt"
DEFAULT_LAOBA = SOURCES / "laoba.txt"
DEFAULT_HOLLYWOOD = SOURCES / "hollywood.txt"
DEFAULT_WILL = SOURCES / "will.txt"
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
# `18 老爸死亡的时间点：` — a numbered line with no `(tag)` marker; still an event,
# so it keeps the white-card treatment like the tagged events.
EVENT_PLAIN_RE = re.compile(r"^([0-9０-９]+(?:[－\-][0-9０-９]+)?)[\.．]?\s+(.+)$")
# `（1）金父没有死` — a numbered sub-item that belongs inside the preceding event's
# card, not a sub-heading of its own.
NUMBERED_ITEM_RE = re.compile(r"^（([0-9０-９]+)）(.+)$")
# `第一次送药得到：…` — a round-dot list item (the four medicine rewards).
MEDICINE_RE = re.compile(r"^第.+?次送药得到：")
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

# Hand-written summary shown as a card above each notice page: the artist the
# notice asks for plus every prop it consumes and how to get it. Keyed by the
# same slug as SIX_NOTICES so the two stay in step.
NOTICE_REQUIREMENTS: dict[str, dict] = {
    "angel": {
        "stats": [
            {"label": "歌艺", "value": "700"},
            {"label": "名气", "value": "500"},
            {"label": "仪态", "value": "700"},
            {"label": "自信", "value": "550"},
        ],
        "cast": [
            "限**女艺人**，只会找旗下**人气最高**的那一位",
            "参加过**慈善义演**（义演邀约门槛：歌艺 300 / 仪态 300 / 人气 3）",
            "参加过**「饥饿百分百」**的第三世界行程，当时选择「答应」",
            "持有**国际音乐学院证书**",
            "**个人唱片多于 5 张**，开过**演唱会**（最好大型）",
        ],
        "items": [
            {
                "name": "天使的音乐盒",
                "steps": [
                    "旗下女艺人先参加过慈善义演，周先生才会邀她参加「饥饿百分百」，这里必须选「答应」",
                    "该艺人还要持有国际音乐学院证书、个人唱片多于 5 张，并开过演唱会（最好大型）",
                    "之后的周末她会提出把演唱会收入的 10% 捐给第三世界儿童，选择「答应」",
                    "3 天后大天使寄来感谢卡，随信附赠本道具",
                ],
            },
            {
                "name": "天使羽衣",
                "from": "集齐下面四样材料后到巴黎找老板制作，两周后领取",
                "parts": [
                    {"name": "人鱼的眼泪", "from": "综艺节目「大富翁BABABA」赢得的第二个神秘礼物"},
                    {"name": "天使的羽翼", "from": "旗下任一艺人带病前往医院就医满 10 次，欧医生赠送"},
                    {"name": "精灵的祈祷", "from": "到公园找塔罗小魔女占卜 10 次后赠送"},
                    {"name": "光丝布料", "from": "在薇薇安精品买东西超过 10 次，把音乐盒交给周映彤后再去，老板赠送"},
                ],
            },
        ],
        "note": "做出天使羽衣后，**下一档通告**就会放出本通告，若赶上团体通告需再等一轮；拿到羽衣后要在**周末排行程时**送给触发任务的女艺人。",
    },
    "eternal-love": {
        "cast": [
            "限**男艺人**，下面几条要落在同一个人身上",
            "持有**国际音乐学院证书**，**个人唱片多于 5 张**",
            "**名气 600**，并开过**大型演唱会**",
            "歌曲「万年之恋」必须由**交出歌曲的这位男艺人本人**演唱，换人成绩会很糟",
        ],
        "items": [
            {
                "name": "圣约翰的千年十字架",
                "from": "噩梦事件后一个月内前往开罗购买，要价 100 万；买回后男艺人会主动索要，逾期不买事件就直接结束",
            },
            {
                "name": "暗黑之服",
                "from": "暗阎皮布料加上下面三样材料集齐，当天自动合成",
                "parts": [
                    {"name": "暗阎皮布料", "from": "把十字架交给男艺人 3 天后，前往任一场景遇到朱莉外表的小魔女，选「为了艺人，牺牲自己吧……」，她化为本物"},
                    {"name": "魅影", "from": "综艺节目「猫狗神偷」的奖品"},
                    {"name": "魔咒", "from": "在维也纳买 10 次听课证后，教授赠送"},
                    {"name": "狐眼", "from": "打工「秀场主持」升到资深后再打工 20 次以上，且主角跟随行程时会捡到"},
                ],
            },
        ],
        "note": "暗黑之服要在周末排行程时送给**被小魔女缠住的那位男艺人**，**送错人**该艺人友好度会下降。",
    },
    "galaxy": {
        "cast": [
            "**团体通告**：旗下要有**团体**，且**推出过 3 张以上团体唱片**",
            "**第二年 6 月 1 日后**在 EAMI 认识加贺大泽，东京场景同时开启",
            "接过**「京风唱片」团体通告**，**团体名气 > 6、人气 > 5**",
            "开过**大型演唱会**，并**答应去日本当演唱会嘉宾**",
            "全体成员持有**国际舞蹈学院证书**",
            "**中途不能换人**：加贺只请去日本当嘉宾的那个团体",
        ],
        "items": [
            {
                "name": "龙尾散",
                "from": "到日本当嘉宾结束前，去东京找加贺「闲聊」3 次后赠送，可给艺人：歌艺 +50、自信 −30",
            },
        ],
        "note": "拒绝去日本当嘉宾会有 **BUG**：仍然出现「初试啼声」新闻，但加贺之后会以团队换员为由拒绝合作。",
    },
    "doomsday-warrior": {
        "stats": [
            {"label": "演技", "value": "550"},
            {"label": "名气", "value": "550"},
            {"label": "体能", "value": "500"},
            {"label": "才智", "value": "550"},
        ],
        "cast": [
            "挑电影资历够的艺人：**演过至少 1 次电影主角**、**接演电影多于 4 部**，才会大方收下剧本",
            "只演过 **2～3 部**电影的要再确认一次，**不到 2 部**或没演过主角的直接退回",
            "通过初选后要拿到**国际戏剧学院证书**，**演技低于 600** 的艺人会主动提出去进修",
            "剧本到手后按艺人要求的**天数如数安排自由活动**，决选还要**准备天数足够**",
        ],
        "items": [
            {
                "name": "初选剧本",
                "from": "事件 47：之前与史麦克交谈或拜访过，他会上门给 4 本；否则贺总只丢 2 本。3 天内必须交给符合条件的艺人",
            },
            {
                "name": "决选用剧本",
                "from": "事件 53：第三年 7 月，旗下有艺人通过初选时，大宇宙影业直接寄来",
            },
        ],
        "note": "初选已过或剧本已给过时再给一次，该艺人友好度 **−10**；3 天内没给，艺人会主动来索要，再不给友好度 **−20**。通过决选后史麦克只邀请一人，其他通过者可自行去好莱坞预约。",
    },
    "kunlun-adventure": {
        "cast": [
            "**已还清贺总欠款**，并到公园找塔罗小魔女听完六大通告那段话",
            "旗下有艺人去过**塞外观光 3 次以上**（所有艺人累计，路风、路敏不能触发）",
            "旗下要有**路风或路敏**，周末排行程时才会出现黄色选项「关于塞外的传说」",
            "旗下有艺人**出演过 5 部以上电影**、**至少演过 2 次主角**，**第三年 1 月后**剧本才寄到",
            "**证书按角色分**：男主角**戏剧 + 音乐**；女主角一**舞蹈 + 戏剧**；女主角二**舞蹈 + 音乐**",
        ],
        "items": [
            {"name": "昆仑仙境软体", "from": "旗下艺人录「益智休闲」类主持通告时，跟随第 8 次赠送，不必同一个通告，也不必同一位艺人"},
            {"name": "真虹羽纱", "from": "在巴黎买过 3 件以上女装，并买走当季女装后就能买到"},
            {"name": "九尾狐皮裳", "from": "旗下所有艺人日本旅游累计多于 9 次后，旅行社赠送"},
            {"name": "如意金箍棒", "from": "开罗有售，触发事件 68 后出现几率较高"},
        ],
        "note": "集齐四样道具、且有艺人拿到对应证书后，去全球找王瑞恩「闲聊」，**下一档通告**才会放出来；更新后要**自己去全球预约**，王导不会主动上门。",
    },
    "proud-of-the-world": {
        "stats": [
            {"label": "演技", "value": "500–550"},
            {"label": "名气", "value": "500–550"},
            {"label": "动感", "value": "450–500"},
            {"label": "体能", "value": "630–700"},
        ],
        "cast": [
            "限**男艺人**，男配角不算特殊国际通告",
            "**第一年 11 月底前**给金父送过**第二次药**，并拿到**蛮羊配方**",
            "送过**第四次药**，且陪金父过完**第二次父亲节**",
            "时间线卡得死：影友会 → 报社 → 第二年 7 月当顾问 → 11 月宣传会 → **第三年 1 月**邀约",
            "**金父必须活着**：宣传会当天要**亲自去市民音乐厅**看 CG，且需**安装资料片**",
        ],
        "items": [
            {"name": "歌曲「侠客行」", "from": "事件 76：触发事件 75 第 5 次时点选金父，姚子奇会把为金父创作的曲子送给你"},
            {"name": "剧本「握斧长龙」", "from": "事件 91：宣传会当天到市民音乐厅看到金父昏倒（CG）后拿到"},
        ],
        "note": "可以用**大侠金牌**直接接这个通告；旗下有姚子奇时要给他安排**自由活动**，没有姚子奇时 1.03 以上版本无条件触发（事件 75 本身随机，可 S/L）。",
    },
}

# Names a page already makes obvious, keyed by chapter title. `落入凡间的天使`
# is a story about 塔罗小魔女 / 大天使 handing out the quest and a detour to
# 第三世界 — tinting them on every step points at scenery, not at a decision.
NOTICE_MUTE: dict[str, tuple[str, ...]] = {
    "落入凡间的天使": ("塔罗小魔女", "第三世界", "大天使"),
    # 贺总是背景反派，银河线里只是顺带出现，不值得在正文里染色。
    "银河": ("贺总",),
    # 金父是笑傲天际当之无愧的主角，几乎每行都出现，染色只会变成满屏粉。
    "笑傲天际": ("金父",),
}

# Precise, event-scoped highlights the generic pass would otherwise miss or
# suppress. `上个事件一个月后` is rejected by _time_is_specific (no digit or
# 半/两 anchor) and `王导` is not in PERSON_WORDS, yet on this page the reader
# must see them — the timing of event 69 and the self-service rule of event 71.
# Keyed by (chapter title, event label) so a phrase that recurs later on the
# same page (event 73 also says `上个事件一个月后`) is left plain; and nothing
# leaks to other chapters, so "highlight only what matters" still holds.
NOTICE_FORCE: dict[tuple[str, str], list[tuple[str, str]]] = {
    ("昆仑历险", "69"): [(r"上个事件一个月后", "时间")],
    ("昆仑历险", "71"): [(r"（王导不会主动上门，需自己前去预约）", "条件")],
    # 笑傲天际：读者明确要钉住的几个点——送二次药的前置、第 5 次触发的门槛、
    # 隔周周日的档期、CG 过场、以及“必须触发才有后续”的硬门槛。
    ("笑傲天际", "75"): [(r"送过第二次药后", "条件")],
    ("笑傲天际", "76"): [(r"触发上个事件第5次时", "条件")],
    ("笑傲天际", "81"): [(r"隔周周日", "时间"), (r"CG", "条件")],
    ("笑傲天际", "83"): [(r"（重要事件，必须触发才有后续）", "条件")],
    ("笑傲天际", "91"): [(r"CG", "条件")],
}

# 金父事件后续里的 96 / 99 / 102 是金父病危到离世的尾声，读者要求保持纯文本、
# 不要染色（医院 / 欧医生等在这里只是叙事，不是需要记住的触发条件）。
NOTICE_SKIP: set[tuple[str, str]] = {
    ("笑傲天际", "96"),
    ("笑傲天际", "99"),
    ("笑傲天际", "102"),
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


DASH_RE = re.compile(r"-{2,}")
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


def build_easyshop_blocks(path: Path) -> list[dict]:
    """Turn the Easyshop（ES 校园代言人）txt into blocks.

    The leading `★繁体版独有` line flags the whole chain as exclusive to the
    traditional version, so it becomes the intro note. Numbered lines are
    `event` blocks whose bracket marker (`新闻`/`场景`/`手动`/`自动`) survives as
    `tag`; the indented `A …--事件10` alternatives under event 9 stay options of
    that event, and `--` reads as an arrow once tidied.
    """
    blocks: list[dict] = []
    group = 0
    for raw in [line.rstrip("\r") for line in _read_text(path).split("\n")]:
        # `事丵件` is a broken glyph in the source; it stands for `事件`.
        line = raw.replace("丵", "").strip()
        if not line:
            continue
        if line.startswith(("★", "☆")):
            group += 1
            blocks.append({
                "kind": "note", "text": _tidy(line.lstrip("★☆").strip()), "group": group,
            })
            continue
        event = EVENT_LINE_RE.match(line)
        if event:
            group += 1
            blocks.append({
                "kind": "event",
                "text": _tidy(line[event.end():].strip()),
                "label": event.group(1),
                "tag": event.group(2),
                "group": group,
            })
            continue
        if OPTION_RE.match(line):
            # Options belong to the event above them, so they share its group.
            blocks.append({"kind": "option", "text": _tidy(line), "group": group})
            continue
        group += 1
        blocks.append({"kind": "paragraph", "text": _tidy(line), "group": group})

    return blocks


SD_SECTION_RE = re.compile(r"^(恩怨|跳槽)(?:[（(](?P<note>[^）)]*)[）)])?$")


def build_sd_blocks(path: Path) -> list[dict]:
    """Turn the SD相关事件 txt into blocks.

    `★SD相关` only repeats the page title; `★提示：…` becomes the intro note.
    `恩怨` / `跳槽` open a chapter (`heading`), and the bracket text glued to
    `恩怨` is that chapter's rule line, kept as the next paragraph. Numbered
    lines are `event` blocks whose bracket marker (新闻/场景/自动/跟随) survives
    as `tag`; the `A. / B.` cases under event 7 stay options of that event, and
    `（特别注意：…）/（提示：…）` reminders stick to the event above them.
    """
    blocks: list[dict] = []
    group = 0

    def add(kind: str, text: str, **extra) -> None:
        nonlocal group
        group += 1
        blocks.append({"kind": kind, "text": _tidy(text), "group": group, **extra})

    for raw in [line.rstrip("\r") for line in _read_text(path).split("\n")]:
        line = raw.replace("丵", "").strip()
        if not line:
            continue
        if line.startswith(("★", "☆")):
            text = line.lstrip("★☆").strip()
            if text == "SD相关":
                continue
            add("note", re.sub(r"^(提示|提醒|注意)[：:]\s*", "", text))
            continue
        section = SD_SECTION_RE.match(line)
        if section:
            add("heading", section.group(1))
            if section.group("note"):
                add("paragraph", f"（{section.group('note')}）")
            continue
        event = EVENT_LINE_RE.match(line)
        if event:
            add(
                "event",
                line[event.end():].strip(),
                label=event.group(1),
                tag=event.group(2),
            )
            continue
        if OPTION_RE.match(line):
            # Options and reminders belong to the event above them: same group,
            # so they render inside that event's card.
            blocks.append({"kind": "option", "text": _tidy(line), "group": group})
            continue
        if line.startswith(("（", "(")) and re.match(
            r"^[（(](特别注意|提示|注意|提醒)", line
        ):
            blocks.append({"kind": "note", "text": _tidy(line), "group": group})
            continue
        add("paragraph", line)

    return blocks


def build_event_like_blocks(path: Path, *, page_title: str) -> list[dict]:
    """其他事件章节（老爸 / 好莱坞 / 威尔）的通用构建器。

    与六大特殊通告（build_event_blocks）同一套事件渲染：编号行 `N （tag）正文`
    拆成 `event` 块，括号里的 tag（新闻 / 场景 / 自动 / 跟随…）单独抽出成 `tag`
    字段、并从正文里剥掉，前端据此渲染成「编号徽章 + TypeTag + 白底卡片」。每个
    事件独占一个 group，各自得到一张 EventCard。`N 正文`（无 tag，如老爸的
    18/19/20）同样是事件，照样给白底卡片。

    事件之后直接跟的 `A.…` 选项或 `（N）…` 条目，归属该事件、塞进同一张卡片内，
    不会变成副标题；`第N次送药得到：…` 是圆点列表项；`★X` 是子章节大标题；
    `提醒：` 是黄色提示。页标题 `★{page_title}` 跳过，不重复成块。"""

    blocks: list[dict] = []
    group = 0
    last_event_group: int | None = None
    for raw in [line.rstrip("\r") for line in _read_text(path).split("\n")]:
        line = raw.strip()
        if not line:
            continue
        tidied = line.lstrip("★☆").strip()
        if tidied == page_title:
            continue  # 页标题，不重复成块
        event = EVENT_LINE_RE.match(line)
        if event:
            group += 1
            blocks.append({
                "kind": "event",
                "text": _tidy(line[event.end():].strip()),
                "label": event.group(1),
                "tag": event.group(2),
                "group": group,
            })
            last_event_group = group
            continue
        plain = EVENT_PLAIN_RE.match(line)
        if plain:
            group += 1
            blocks.append({
                "kind": "event",
                "text": _tidy(plain.group(2).strip()),
                "label": plain.group(1),
                "group": group,
            })
            last_event_group = group
            continue
        if OPTION_RE.match(line):
            # 事件之后的 A./B./C./D. 选项归入该事件卡片内。
            if last_event_group is not None and blocks and blocks[-1]["group"] == last_event_group:
                blocks.append({"kind": "option", "text": _tidy(line.strip()), "group": last_event_group})
            else:
                group += 1
                blocks.append({"kind": "option", "text": _tidy(line.strip()), "group": group})
            continue
        numbered = NUMBERED_ITEM_RE.match(line)
        if numbered:
            # 老爸 18/19/20 之后的 （1）（2）（3） 列表，归进事件卡片内，不作副标题。
            if last_event_group is not None and blocks and blocks[-1]["group"] == last_event_group:
                blocks.append({"kind": "paragraph", "text": tidied, "group": last_event_group})
            else:
                group += 1
                blocks.append({"kind": "paragraph", "text": tidied, "group": group})
            continue
        if MEDICINE_RE.match(line):
            # `第一次送药得到：…` 等四条奖励，渲染成圆点列表项。
            group += 1
            blocks.append({"kind": "paragraph", "text": tidied, "group": group, "bullet": True})
            continue
        if tidied.startswith(("提醒：", "（提醒")):
            group += 1
            blocks.append({"kind": "note", "text": tidied, "group": group})
            continue
        if line.startswith(("★", "☆")):
            group += 1
            blocks.append({"kind": "heading", "text": tidied, "group": group})
            continue
        group += 1
        blocks.append({**classify(line), "group": group})
    return blocks


def build_laoba_blocks(path: Path) -> list[dict]:
    return build_event_like_blocks(path, page_title="老爸相关")


def build_hollywood_blocks(path: Path) -> list[dict]:
    return build_event_like_blocks(path, page_title="好莱坞")


def build_will_blocks(path: Path) -> list[dict]:
    return build_event_like_blocks(path, page_title="威尔相关")


NOTICE_TITLE_RE = re.compile(r"^★\s*(.+)$")
# `*金父事件后续` — a section inside 笑傲天际 rather than a chapter of its own.
NOTICE_SUBTITLE_RE = re.compile(r"^\*\s*(.+)$")


# ---- Inline highlights in event copy -------------------------------------
# `{时间:…}` / `{地点:…}` / `{人物:…}` / `{选项:…}` / `{物品:…}` are decoded by
# HighlightText into tinted runs, so a reader scans a step for *when / where /
# who / which choice* without reading the sentence. The classification happens
# here, where the sentence is still whole — the UI only renders what it is told.
# plainText() strips the markers again for search and character counts.

PLACE_WORDS = (
    "EAMI", "日月光", "钜子娱乐", "钜子", "京风唱片", "SOSA", "全球", "薇薇安",
    "机场", "公园", "育幼院", "市民音乐厅", "商店街", "医院", "电视台",
    "唱片公司", "广告公司", "电影公司", "经纪公司", "酒馆", "饭店", "精品店",
    "摄影棚", "片场", "影城",
    "塞外", "长城", "开罗", "巴黎", "维也纳", "纽约", "夏威夷", "好莱坞",
    "东京", "京都", "第三世界",
)

PERSON_WORDS = (
    # 旗下艺人
    "林芬芬", "萧依莉", "桑禾蓓", "苏嫚君", "欧怡青", "路敏", "路风", "姚子奇",
    "天晴", "关古威", "陈奕夫", "纪翔", "新名纱雪", "姚子莹", "聆香", "克烈斯",
    "卫亚", "原少纬",
    # 固定 NPC
    "周映彤", "周先生", "金父", "贺总", "塔罗小魔女", "小魔女", "加贺大泽",
    "加贺", "史麦克", "王瑞恩", "大天使", "朱莉", "欧医生", "陈乐群", "张导演",
)

TIME_PATTERNS = (
    r"第[一二三四五六七八九十0-9]+年(?:[0-9]{1,2}月(?:[0-9]{1,2}日)?)?(?:后|前|内|之前|底前)?",
    r"上个事件(?:[0-9一二三四五六七八九十半]+ *个?(?:天|周|月))?(?:后(?:一?个?[天周月]内?)?|内)",
    r"事件[0-9]+(?:－[0-9]+)?(?:后|前)",
    r"(?:[0-9]+|[一二三四五六七八九十两半])(?:个)?(?:天|周|月|年|星期)(?:后|内|前)?",
    r"每(?:年|周|月|轮)(?:会)?(?:有)?(?:一次|一回)?",
    r"(?:两周|一周|半个月|一个月)(?:后|内)",
)
TIME_RE = re.compile("|".join(f"(?:{pattern})" for pattern in TIME_PATTERNS))

# Gating conditions — the numbers and prerequisites a player must *meet* before
# the step is even available (`歌艺300`, `个人唱片大于5张`, `开过演唱会`). They
# outrank the surrounding scenery: knowing you go to 第三世界 is useless if the
# artist does not qualify yet.
CONDITION_PATTERNS = (
    # stat thresholds: 歌艺700 / 人气3 / 自信550
    r"(?:歌艺|仪态|人气|名气|自信|口才|才艺|才智|体能|道德|叛逆|性感|魅力|亲和|胆识|智慧|气质|演技|动感|创作|主持|舞台|知名度|亲切度)"
    r"[ ]?[0-9]{1,4}(?:-[0-9]{1,4})?",
    # 名气大于6 / 人气大于5 — an attribute gated by 大于/超过/达到…
    r"(?:歌艺|仪态|人气|名气|自信|口才|才艺|才智|体能|道德|叛逆|性感|魅力|亲和|胆识|智慧|气质|演技|动感|创作|主持|舞台|知名度|亲切度|属性)"
    r"(?:大于|超过|达到|满|少于|低于|不小于|不低于)[0-9]+",
    # 旗下有团体 / 推出过3张或以上的团体唱片 — the galaxy gating pair
    r"旗下有团体",
    r"推出过[^，。；！？]{0,12}?团体唱片",
    # 个人唱片大于5张 / 唱片数超过5张
    r"(?:个人)?(?:唱片|专辑)[^，。；！？（）]{0,6}?(?:大于|超过|达到|满|少于|低于)[0-9]+张",
    r"(?:大于|超过|达到|满)[0-9]+(?:张|片|个|次|场)",
    # 有国际音乐学院的证书 / 舞蹈证书 — the qualifier names which certificate, so
    # the tint keeps it and drops the sentence around it.
    r"(?:国际|音乐|戏剧|舞蹈|美术|专业|相关|各类)?(?:[^，。；！？（）.的]{0,4})?的?证书",
    # 开过 / 开完大型演唱会
    r"开(?:过|完|过完)[^，。；！？]{0,8}演唱会(?:（[^）]{0,12}）)?",
    # 参加过慈善义演 / 参加过…节目
    r"参加过[^，。；！？]{0,12}?(?:义演|活动|节目|比赛|演唱会)",
    # 接过京风唱片的团体通告 — a specific prior gig as a gate
    r"有接过[^，。；！？]{0,8}?团体通告",
    # 东京找加贺“闲聊”3次后 — talk N times is a real prerequisite; keep the
    # place that precedes 找 inside the same tint so the whole step reads as one.
    r"(?:[^，。；！？]{0,4})?找[^，。；！？]{0,6}?“闲聊”[0-9]+次后?",
    # 只会邀请人气最高的女艺人
    r"只会(?:邀请|请|找)[^，。；！？（）]{0,12}",
    # 就医满10次 / 占卜10次 / 买过东西大于10次 — a count to reach, kept with the
    # verb that produces it so the tint reads as an action, not a stray number.
    r"(?:就医|看病|占卜|参加|完成|光顾|消费|买过|购买|送礼|拜访|培训|上课|"
    r"打工|探班|开出|发表|拍摄|代言|练习|投资|捐赠|捐款)"
    r"[^，。；！？（）]{0,6}?[0-9]+(?:次|张|场|个)",
    # Fallback threshold when no verb is around: 大于10次 / 满10次
    r"(?:大于|超过|达到|满|少于|低于)[0-9]+(?:次|张|场|片|个)",
)
CONDITION_RE = re.compile("|".join(f"(?:{pattern})" for pattern in CONDITION_PATTERNS))
# A time worth tinting carries a number (3 天后 / 第二年 6 月 / 事件 28 后) or a
# recurring rule (每年会有一次); a bare 上个事件后 is just list order.
TIME_DETAIL_RE = re.compile(r"[0-9]|第[一二三四五六七八九十]年|每[年月周轮]|半[月]|两[周个]|一[周月]")

# What a reader needs first. Conditions lead, then the decision, then when,
# then who / what / where — see mark_highlights() for why the page stays mostly
# un-tinted.
HIGHLIGHT_PRIORITY = ("条件", "选项", "时间", "人物", "物品", "地点")
HIGHLIGHT_LIMIT = 5
# Conditions come as a checklist (`证书 + 唱片5张 + 开过演唱会`); one tint would
# drop two thirds of them, so they get their own quota.
CONDITION_LIMIT = 4
QUOTE_RE = re.compile(r"“[^”]{1,24}”")
# Menu entries show up in quotes too (`找加贺“闲聊”`), but they are an action to
# click, not something to keep in mind — tinting them only adds noise.
MENU_QUOTES = ("闲聊", "聊天", "谈话", "打招呼")


def _highlight_spans(line: str) -> list[tuple[int, int, str]]:
    """Ranges worth tinting, never overlapping.

    When two candidates cover the same characters the more useful one wins —
    `就医满10次` beats the `医院` inside it, and a longer reading beats a shorter
    one — because a tint cannot be cut in half once it is placed.
    """
    found: list[tuple[int, int, str]] = []

    for match in TIME_RE.finditer(line):
        found.append((match.start(), match.end(), "时间"))

    for match in CONDITION_RE.finditer(line):
        found.append((match.start(), match.end(), "条件"))

    for kind, words in (("地点", PLACE_WORDS), ("人物", PERSON_WORDS)):
        for word in words:
            start = line.find(word)
            while start != -1:
                found.append((start, start + len(word), kind))
                start = line.find(word, start + 1)

    # A quoted name is a prop (`“天使羽衣”`) unless the sentence offers it as a
    # choice (`选择“答应”`) — then it is the decision itself. `点选周映彤“闲聊”`
    # is neither: 点选 is a menu action, so only 选 counts. Long quotes are news
    # headlines (`“XXX捐出演唱会收入…”`), and tinting a whole sentence would
    # drown the step it belongs to, so those stay plain.
    for match in QUOTE_RE.finditer(line):
        inner = match.group(0)[1:-1]
        if len(inner) > 12 or inner in MENU_QUOTES:
            continue
        before = line[max(0, match.start() - 6):match.start()]
        if "点选" in before:
            continue
        kind = "选项" if re.search(r"选(?:择)?\s*$", before) else "物品"
        found.append((match.start(), match.end(), kind))

    rank = {kind: position for position, kind in enumerate(HIGHLIGHT_PRIORITY)}
    ordered = sorted(found, key=lambda span: (rank[span[2]], -(span[1] - span[0]), span[0]))
    kept: list[tuple[int, int, str]] = []
    for start, end, kind in ordered:
        if any(start < other_end and other_start < end for other_start, other_end, _ in kept):
            continue
        kept.append((start, end, kind))
    return sorted(kept)


def _time_is_specific(label: str) -> bool:
    """`上个事件3天后` is a real anchor; a bare `上个事件后` only repeats the
    order of the list and is skipped, or every second line would be tinted."""
    return bool(TIME_DETAIL_RE.search(label))


def mark_highlights(
    text: str, taken: set[str] | None = None, title: str = "", mute: frozenset[str] = frozenset()
) -> str:
    """Wrap a block's most useful spans in `{kind:…}` markers.

    Tinting everything that *could* be highlighted turns a page pink and stops
    being a signal, so each block keeps at most one span per category (conditions
    up to `CONDITION_LIMIT`) and at most `HIGHLIGHT_LIMIT` spans overall, decided
    by HIGHLIGHT_PRIORITY: what you must qualify for, the decision the player has
    to make, then when, then who / what / where.

    `taken` is shared across a page: a prop or a person is tinted the first time
    it matters and stays plain afterwards (`天使羽衣` is worth a highlight when
    it is crafted, not on every later step that merely holds it). Wording that
    the page title already carries is skipped for the same reason.
    """
    taken = set() if taken is None else taken
    lines = text.split("\n")
    spans: list[tuple[int, int, int, str, str]] = []  # line, start, end, kind, label
    for index, line in enumerate(lines):
        for start, end, kind in _highlight_spans(line):
            label = line[start:end]
            if kind == "时间" and not _time_is_specific(label):
                continue
            if kind == "条件" and len(label) < 3:
                continue
            spans.append((index, start, end, kind, label))

    rank = {kind: position for position, kind in enumerate(HIGHLIGHT_PRIORITY)}
    quota = {kind: (CONDITION_LIMIT if kind == "条件" else 1) for kind in HIGHLIGHT_PRIORITY}
    used = dict.fromkeys(HIGHLIGHT_PRIORITY, 0)

    chosen: list[tuple[int, int, int, str, str]] = []
    other_used = 0
    for span in sorted(spans, key=lambda item: rank[item[3]]):
        index, start, end, kind, label = span
        if used[kind] >= quota[kind]:
            continue
        # Conditions get their own headroom (up to CONDITION_LIMIT per block); the
        # page-wide cap only throttles 选项/时间/人物/物品/地点, so a gating event
        # with several prerequisites can still keep its trigger and its timing.
        if kind != "条件" and other_used >= HIGHLIGHT_LIMIT:
            continue
        # A choice belongs to its own step, so it is never suppressed as a repeat.
        if kind != "选项":
            # Compare bare wording: the prop is quoted in the body but plain in the title.
            word = label.strip("“”‘’「」")
            if word in mute or word in taken or (title and word in title):
                continue
        used[kind] += 1
        if kind != "条件":
            other_used += 1
        chosen.append(span)
        if kind != "选项":
            taken.add(label.strip("“”‘’「」"))

    by_line: dict[int, list[tuple[int, int, str]]] = {}
    for index, start, end, kind, _label in sorted(chosen):
        by_line.setdefault(index, []).append((start, end, kind))

    out: list[str] = []
    for index, line in enumerate(lines):
        picked = by_line.get(index)
        if not picked:
            out.append(line)
            continue
        pieces: list[str] = []
        cursor = 0
        for start, end, kind in picked:
            pieces.append(line[cursor:start])
            pieces.append(f"{{{kind}:{line[start:end]}}}")
            cursor = end
        pieces.append(line[cursor:])
        out.append("".join(pieces))
    return "\n".join(out)


def _apply_forced(text: str, forced: list[tuple[str, str]]) -> str:
    """Inject page-scoped `{kind:…}` markers the generic pass does not reach.

    Runs after `mark_highlights`, so any already-wrapped span is skipped and the
    new marker is recorded so later patterns in the same block cannot overlap it.
    One match per pattern per block is enough — these are deliberate, fixed
    phrases, not a scan for every candidate.
    """
    if not forced:
        return text
    wrapped = [(m.start(), m.end()) for m in re.finditer(r"\{[^{}]*:[^{}]*\}", text)]
    for pattern, kind in forced:
        for match in re.compile(pattern).finditer(text):
            start, end = match.start(), match.end()
            if any(start < other_end and other_start < end for other_start, other_end in wrapped):
                continue
            token = f"{{{kind}:{match.group(0)}}}"
            text = text[:start] + token + text[end:]
            wrapped.append((start, start + len(token)))
            break
    return text


def annotate_highlight_blocks(
    blocks: list[dict], title: str = "", mute: tuple[str, ...] = ()
) -> None:
    """Add highlights to prose blocks; headings and sections stay plain.

    One `taken` set per page, so a repeated prop or name is only tinted once,
    and one `mute` list for names the page itself makes obvious. `NOTICE_FORCE`
    then pins a few phrases the generic rules miss on this specific page.
    """
    taken: set[str] = set()
    muted = frozenset(mute)
    for block in blocks:
        if (title, str(block.get("label", ""))) in NOTICE_SKIP:
            continue
        if block["kind"] in {"event", "paragraph", "note", "option"}:
            text = mark_highlights(block["text"], taken, title, muted)
            forced = NOTICE_FORCE.get((title, str(block.get("label", ""))), [])
            block["text"] = _apply_forced(text, forced)


def _split_preamble(line: str) -> tuple[str, str]:
    """`落入凡间的天使（不需要和塔罗小魔女交谈就能触发）` -> (title, note)."""
    match = PREAMBLE_RE.match(line)
    if not match:
        return line.strip(), ""
    return match.group("title").strip(), match.group("note").strip()


# The txt runs material lists inline (`…神秘礼物。B.天使的羽翼——…`), but each
# letter is its own entry. Break before a marker that follows a sentence end; a
# marker already at the start of a line keeps its place.
NOTE_LETTER_RE = re.compile(r"(?<=[。；）】])(?=[A-Z][．.])")


def _split_letter_items(text: str) -> str:
    """One line per `A.` / `B.` entry inside a note."""
    return NOTE_LETTER_RE.sub("\n", text)


def build_notice_pages(path: Path) -> list[dict]:
    """Split 六大特殊通告.txt into one page per `★` chapter.

    A `★<标题>（补充说明）` line opens a chapter and its bracket text becomes the
    note at the top of that page; `*金父事件后续` is a section within 笑傲天际.
    Numbered lines are `event` blocks (the `（自动）/（场景）/（新闻）` marker
    survives as `tag`), and `提醒：` opens a yellow note whose following lines
    stay inside it — that is how the material lists (`A.…B.…`) keep their
    line breaks instead of scattering into a dozen paragraphs.
    """
    pages: list[dict] = []
    blocks: list[dict] = []
    group = 0
    pending_note = False

    def add(kind: str, text: str, **extra) -> None:
        nonlocal group
        group += 1
        blocks.append({"kind": kind, "text": _tidy(text), "group": group, **extra})

    for raw in [line.rstrip("\r") for line in _read_text(path).split("\n")]:
        line = raw.strip()
        if not line:
            continue
        chapter = NOTICE_TITLE_RE.match(line)
        if chapter:
            title, note = _split_preamble(chapter.group(1))
            blocks = []
            group = 0
            pending_note = False
            pages.append({"title": title, "note": note, "blocks": blocks})
            if note:
                add("note", note)
            continue
        if not pages:
            continue
        subtitle = NOTICE_SUBTITLE_RE.match(line)
        if subtitle:
            add("section", subtitle.group(1))
            pending_note = False
            continue
        if line.startswith(("提醒", "注意", "提示")):
            # Kept in the group of the event above, so the caveat rides along
            # with the step it belongs to (same as 初始事件).
            blocks.append({
                "kind": "note",
                "text": _tidy(re.sub(r"^(提醒|注意|提示)[：:]?\s*", "", line)),
                "group": group,
            })
            pending_note = True
            continue
        event = EVENT_LINE_RE.match(line)
        if event:
            add("event", line[event.end():].strip(), label=event.group(1), tag=event.group(2))
            pending_note = False
            continue
        if pending_note:
            blocks[-1]["text"] += "\n" + _tidy(line)
            continue
        if OPTION_RE.match(line):
            # Choices (`A.…`) stay in the group of the event that offers them.
            blocks.append({"kind": "option", "text": _tidy(line), "group": group})
            continue
        if line.startswith("（"):
            # `（有BUG：…）` is a remark on the event above, not a step of its own.
            blocks.append({"kind": "note", "text": _tidy(line.strip("（）")), "group": group})
            continue
        add("paragraph", line)

    for page in pages:
        for block in page["blocks"]:
            if block["kind"] == "note":
                block["text"] = _split_letter_items(block["text"])
        annotate_highlight_blocks(
            page["blocks"], page["title"], NOTICE_MUTE.get(page["title"], ())
        )
    return pages


def build_notice_intro_blocks(path: Path) -> list[dict]:
    """Turn 六大特殊国际通告.txt into the category page's own content.

    The first line repeats the chapter title, which the page header already
    shows, so it is skipped. `条件：已还清贺总欠款` reads as a `项目：内容` entry
    and gets the usual bullet dot; `提醒：` opens a yellow note and the
    `（1）…（6）` mapping under it stays inside that note, one light per line.
    """
    blocks: list[dict] = []
    group = 0
    pending_note = False
    seen_title = False

    for raw in [line.rstrip("\r") for line in _read_text(path).split("\n")]:
        line = raw.strip()
        if not line:
            continue
        if not seen_title:
            seen_title = True
            continue
        if line.startswith(("提醒", "注意", "提示")):
            group += 1
            blocks.append({
                "kind": "note",
                "text": _tidy(re.sub(r"^(提醒|注意|提示)[：:]?\s*", "", line)),
                "group": group,
            })
            pending_note = True
            continue
        if pending_note:
            blocks[-1]["text"] += "\n" + _tidy(line)
            continue
        group += 1
        is_item = not line.endswith(("：", ":")) and _item_prefix(line) is not None
        blocks.append({
            "kind": "paragraph",
            "text": _tidy(line),
            "group": group,
            **({"bullet": True} if is_item else {}),
        })

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
    requirements: dict | None = None,
    status: str = "ready",
) -> dict:
    node: dict = {"id": node_id, "title": title, "status": status}
    if aliases:
        node["aliases"] = aliases
    if source_title:
        node["sourceTitle"] = source_title
    if description:
        node["description"] = description
    if requirements:
        node["requirements"] = requirements
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

    Every scene is a child of the group above it, so its heading carries
    `depth=1` and the outline numbers it 1.1, 1.2 … instead of flattening it
    level with 国内场景 / 国外场景.
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
            blocks.append({"kind": "heading", "text": _tidy(name.strip()), "depth": 1, "group": group})
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
            blocks.append({"kind": "heading", "text": _tidy(line), "depth": 1, "group": group})
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
    / `提醒：` lines plus their continuation become a yellow note.

    Everything else follows the same list convention as 制作人相关: a
    flush-left `项目：内容` line (`唱片助理：（新手）…`, `音乐学院（维也纳）：…`)
    is a bulleted entry, and the lines underneath it — the source-indented
    `（资深）…` continuation, for instance — are its indented details.
    """
    # `\r\r\n` endings would leave an empty line after every row.
    raw_lines = [line.rstrip("\r") for line in _read_text(path).split("\n")]
    blocks: list[dict] = []
    group = 0
    # Nesting level for the lines below the current entry; 0 means "no entry".
    detail_depth = 0
    pending_note = False
    seen_title = False

    def add(kind: str, text: str, **extra) -> None:
        nonlocal group
        group += 1
        blocks.append({"kind": kind, "text": _tidy(text), "group": group, **extra})

    for raw in raw_lines:
        line = raw.strip()
        if not line:
            continue
        if not seen_title:
            seen_title = True
            if line.startswith(("★", "☆")):
                continue
        if line.startswith(("提示", "提醒")):
            add("note", re.sub(r"^(提示|提醒)[：:]?\s*", "", line))
            detail_depth = 0
            pending_note = True
            continue
        if pending_note:
            if (line.endswith(("：", ":")) and len(line) <= 16) or _is_item_line(line):
                pending_note = False
            else:
                blocks[-1]["text"] += "\n" + _tidy(line)
                continue
        if line.endswith(("：", ":")) and len(line) <= 16:
            add("heading", line.rstrip("："))
            detail_depth = 0
            continue
        if REFERENCE_SUBTITLE_RE.match(line):
            add("heading", line)
            detail_depth = 0
            continue
        if line.endswith(("：", ":")):
            # A longer lead-in sentence (`升级的条件：…升级范围如下：`).
            add("paragraph", line)
            detail_depth = 0
            continue

        indent = len(raw) - len(raw.lstrip())
        if indent == 0 and _is_item_line(line):
            add("paragraph", line, bullet=True)
            # Details step past the bulleted label, not level with it.
            detail_depth = 2
            continue
        if indent == 0 and ("：" in line or ":" in line):
            # Flush-left prose carrying a colon (`其他课程数值均为：…`) is a
            # sentence, not a detail row of the entry above it.
            add("paragraph", line)
            detail_depth = 0
            continue
        if detail_depth or indent > 0:
            add("paragraph", line, depth=detail_depth or 1)
            continue
        add("paragraph", line)

    return blocks


ITEM_PREFIX_MAX = 10  # `音乐学院（维也纳）` is the longest real label in the sources
# A label names a thing; a sentence before the colon leans on these words
# (`打工有两个档次：…`, `其他课程数值均为：…`), so it stays prose.
ITEM_PROSE_RE = re.compile(r"[个是为会但则即指若如]")


def _item_prefix(line: str) -> str | None:
    """Text before the first colon when the line reads as `项目：内容`.

    Reference pages list things as `<label>：<content>` (`林永育：`,
    `唱片助理：（新手）歌艺+2…`, `音乐学院（维也纳）： 音感发生（专业）…`), while a
    running sentence that merely contains a colon is much longer
    (`周映彤与小熊的友好度增加的方法：`), so a length cap separates the two.
    """
    match = re.match(r"^([^：:]+)[：:]", line)
    if not match:
        return None
    prefix = match.group(1).strip()
    if not prefix or len(prefix) > ITEM_PREFIX_MAX:
        return None
    return prefix


def _is_item_line(line: str) -> bool:
    """A flush-left `项目：内容` line — a list entry, not a lead-in sentence.

    Lines that end with the colon (`升级的条件：训练有4个档次…如下：`) introduce
    what follows instead of being an entry of their own, and a sentence whose
    subject before the colon is a clause rather than a name is prose.
    """
    if line.endswith(("：", ":")):
        return False
    prefix = _item_prefix(line)
    return prefix is not None and not ITEM_PROSE_RE.search(prefix)


def build_producers_blocks(path: Path) -> list[dict]:
    """Turn the 制作人相关 txt into blocks.

    A second `★` marks a major section (`制作人放水情况`, hairline above);
    `☆ …：` marks a diamond sub-heading (唱片 / 电视剧 / 电影 制作人选择),
    `注意：` becomes a yellow note.

    Everything else is a list: a flush-left line that reads as `项目：内容`
    (`林永育：`, `小熊：日月光音乐负责人`, `爱情偶像剧：陈淑敏（最强）`) opens a
    bulleted item, and the lines that follow it — the `擅长类型－…` /
    `出现条件－…` attributes, or the source-indented `戏剧：…` follow-ups under
    `sosa：` — become its indented details. A run of names therefore reads as
    separate entries instead of one wall of text.
    """
    # The source mixes `\r\r\n` endings, which `splitlines()` would read as an
    # extra blank line after every row and break the items apart.
    raw_lines = [line.rstrip("\r") for line in _read_text(path).split("\n")]

    blocks: list[dict] = []
    group = 0
    # Nesting level for the lines below the current item; 0 means "no item".
    detail_depth = 0

    def add(kind: str, text: str, **extra) -> None:
        nonlocal group
        group += 1
        blocks.append({"kind": kind, "text": _tidy(text), "group": group, **extra})

    for index, line in enumerate(raw_lines):
        text = line.strip()
        if not text:
            continue
        if index == 0 and text.startswith("★"):
            # The opening `★制作人选择` is the page title, already shown above.
            continue
        if text.startswith("★"):
            add("section", text.lstrip("★").strip(), depth=0)
            detail_depth = 0
            continue
        if text.startswith("☆"):
            add("heading", text.lstrip("☆").rstrip("：").strip())
            detail_depth = 0
            continue
        if text.startswith(("提示", "提醒", "注意")):
            add("note", re.sub(r"^(提示|提醒|注意)[：:]?\s*", "", text))
            detail_depth = 0
            continue

        indent = len(line) - len(line.lstrip())
        prefix = _item_prefix(text) if indent == 0 else None
        if prefix:
            label = text[:-1].strip() if text.endswith(("：", ":")) else text
            add("paragraph", label, bullet=True)
            # Details step past the bulleted name, not level with it.
            detail_depth = 2
            continue
        if indent == 0 and text.endswith(("：", ":")):
            # A lead-in sentence (`周映彤与小熊的友好度增加的方法：`) keeps the
            # lines beneath it indented, without a dot of its own.
            add("paragraph", text)
            detail_depth = 1
            continue
        if detail_depth or indent > 0:
            add("paragraph", text, depth=detail_depth or 1)
            continue
        add("paragraph", text)

    return blocks


def build_selfmade_blocks(path: Path) -> list[dict]:
    """Turn the 自制通告创作条件一览 txt into blocks.

    The opening `★当公司资金…。` is the page's only lead-in paragraph (it ends
    with a full stop, so it is not a section divider). The two `★歌曲部分…` /
    `★剧本部分…` lines (no full stop) are major sections, each with a hairline
    above it. Under each section a bare character name (`林芬芬`, `其他`) or a
    name with an annotation (`纪翔（…）`) is a diamond sub-heading nested under
    that section (outline reads 1.1, 1.2 …), and every song line carrying the
    `－` separator (`歌名－条件`) is one bulleted entry of that name.
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
            # One dot per song/script: the entries under a name are a list.
            blocks.append({"kind": "paragraph", "text": _tidy(line), "bullet": True, "group": group})
            continue
        group += 1
        # A character name nests under the section above it (outline 1.1, 1.2 …).
        blocks.append({"kind": "heading", "text": _tidy(line), "depth": 1, "group": group})
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

    The six fame-level titles at the top (未出道的新人 … 得奖) belong to no route
    in the source. They get a `基本称号` section of their own so every title can
    nest one level down (outline 1.1, 1.2 …) instead of reading level with the
    routes.
    """
    lines = [raw.strip() for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0
    has_section = False

    def add(kind: str, text: str, **extra) -> None:
        nonlocal group
        group += 1
        blocks.append({"kind": kind, "text": _tidy(text), "group": group, **extra})

    for line in lines:
        if line.endswith("--"):
            add("section", line.rstrip("-").strip(), depth=0)
            has_section = True
            continue
        if line.startswith("若同时满足"):
            add("section", "称号显示优先级", depth=0)
            add("paragraph", line)
            has_section = True
            continue
        if TITLE_NOTE_RE.match(line):
            add("note", TITLE_NOTE_RE.sub("", line))
            continue
        if not line.endswith(("：", ":")):
            pair = TITLE_PAIR_RE.match(line)
            if pair:
                if not has_section:
                    add("section", "基本称号", depth=0)
                    has_section = True
                add("heading", pair.group(1).strip(), depth=1)
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


ITEM_SECTION_RE = re.compile(r"^[^：:\s]{2,20}篇$")
ITEM_FIELD_RE = re.compile(r"^(简介|功用|共用|入手地点|入手方式|售价)\s*[：:]\s*(.*)$")
ITEM_NOTE_RE = re.compile(r"^[＊*]\s*")


def build_items_blocks(path: Path) -> list[dict]:
    """Turn the 物品总览 txt into a catalogue of item cards.

    Every `xx篇` line (特殊道具篇 / 日常道具－薇薇安篇 / 生日礼物篇 …) opens a
    section. Inside a section a bare short line is an item name, and the
    `简介：` / `功用：` / `入手地点：` lines under it become its labelled rows;
    a `＊…` line is a note attached to that item. The source's `共用：` typo is
    folded into `功用`.
    """
    lines = [_tidy(raw.strip()) for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0
    item: dict | None = None

    def flush() -> None:
        nonlocal item
        if item is None:
            return
        if not item["notes"]:
            del item["notes"]
        blocks.append(item)
        item = None

    for line in lines:
        if ITEM_SECTION_RE.match(line):
            flush()
            group += 1
            blocks.append({"kind": "section", "text": line, "depth": 0, "group": group})
            continue
        field = ITEM_FIELD_RE.match(line)
        if field:
            if item is not None:
                value = field.group(2).strip()
                if value:
                    label = "功用" if field.group(1) == "共用" else field.group(1)
                    item["rows"].append({"label": label, "value": value})
            continue
        note = ITEM_NOTE_RE.match(line)
        if note:
            text = line[note.end():].strip()
            if item is not None and text:
                item["notes"].append(text)
            continue
        flush()
        group += 1
        item = {"kind": "item", "text": line, "rows": [], "notes": [], "group": group}
    flush()
    return blocks


FAVORITE_TIER_RE = re.compile(r"[（(]\s*[＋+]\s*([0-9０-９]+)\s*[）)]")
GIFT_GAIN_RE = re.compile(r"(?:→|->)?\s*好感度\s*[＋+]\s*([0-9０-９]+)\s*[」』]?\s*$")
FAVORITE_RULE_RE = re.compile(r"^([0-9０-９]+)\s*[.．、]\s*(.+)$")


def _tier_rows(line: str) -> list[dict]:
    """`A、B（＋4）C（＋3）` -> one row per bonus, holding the items before it."""
    rows: list[dict] = []
    last = 0
    for match in FAVORITE_TIER_RE.finditer(line):
        chunk = line[last:match.start()].strip("、， ")
        if chunk:
            rows.append({"label": f"＋{int(match.group(1))}", "value": chunk})
        last = match.end()
    rest = line[last:].strip("、， ")
    if rest:
        rows.append({"label": "其他", "value": rest})
    return rows


def build_favorites_blocks(path: Path) -> list[dict]:
    """Turn the 艺人喜爱物品一览 txt into per-artist cards.

    Part one lists each artist's favourite gifts, where the `（＋4）` / `（＋3）`
    markers group the items in front of them into one row per bonus.
    `送礼后好感度对比` repeats that per artist as one row per quote
    (`「…」→ 好感度＋5`), and the closing `其他--` block holds the general
    gifting mechanics, kept as numbered paragraphs.
    """
    lines = [_tidy(raw.strip()) for raw in _read_text(path).splitlines() if raw.strip()]
    blocks: list[dict] = []
    group = 0
    mode = "favourites"
    card: dict | None = None

    def open_card(title: str) -> None:
        nonlocal group, card
        group += 1
        card = {"kind": "item", "text": title, "rows": [], "group": group}
        blocks.append(card)

    def open_section(title: str) -> None:
        nonlocal group, card
        group += 1
        card = None
        blocks.append({"kind": "section", "text": title, "depth": 0, "group": group})

    open_section("各艺人喜爱物品")

    for line in lines:
        if line == "艺人喜爱物品一览":
            continue
        if line.startswith("送礼后好感度对比"):
            open_section("送礼后好感度对比")
            mode = "gift"
            continue
        if line.startswith("其他"):
            open_section("好感度机制补充")
            mode = "rules"
            continue
        if mode == "rules":
            rule = FAVORITE_RULE_RE.match(line)
            group += 1
            text = f"{int(rule.group(1))}. {rule.group(2).strip()}" if rule else line
            blocks.append({"kind": "paragraph", "text": text, "group": group})
            continue
        if mode == "gift":
            if line.startswith("「"):
                if card is not None:
                    gain = GIFT_GAIN_RE.search(line)
                    card["rows"].append({
                        "label": f"＋{int(gain.group(1))}" if gain else "－",
                        "value": line[:gain.start()].strip() if gain else line,
                    })
                continue
            open_card(line)
            continue
        # Favourites: an artist name line, then the items with their bonus tiers.
        if "、" in line or FAVORITE_TIER_RE.search(line):
            if card is not None:
                card["rows"].extend(_tier_rows(line))
            continue
        open_card(line)
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
    items: Path,
    favorites: Path,
    easyshop: Path,
    notices: Path,
    notices_intro: Path,
    sd_events: Path,
    laoba_events: Path,
    hollywood_events: Path,
    will_events: Path,
) -> dict:
    rows = read_paragraphs(docx)
    sections = Sections(rows)
    event_blocks = build_event_blocks(events)
    stats_blocks = build_stats_blocks(stats)

    required = [
        "角色攻略", "初始问题选项",
        "接手第一周细节", "小秘书相关事件（不涉艺人）",
        "蛮羊事件：", "美丽之星事件", "演艺圈前辈事件",
        "六大传说级通告（99%获奖）",
    ]
    missing = [title for title in required if title not in sections.index]
    if missing:
        raise ValueError(f"document structure changed, missing chapters: {missing}")

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
        make_node(
            "game-guide/items", "物品总览",
            source_title="物品总览.txt",
            description="特殊道具、国际通告材料、角色剧情道具、开局道具、各地日常商品与生日礼物：简介、功用与入手方式。",
            blocks=build_items_blocks(items),
        ),
        make_node(
            "game-guide/favorite-items", "艺人喜爱物品一览",
            source_title="艺人喜爱物品一览.txt",
            description="各艺人喜爱的礼物，标签（＋3／＋4）是该礼物带来的好感加成；后半是送礼后每句反应对应的好感度，末尾为送礼机制补充。",
            blocks=build_favorites_blocks(favorites),
        ),
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
    # The txt carries the six chapters verbatim, `★标题（补充说明）` per page.
    notice_pages = {page["title"]: page for page in build_notice_pages(notices)}
    notice_items = []
    for title, slug in SIX_NOTICES:
        page = notice_pages.pop(title, None)
        if page is None:
            raise ValueError(f"notice chapter missing from notices.txt: {title}")
        notice_items.append(make_node(
            f"notices/{slug}", page["title"],
            blocks=page["blocks"],
            requirements=NOTICE_REQUIREMENTS.get(slug),
        ))
    if notice_pages:
        raise ValueError(f"unmapped notice chapters: {sorted(notice_pages)}")

    notice_intro = build_notice_intro_blocks(notices_intro)

    # ---- 其他事件 ----
    other_items = [
        make_node(
            "other-events/easyshop", "Easyshop事件",
            blocks=build_easyshop_blocks(easyshop),
        ),
        make_node(
            "other-events/golden-father", "老爸相关事件",
            source_title="老爸相关事件.txt",
            blocks=build_laoba_blocks(laoba_events),
        ),
        make_node(
            "other-events/will", "威尔相关事件",
            source_title="威尔相关事件.txt",
            blocks=build_will_blocks(will_events),
        ),
        make_node(
            "other-events/manyang", "蛮羊事件",
            blocks=build_blocks(sections.intro("蛮羊事件：")),
        ),
        make_node(
            "other-events/hollywood", "好莱坞相关",
            source_title="好莱坞相关.txt",
            blocks=build_hollywood_blocks(hollywood_events),
        ),
        make_node(
            "other-events/sd", "SD相关事件",
            source_title="SD相关事件.txt",
            blocks=build_sd_blocks(sd_events),
        ),
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
            blocks=notice_intro,
            children=notice_items,
        ),
        make_node(
            "other-events", "其他事件",
            source_title="其他事件相关攻略",
            description="Easyshop、金父、威尔、SD、小秘书等支线事件整理。",
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
    items_src = Path(sys.argv[14]) if len(sys.argv) > 14 else DEFAULT_ITEMS
    favorites = Path(sys.argv[15]) if len(sys.argv) > 15 else DEFAULT_FAVORITES
    easyshop = Path(sys.argv[16]) if len(sys.argv) > 16 else DEFAULT_EASYSHOP
    notices = Path(sys.argv[17]) if len(sys.argv) > 17 else DEFAULT_NOTICES
    notices_intro = Path(sys.argv[18]) if len(sys.argv) > 18 else DEFAULT_NOTICES_INTRO
    sd_events = Path(sys.argv[19]) if len(sys.argv) > 19 else DEFAULT_SD
    laoba_events = Path(sys.argv[20]) if len(sys.argv) > 20 else DEFAULT_LAOBA
    hollywood_events = Path(sys.argv[21]) if len(sys.argv) > 21 else DEFAULT_HOLLYWOOD
    will_events = Path(sys.argv[22]) if len(sys.argv) > 22 else DEFAULT_WILL
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
    if not items_src.exists():
        raise SystemExit(f"items txt not found: {items_src}")
    if not favorites.exists():
        raise SystemExit(f"favorites txt not found: {favorites}")
    if not easyshop.exists():
        raise SystemExit(f"easyshop txt not found: {easyshop}")
    if not notices.exists():
        raise SystemExit(f"notices txt not found: {notices}")
    if not notices_intro.exists():
        raise SystemExit(f"notices intro txt not found: {notices_intro}")
    if not sd_events.exists():
        raise SystemExit(f"sd events txt not found: {sd_events}")
    if not laoba_events.exists():
        raise SystemExit(f"laoba events txt not found: {laoba_events}")
    if not hollywood_events.exists():
        raise SystemExit(f"hollywood events txt not found: {hollywood_events}")
    if not will_events.exists():
        raise SystemExit(f"will events txt not found: {will_events}")
    data = build(docx, questions, events, stats, scenes, work, training, certificates,
                 producers, selfmade, titles, monopoly, endings, items_src, favorites,
                 easyshop, notices, notices_intro, sd_events, laoba_events,
                 hollywood_events, will_events)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"written: {OUTPUT}")
    print(json.dumps(data["meta"]["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
