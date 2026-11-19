#!/usr/bin/env python
"""Bake the static notice tables of the Traditional Chinese 3-in-1 game into
public/data/case-tables.json.

The save file (*.sa2) only carries the rolled thresholds of the current
playthrough. Names, notice types, ability grades and difficulty ranges come
from the game's data directory. We ship a compact JSON of those tables so the
reader tab needs nothing but the save file the player uploads.

Usage:
    python scripts/build_case_tables.py [--data <game data dir>]
"""

import argparse
import csv
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = r"D:\Program Files (x86)\dayuzixun\mxzy3\tw"
# 三合一装了两套数据目录：data（2005-2006 初版）与 data1（2007 更新版）。
# 自制通告（CaseCreate 里那批 CD6xx / CD7xx、TV7xx）只有 data1 有名字，
# 所以 data1 优先，data 只用来补 data1 留空的字段（CD274 就缺子类）。
DATA_SUBDIRS = ("data1", "data")
OUT = os.path.join(ROOT, "public", "data", "case-tables.json")
# 通告长度表的真源（玩家整理的简体表）。舞台剧 / 时装秀是甜蜜乐章的内容，
# 繁中三合一装的 Length.tab 里没有这两条，所以只有这份表能覆盖全。
LENGTH_CSV = os.path.join(ROOT, "sources", "notices", "notice-length.csv")
CASE_FILES = ("CDCase.dat", "CFCase.dat", "MVCase.dat", "TVCase.dat", "SHCase.dat",
              "FSCase.dat", "THCase.dat", "SpecialCase.dat")
# 通告记录里出品公司的起点；名字 10、类型 50、子类 70 各表一致。
# 不在这里的表（SpecialCase）结构不同，仍按文本段序号取。
NOTICE_FIELDS = {
    "CDCase.dat": 116, "SHCase.dat": 116,
    "CFCase.dat": 108, "MVCase.dat": 108, "TVCase.dat": 108,
}
CODE_RE = re.compile(r"[0-9A-Z]{3}")


def big5(buf):
    return buf.strip(b"\x00").decode("big5", "replace")


def read_table(path):
    """Static tables: 12-byte header (magic, count, record size) + fixed records."""
    with open(path, "rb") as f:
        raw = f.read()
    magic, count, size = struct.unpack_from("<III", raw, 0)
    if magic not in (0x3F2, 0x3E8):
        raise ValueError("unexpected table magic %#x in %s" % (magic, path))
    return [raw[12 + i * size:12 + (i + 1) * size] for i in range(count)]


def text_segments(rec, limit=6):
    """The leading NUL-terminated Big5 strings of a table record."""
    parts = [m.group().decode("big5", "replace")
             for m in list(re.finditer(rb"[^\x00]{2,}", rec))[:limit]]
    parts += [""] * (limit - len(parts))
    return parts


def load_cases(data_dirs):
    """Notice code -> [name, type, subtype, company].

    The long plot description is left out: the reader tab is about the rolled
    numbers, and dropping it keeps the bundled JSON small. The 通告 tab already
    carries the full static notice details.

    字段是定长切片，不按文本段序号取：有些记录（CD274）子类留空，按段序号
    会整体错位，把出品公司读成剧情描述。各表只有出品公司起点不同（唱片 /
    主持 116，电视 / 电影 / 广告 108），名字 10、类型 50、子类 70 一致。
    """
    out = {}
    for data_dir in data_dirs:
        for filename in CASE_FILES:
            path = os.path.join(data_dir, filename)
            if not os.path.isfile(path):
                continue
            company_at = NOTICE_FIELDS.get(filename)
            for rec in read_table(path):
                code = rec[:5].decode("ascii", "replace")
                if len(code) != 5 or not code[:2].isalpha() or not CODE_RE.fullmatch(code[2:]):
                    continue
                if company_at is None:
                    row = text_segments(rec)[1:5]
                else:
                    row = [
                        big5(rec[10:50].split(b"\x00")[0]),
                        big5(rec[50:70].split(b"\x00")[0]),
                        big5(rec[70:company_at].split(b"\x00")[0]),
                        big5(rec[company_at:company_at + 30].split(b"\x00")[0]),
                    ]
                previous = out.get(code)
                # data1 在前：先到的值优先，后到的只补空字段。
                out[code] = row if previous is None else [a or b for a, b in zip(previous, row)]
    return out


def load_need_effect(data_dir):
    """(notice type, role) -> nine ability grades (0=none, 1=A, 2=B, 3=C, 4=D)."""
    records = read_table(os.path.join(data_dir, "NeedEffect.tab"))
    out = {}
    for rec in records:
        kind = big5(rec[4:24])
        role = big5(rec[24:44])
        if not kind or not role:
            continue
        grades = [struct.unpack_from("<I", rec, 44 + 4 * j)[0] for j in range(9)]
        out[kind + "|" + role] = grades
    return out


# 长度表里的简体写法 -> 游戏数据/存档里的繁体写法（存档里读到的是 Big5 繁体）。
LENGTH_TRAD = {
    "连续剧": "連續劇", "单元剧": "單元劇", "短片": "短片", "电影": "電影",
    "唱片": "唱片", "广告": "廣告", "知性谈话": "知性談話", "运动竞赛": "運動競賽",
    "歌舞综艺": "歌舞綜藝", "采访报导": "採訪報導", "益智休闲": "益智休閒",
    "舞台剧": "舞台劇", "时装秀": "時裝秀",
    "男主角": "男主角", "女主角": "女主角", "男配角": "男配角", "女配角": "女配角",
    "个人": "個人", "团体": "團體", "原声带": "原聲帶", "男性": "男性", "女性": "女性",
    "主持人": "主持人", "助理主持": "助理主持", "外景主持": "外景主持",
}


def load_length_tab(data_dir):
    """Length.tab 的原样读数，只用来核对 CSV 没写错。

    Length.tab: 4-byte id, the kind and role Big5 strings packed into bytes
    4..24, then three ints at 24 / 28 / 32. The last one is 工作天數 (唱片 25 天、
    電影 40 天), the middle one is 每週可排上限 (5 天，主持类 2~3 天)。
    """
    path = os.path.join(data_dir, "Length.tab")
    if not os.path.isfile(path):
        return {}
    out = {}
    for rec in read_table(path):
        parts = [m.group().decode("big5", "replace")
                 for m in re.finditer(rb"[^\x00]+", rec[4:24])]
        if len(parts) < 2:
            continue
        _x, per_week, days = struct.unpack_from("<III", rec, 24)
        if not days or not per_week:
            continue
        out[parts[0] + "|" + parts[1]] = [days, per_week]
    return out


def load_length(data_dir):
    """`notice kind|role` -> [工作天数, 每週上限]，真源是 sources/notices/notice-length.csv。

    玩家的表用简体写（连续剧 / 男主角），存档里读出来的是繁体（連續劇 / 男主角），
    所以按 LENGTH_TRAD 转一次；表里出现没登记过的写法就直接报错，免得悄悄漏行。
    与游戏自带的 Length.tab 逐条对照，数值不一致也算错 —— 两边应当完全一致。
    """
    if not os.path.isfile(LENGTH_CSV):
        raise SystemExit("notice length table not found: " + LENGTH_CSV)
    tab = load_length_tab(data_dir)
    out = {}
    with open(LENGTH_CSV, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            kind = row["通告类型"].strip()
            role = row["角色"].strip()
            if kind not in LENGTH_TRAD:
                raise SystemExit("unknown notice kind in %s: %s" % (LENGTH_CSV, kind))
            if role not in LENGTH_TRAD:
                raise SystemExit("unknown role in %s: %s" % (LENGTH_CSV, role))
            key = LENGTH_TRAD[kind] + "|" + LENGTH_TRAD[role]
            value = [int(row["总天数"]), int(row["每周可排"])]
            if key in out and out[key] != value:
                raise SystemExit("duplicate row with different numbers in %s: %s" % (LENGTH_CSV, key))
            out[key] = value
    for key, value in tab.items():
        if key not in out:
            raise SystemExit("Length.tab has a row the csv is missing: " + key)
        if out[key] != value:
            raise SystemExit("csv and Length.tab disagree on %s: %s vs %s" % (key, out[key], value))
    return out


def load_difficulty(data_dir):
    """Star 1..5 -> [[A lo, hi], [B lo, hi], [C lo, hi], [D lo, hi]]."""
    records = read_table(os.path.join(data_dir, "Difficulty.tab"))
    out = []
    for rec in records:
        v = [struct.unpack_from("<I", rec, 4 * j)[0] for j in range(8)]
        out.append([[v[0], v[1]], [v[2], v[3]], [v[4], v[5]], [v[6], v[7]]])
    return out


def load_stars(data_dirs):
    """艺人编号 -> [名字, 性别]（性别 1=男 0=女）。

    来源 StarRole.dat：每条 360 字节，名字在记录 +4 的 Big5 串里，性别在 +24。
    编号就是存档里艺人状态块 -16 处的那个 id，也与团队记录的成员编号一致。
    繁中三合一装的是旧版文件（只有 1..75 号），资料片新增的卫亚(76)、原少纬(77)
    在文件里没有记录 —— 76 由存档里「签约 + 团体成员 + 接下男主角」三处对得上，
    77 按角色表的相邻顺序补上。

    data1 里也有一个 StarRole.dat，但记录布局完全不同（读出来全是控制字符），
    所以要挑能读出整张名单的那一份，别按目录顺序取。
    """
    out = {}
    for data_dir in data_dirs:
        path = os.path.join(data_dir, "StarRole.dat")
        if not os.path.isfile(path):
            continue
        candidate = {}
        for i, rec in enumerate(read_table(path)):
            # 名字是定长字段，后面可能接着别的数据 —— 取到第一个 NUL 为止。
            name = big5(rec[4:40].split(b"\x00")[0])
            if not i or not name:
                continue
            gender = struct.unpack_from("<I", rec, 24)[0] and 1 or 0
            # 75 号的名字是「千萬不要用」占位串，但这一条就是聆香（玩家已确认），
            # 性别字段也是有效的；把占位名换掉，让 stars 成为唯一真源。
            candidate[str(i)] = ["聆香" if "不要用" in name else name, gender]
        if len(candidate) > len(out):
            out = candidate
    out.setdefault("76", ["衛亞", 1])
    out.setdefault("77", ["原少緯", 1])
    return out


# 称号名是 Big5 繁体，和站里其它中文一样转成简体再烘焙。
# 只收录 Nickname.tab 里真实出现过的繁体字；漏一个字就会在下面直接报错，
# 不会悄悄把繁体塞进页面。
TITLE_TRAD = {
    "級": "级", "綜": "综", "藝": "艺", "戲": "戏", "劇": "剧",
    "員": "员", "電": "电", "視": "视", "廣": "广", "兒": "儿",
    "過": "过", "氣": "气", "實": "实", "動": "动", "際": "际", "國": "国",
}

# 简体正文里不会出现的字。转换后还剩任何一个，就说明映射表漏了字 ——
# 宁可直接报错，也不要把繁体混进页面（311「國際名模」漏过一个「際」）。
TRAD_LEFTOVER = "際國級綜藝戲劇員電視廣兒過氣實動後個為於這說時間開關學覺麼樣應該進還選邊讓親愛業樂團專導層慶戰據擔敗"


def simplify_title(name):
    text = "".join(TITLE_TRAD.get(ch, ch) for ch in name)
    left = [ch for ch in text if ch in TRAD_LEFTOVER]
    if left:
        raise SystemExit("unmapped traditional characters in title %r: %s" % (name, "".join(left)))
    return text


# 称号记录里「属性门槛」的列位置 -> 中文名。和存档里艺人九项能力 + 社交五项同序，
# 靠实际数值反推：戲劇天王 +40=700（演技）、綜藝天王 +44=700（口才）、
# 歌神 +48=700（歌艺）、國際名模 +56=700（仪态）、動感歌手 +60=400（动感）、
# 反派演員 +76=600（叛逆）、性感歌手 / 性感演員 +80=600（性感）、偶像 +88=500（人气）。
TITLE_ATTR_COLS = [
    (40, "演技"), (44, "口才"), (48, "歌艺"), (52, "名气"), (56, "仪态"),
    (60, "动感"), (64, "体能"), (68, "才智"), (72, "自信"), (76, "叛逆"),
    (80, "性感"), (84, "亲和"), (88, "人气"), (92, "曝光"),
]

# 作品数量门槛。104~120 五列靠「新人档」互相印证：電視新人 +104=1、電影新人 +108=1、
# 歌唱新人 +112=1、廣告新人 +116=1、主持新人 +120=1。+124 是跨类型的总数。
TITLE_WORK_COLS = [
    (104, "电视作品"), (108, "电影作品"), (112, "专辑"),
    (116, "广告"), (120, "节目"), (124, "作品总数"),
]

# 编号百位 = 职业线；1/2/11/12 是跨线总称号（要演技 + 歌艺都够）。
TITLE_STAR_IDS = (1, 2, 11, 12)

# 每条线内部的档位梯子，低 -> 高。同一档放多个编号＝并列变体
# （男女版、不同作品来源的通用版、演员的喜感 / 反派 / 性感分支）。
# 表里只给门槛不给「第几档」，这个顺序是照门槛高低 + 称号语义排的；
# 下面 check_ladders() 会保证每个编号恰好出现一次，漏排或重排都会直接报错。
TITLE_LADDERS = {
    "music": [[621], [143], [141, 142], [131], [121], [101, 111]],
    "host": [[622], [241], [231], [221], [201, 211]],
    "model": [[623], [341], [331], [321], [311]],
    "screen": [
        [624, 625], [464, 461, 462, 463], [441, 451],
        [431, 432], [421, 422, 423], [401, 411, 402, 412],
    ],
    "other": [[701], [611], [601]],
    "star": [[1, 2, 11, 12]],
}

# 不在梯子上：过气艺人是掉档结果，不是升级方向。
TITLE_NO_RANK = {501}


def title_ranks():
    """称号编号 -> 档位（0 起，越大越高）。"""
    ranks = {}
    for steps in TITLE_LADDERS.values():
        for rank, ids in enumerate(steps):
            for tid in ids:
                if tid in ranks:
                    raise SystemExit("title %d appears twice in the ladders" % tid)
                ranks[tid] = rank
    return ranks


def check_ladders(ids):
    """每个称号编号都必须排进梯子或被显式排除，避免表更新后悄悄漏排。"""
    ranks = title_ranks()
    missing = sorted(set(ids) - set(ranks) - TITLE_NO_RANK)
    if missing:
        raise SystemExit("titles missing from the ladders: %s" % missing)
    extra = sorted(set(ranks) - set(ids))
    if extra:
        raise SystemExit("ladders reference unknown titles: %s" % extra)
    return ranks


def title_line(tid, tag):
    """称号属于哪条线，决定页面上徽标的配色。

    先认记录里的媒介标签（CD 唱片 / SH 主持 / CF 广告模特 / MV·TV 影视），
    标签为「0」的通用版再按编号段判断：4xx 与 624 / 625 是影视，
    其余（过气 / 知名 / 新人 / 未出道）归到「其他」。
    """
    if tid in TITLE_STAR_IDS:
        return "star"
    if tag == "CD":
        return "music"
    if tag == "SH":
        return "host"
    if tag == "CF":
        return "model"
    if tag in ("MV", "TV"):
        return "screen"
    if 400 <= tid <= 499 or tid in (624, 625):
        return "screen"
    return "other"


def load_titles(data_dirs):
    """称号编号 -> (简体称号名, 门槛元数据)，来自 Nickname.tab。

    Nickname.tab 是定长表（55 条 × 168 字节）：
    `+0` 编号 / `+4` 名称 20 字节 Big5 / `+24` 性别（-1 通用、1 男、0 女）/
    `+28` 媒介标签（CD / SH / CF / MV / TV / 0 通用）/ 后面是属性与作品门槛。
    存档里艺人状态块 `o-12` 存的就是这个编号。

    同名的「媒介专属版」和「通用版」各占一条记录（例如戲劇天王 401 是 MV 版、
    411 是通用版），名称相同但门槛不同。这里保留**媒介专属**那条，因为只有它
    能说明这条线靠什么作品养成；通用版的数字留给解析时不看。

    两套 data 目录的内容不同：data 是 2005 初版（超級名模 > 名模 > 人氣偶像，
    701 写作「未出道的新人」），data1 是 2007 更新版（國際名模 > 超級名模 > 名模，
    701 是「未出道新人」）。玩家实际在跑的是更新版，称号也与之一致，
    所以取第一份能读出来的表（调用方给的是 data1 优先）。
    """
    for data_dir in data_dirs:
        path = os.path.join(data_dir, "Nickname.tab")
        if not os.path.isfile(path):
            continue
        names = {}
        meta = {}
        for rec in read_table(path):
            tid = struct.unpack_from("<i", rec, 0)[0]
            name = big5(rec[4:44].split(b"\x00")[0])
            if tid <= 0 or not name:
                continue
            key = str(tid)
            names[key] = simplify_title(name)
            tag = rec[28:32].split(b"\x00")[0].decode("ascii", "replace")
            # 已经有媒介专属版就不再被后面的通用版覆盖。
            if key in meta and meta[key]["tag"] != "0":
                continue
            need = []
            for off, label in TITLE_ATTR_COLS + TITLE_WORK_COLS:
                value = struct.unpack_from("<i", rec, off)[0]
                if value > 0:
                    need.append([label, value])
            meta[key] = {
                "line": title_line(tid, tag),
                "tag": tag,
                "sex": struct.unpack_from("<i", rec, 24)[0],
                "need": need,
            }
        if names:
            ranks = check_ladders([int(k) for k in names])
            for key, item in meta.items():
                item["rank"] = ranks.get(int(key))
            return names, meta
    return {}, {}


def load_firms(data_dir):
    """Company id -> name, used only as a hint next to the save's slot number."""
    path = os.path.join(data_dir, "Firm.dat")
    if not os.path.isfile(path):
        return {}
    out = {}
    for i, rec in enumerate(read_table(path)):
        parts = text_segments(rec, 3)
        if parts[0]:
            out[str(i + 1)] = parts[0]
    return out


# 道具类型编号（Item.dat 记录的 type 字段）-> 中文分类。
# 以游戏内物品窗口的三个页签为准：type=1 的鱼缸 / 白板类摆设出现在「公司物品」，
# type=3 的借据 / 角色纪念物出现在「特殊物品」（2026-11-14 玩家截图核对）。
ITEM_TYPE = {1: "公司物品", 2: "一般物品", 3: "特殊物品"}


def _decode_item_text(values):
    """道具名称 / 说明的字节流：每个 uint32 的低 8 位存原文一个字节（Big5 繁体）。

    Item.dat 里字符串不是连续字节，而是「一个字符一个 uint32」，所以按
    连续 cp950 字节去搜永远搜不到；这里把每 4 字节的低 8 位拼回原始字节流再解码。
    """
    bs = bytes(v & 0xFF for v in values)
    return bs.decode("big5", "replace")


def parse_item_dat(path):
    """解析 Item.dat：返回 code -> [名称, 分类, 说明, 属性行]。

    记录布局（区别于其它定长表）：
      [编号][类型][名称字节数 N] [N 个 uint32 名称字节] [27 个固定字段]
      [说明字节数 M] [M 个 uint32 说明字节] [属性行字节数 K] [K 个 uint32 属性字节]
    名称 / 说明 / 属性行各自按「一字节一 uint32」存放。
    """
    with open(path, "rb") as f:
        raw = f.read()
    if len(raw) < 12:
        return {}
    count = struct.unpack_from("<I", raw, 4)[0]
    out = {}
    off = 12
    # 以文件头和 count 做上限保护；实际按记录自我界定的长度往下走。
    for _ in range(count + 1):
        if off + 12 > len(raw):
            break
        code = struct.unpack_from("<I", raw, off)[0]
        typ = struct.unpack_from("<I", raw, off + 4)[0]
        nlen = struct.unpack_from("<I", raw, off + 8)[0]
        if nlen <= 0 or nlen > 200 or off + 12 + nlen * 4 + 108 + 4 > len(raw):
            break
        name = _decode_item_text(
            struct.unpack_from("<I", raw, off + 12 + i * 4)[0] for i in range(nlen)
        )
        q = off + 12 + nlen * 4          # 27 个固定字段起点
        desc_len = struct.unpack_from("<I", raw, q + 108)[0]
        desc_off = q + 112
        if desc_off + desc_len * 4 + 4 > len(raw):
            break
        desc = _decode_item_text(
            struct.unpack_from("<I", raw, desc_off + i * 4)[0] for i in range(desc_len)
        )
        p2 = desc_off + desc_len * 4
        stats_len = struct.unpack_from("<I", raw, p2)[0]
        stats_off = p2 + 4
        if stats_off + stats_len * 4 > len(raw):
            break
        stats = _decode_item_text(
            struct.unpack_from("<I", raw, stats_off + i * 4)[0] for i in range(stats_len)
        )
        out[code] = [name, ITEM_TYPE.get(typ, "未知物品"), desc, stats]
        off = stats_off + stats_len * 4
    return out


# Item.dat 每条记录的 27 个定长字段里，第 6..26 位是 21 个送礼对象的好感加成
# （0..4）。这 21 个槽位和 StarRole 编号无关，是游戏自己的一份「送礼对象顺序表」；
# 用 sources/favorites.txt 的 ＋4 / ＋3 真值逐条反查确认（95 项全吻合）：
#   1 林芬芬 / 2 桑禾蓓 / 3 欧怡青 / 4 苏嫚君 / 5 路敏 / 6 萧依莉 / 7 天晴 /
#   8 陈奕夫 / 9 关古威 / 10 路风 / 11 纪翔 / 12 姚子奇 / 13 姚子莹 /
#   14 新名纱雪 / 15 聆香 / 17 克烈斯 / 18 卫亚 / 19 原少纬；
# 0 / 16 / 20 三个槽位没有任何专属高好感道具，判定为未使用，不映射艺人。
# 其中 13..15、17..19 六位由攻略站（百度知道同份整理）和游戏里的 ＋4 专属道具
# 双重对上：欧怡青=水晶镶钻脚链、新名纱雪=叛逆口红、卫亚=贺总造型棒棒糖、
# 原少纬=大宇啤酒＋呼干牌啤酒，与索引逐条吻合。
# 输出按「艺人编号 -> 槽位」存，页面直接拿存档艺人编号查。
GIFT_SLOTS = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
    8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 65: 13,
    74: 14, 75: 15, 72: 17, 76: 18, 77: 19,
}


def load_gifts(data_dirs):
    """道具 code -> 21 个送礼槽位的好感加成（0..4），来自 Item.dat。

    真值来自 sources/favorites.txt 的 ＋4 / ＋3 分组；每个艺人能在这 21 列里
    找到唯一一列，使他的所有已知道具数值都对上（95/95）。
    """
    out = {}
    for data_dir in data_dirs:
        path = os.path.join(data_dir, "Item.dat")
        if not os.path.isfile(path):
            continue
        raw = open(path, "rb").read()
        if len(raw) < 12:
            continue
        count = struct.unpack_from("<I", raw, 4)[0]
        u32 = lambda o: struct.unpack_from("<I", raw, o)[0]
        off, found = 12, {}
        for _ in range(count + 1):
            if off + 12 > len(raw):
                break
            code, nlen = u32(off), u32(off + 8)
            if nlen <= 0 or nlen > 200 or off + 12 + nlen * 4 + 112 > len(raw):
                break
            q = off + 12 + nlen * 4
            fixed = [u32(q + i * 4) for i in range(27)]
            desc_len = u32(q + 108)
            p2 = q + 112 + desc_len * 4
            stats_len = u32(p2)
            off = p2 + 4 + stats_len * 4
            vector = fixed[6:27]
            if len(vector) == 21 and max(vector) <= 4:
                found[str(code)] = vector
        # data1（324 条）优先，data（258 条）只补空。
        if len(found) > len(out):
            out = found
    return out


def load_items(data_dirs):
    """从各 data 目录的 Item.dat 解析道具表，data1（324 条）优先，data（258 条）补空。

    编号就是存档道具清单里的 code；名称 / 说明 / 分类供 #/case 的「我拥有的道具」直接展示。
    """
    merged = {}
    for data_dir in data_dirs:
        path = os.path.join(data_dir, "Item.dat")
        if not os.path.isfile(path):
            continue
        parsed = parse_item_dat(path)
        if not parsed:
            continue
        # 记录多的那份是完整数据（data1=324），先到优先，后到的只补空。
        if len(parsed) > len(merged):
            merged = parsed
        else:
            for k, v in parsed.items():
                if k not in merged or not merged[k][0]:
                    merged.setdefault(k, v)
    return merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DEFAULT_DATA,
                    help="game data directory (either the tw folder or one data dir)")
    args = ap.parse_args()
    if not os.path.isdir(args.data):
        print("game data directory not found: " + args.data, file=sys.stderr)
        return 1
    dirs = [os.path.join(args.data, sub) for sub in DATA_SUBDIRS]
    dirs = [d for d in dirs if os.path.isdir(d)] or [args.data]

    titles, title_meta = load_titles(dirs)
    payload = {
        "source": "明星志愿3 繁中三合一（tw）",
        "cases": load_cases(dirs),
        "needEffect": load_need_effect(dirs[0]),
        "length": load_length(dirs[0]),
        "difficulty": load_difficulty(dirs[0]),
        "stars": load_stars(dirs),
        "titles": titles,
        "titleMeta": title_meta,
        "firms": load_firms(dirs[0]),
        "items": load_items(dirs),
        "gifts": load_gifts(dirs),
        "giftSlots": GIFT_SLOTS,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print("cases        %d" % len(payload["cases"]))
    print("needEffect   %d" % len(payload["needEffect"]))
    print("length       %d" % len(payload["length"]))
    print("difficulty   %d stars" % len(payload["difficulty"]))
    print("stars        %d" % len(payload["stars"]))
    print("titles       %d (%d with meta)" % (len(payload["titles"]), len(payload["titleMeta"])))
    print("firms        %d" % len(payload["firms"]))
    print("items        %d" % len(payload["items"]))
    print("gifts        %d items x %d slots (%d artists)" % (
        len(payload["gifts"]), 21, len(payload["giftSlots"])))
    print("written      %s (%d bytes)" % (OUT, os.path.getsize(OUT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
