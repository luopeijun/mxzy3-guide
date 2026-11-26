#!/usr/bin/env python3
"""烘焙甜蜜乐章「筹备中通告」静态表到 public/data/sweet/case-tables.json。

真源是甜蜜乐章安装目录的 Data/*.dat：
- CaseClass.dat / RoleType.dat：通告大类 / 角色类型编号到繁体原文。
- Studio.dat + StudioProduce.dat：制作公司。Studio.dat 的键是记录里的公司
  编号（不是数组下标）；StudioProduce 每条 `[seq][class][caseNo][studioId][...]`，
  当事人看到的公司名由 studioId 决定。海外通告按通告大类取制作公司：
  广告＝伊莉莎白、电影＝大宇宙影业、唱片＝京风唱片、舞台剧＝巴洛克之诗、
  时装秀＝柯里昂；城市只是场景，不是公司名。
- Length.dat：`[class/ subtype][role]` -> [工作天数, 每周上限]，与存档里的
  角色类型一起决定表格上的两枚胶囊。
- 各 XxxCase.dat：通告码 -> 名字（存档里也有名字，这份只做回查）。
- Item.dat：391 条 × 452B 定长记录，道具编号 -> 名称 / 分类 / 说明 / 属性行，
  以及每条记录 +48 起的 21 格送礼向量。艺人槽位由 sources/sweet/favorite-gifts.txt
  的八位可送礼对象反推，只用真实有数据的那八格。
- World.dat：11 条 × 288B；记录 0 的 +44 起是十座国际场景费用（含甜蜜乐章
  新增的倫敦 / 米蘭，对应舞台剧 / 时装秀），记录 1..10 是场景名（+12 起
  Big5）。存档里同构的记录 +4 是解锁标志。

用法：
    python scripts/build_sweet_case_tables.py [--data <game data dir>]
"""

import argparse
import json
import os
import re
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = r"D:\Program Files (x86)\Softstar\Stardom3 - Sweet Melody\Data"
OUT = os.path.join(ROOT, "public", "data", "sweet", "case-tables.json")

CASE_FILES = (
    "CFCase.dat", "TVCase.dat", "CDCase.dat", "MVCase.dat",
    "SHCase.dat", "THCase.dat", "FSCase.dat",
)
# CaseFirm 里这五个槽是海外通告；公司按通告大类取，不按槽号取。
# 存档槽 21/24/25/26/27 与通告大类的对应在不同周次可能错位。
OVERSEAS_SEQS = {21, 24, 25, 26, 27}
CODE_PREFIX = {1: "CF", 2: "TV", 3: "MV", 4: "CD", 5: "SH", 6: "TH", 7: "FS"}
# 存档 sub 编号到 Length.dat 的通告类型名；只覆盖电视剧的三种子类型。
TV_SUBTYPES = {1: "連續劇", 2: "單元劇", 5: "短片"}
# 主持类在 Length.dat 里按节目型细分；先统一取歌舞综艺的 10 天 / 每周 2 次，
# 与 Auto 存档截图里的「主持」通告一致。
HOST_KIND = "歌舞綜藝"

# 通告子类型按大类分表；界面沿用主站简体用词，烘焙时直接转好。
TYPE_FILES = {
    1: "CFType.dat", 2: "TVType.dat", 3: "MVType.dat", 4: "CDType.dat",
    5: "SHType.dat", 6: "THType.dat", 7: "FSType.dat",
}
# ScheduleClass.dat 里 10/15/16/20/21/22 是作品宣传，26/31 是甜蜜乐章新增的
# 舞台剧演出 / 国际时装周。界面沿用主站简体用词。
PROMO_KIND_IDS = {10, 15, 16, 20, 21, 22, 26, 31}
PROMO_KIND_NAMES = {
    "電視劇宣傳": "电视剧宣传", "電影宣傳": "电影宣传", "首映會": "首映会",
    "唱片宣傳": "唱片宣传", "拍攝MTV": "拍摄MTV", "簽名會": "签名会",
    "舞台劇演出": "舞台剧演出", "國際時裝週": "国际时装周",
}
# World.dat 里 id 2..11 的十座国际场景；界面沿用主站的简体显示名。
# 最后两座是甜蜜乐章新增舞台剧 / 时装秀通告才有的场景。
WORLD_SCENE_NAMES = {
    "長城": "长城", "東京": "东京", "好萊塢": "好莱坞", "巴黎": "巴黎",
    "維也納": "维也纳", "夏威夷": "夏威夷", "紐約": "纽约", "開羅": "开罗",
    "倫敦": "伦敦", "米蘭": "米兰",
}

SUBTYPE_SIMPLE = {
    "搖滾": "摇滚", "節奏藍調": "节奏蓝调", "兒歌": "儿歌", "綜藝": "综艺",
    "採訪報導": "采访报道", "時裝週": "时装周", "說話": "说话", "聰明": "聪明",
    "動感": "动感", "劇": "剧", "愛": "爱", "鄉": "乡", "溫": "温",
    "倫": "伦", "輕": "轻", "鬆": "松", "勵": "励", "險": "险",
    "偵": "侦", "懸": "悬", "會": "会", "裝": "装", "宮": "宫",
    "藝": "艺", "戰": "战", "爭": "争", "樂": "乐", "來": "来",
    "節": "节", "調": "调", "談": "谈", "話": "话", "運": "运",
    "動": "动", "競": "竞", "賽": "赛", "採": "采", "訪": "访",
    "導": "导", "閒": "闲", "類": "类", "時": "时",
}


def simplify_subtype(name):
    out = name
    for traditional, simple in SUBTYPE_SIMPLE.items():
        out = out.replace(traditional, simple)
    return out


def read_table(path):
    with open(path, "rb") as f:
        raw = f.read()
    if len(raw) < 12:
        return []
    if raw[4:6] == b"\x78\x9c":
        raw = zlib.decompress(raw[4:])
    magic, count, size = struct.unpack_from("<III", raw, 0)
    if magic != 0x3F2:
        raise SystemExit("unexpected table magic in %s" % path)
    return [raw[12 + i * size:12 + (i + 1) * size] for i in range(count)]


def text(buf, offset=0, limit=64):
    end = offset
    while end < min(offset + limit, len(buf)) and buf[end]:
        end += 1
    return buf[offset:end].decode("big5", "replace")


def load_names(path, value_offset=4, limit=20):
    out = {}
    for i, rec in enumerate(read_table(path)):
        name = text(rec, value_offset, limit)
        if name:
            out[str(i)] = name
    return out


def load_companies(data_dir):
    """Studio.dat 的键是记录内公司编号，不能用数组下标（编号有跳号）。"""
    out = {}
    for rec in read_table(os.path.join(data_dir, "Studio.dat")):
        ident = struct.unpack_from("<I", rec, 0)[0]
        name = text(rec, 4, 28)
        if ident and name:
            out[str(ident)] = name
    return out


def load_company_by_seq(data_dir, companies):
    out = {}
    for rec in read_table(os.path.join(data_dir, "StudioProduce.dat")):
        seq, _class, _case_no, studio_id = struct.unpack_from("<4I", rec, 0)
        name = companies.get(str(studio_id), "")
        if seq and name:
            out.setdefault(str(seq), name)
    return out


def load_company_by_code(data_dir, companies):
    """StudioProduce 的 caseNo 是通告码数字段；class=0 表示全大类通用。"""
    out = {}
    for rec in read_table(os.path.join(data_dir, "StudioProduce.dat")):
        _seq, class_id, case_no, studio_id = struct.unpack_from("<4I", rec, 0)
        name = companies.get(str(studio_id), "")
        if not case_no or not name:
            continue
        for ident, prefix in CODE_PREFIX.items():
            if class_id in (0, ident):
                out.setdefault(prefix + ("%03d" % case_no), name)
    return out


def load_overseas_companies(data_dir, companies):
    """海外通告按大类取固定制作公司，槽号只表示刷新位次。"""
    out = {}
    for rec in read_table(os.path.join(data_dir, "StudioProduce.dat")):
        seq, class_id, _case_no, studio_id = struct.unpack_from("<4I", rec, 0)
        name = companies.get(str(studio_id), "")
        if seq in OVERSEAS_SEQS and class_id and name:
            out.setdefault(str(class_id), name)
    return out


def load_lengths(data_dir):
    out = {}
    for rec in read_table(os.path.join(data_dir, "Length.dat")):
        kind = text(rec, 4, 10)
        role = text(rec, 14, 10)
        per_week, days = struct.unpack_from("<II", rec, 28)
        if not kind or not role or not days or not per_week:
            continue
        out[kind + "|" + role] = [days, per_week]
    # 存档只写「電視 + sub」，sub 再映射到 Length.dat 的真实子类型。
    for sub, kind in TV_SUBTYPES.items():
        for role in ("男主角", "女主角", "男配角", "女配角"):
            value = out.get(kind + "|" + role)
            if value:
                out["電視%d|%s" % (sub, role)] = value
                out.setdefault("電視|" + role, value)
    for role in ("主持人", "助理主持", "外景主持"):
        value = out.get(HOST_KIND + "|" + role)
        if value:
            out["主持|" + role] = value
    return out


def load_cases(data_dir):
    out = {}
    for filename in CASE_FILES:
        path = os.path.join(data_dir, filename)
        if not os.path.isfile(path):
            continue
        for rec in read_table(path):
            code = rec[:5].decode("ascii", "replace")
            if not re.fullmatch(r"[A-Z]{2}[0-9A-Z]{3}", code):
                continue
            name = text(rec, 8, 40)
            if name:
                out.setdefault(code, name)
    return out


def load_subtypes(data_dir):
    out = {}
    for class_id, filename in TYPE_FILES.items():
        path = os.path.join(data_dir, filename)
        if not os.path.isfile(path):
            continue
        for rec in read_table(path):
            ident = struct.unpack_from("<I", rec, 0)[0]
            name = simplify_subtype(text(rec, 4, len(rec) - 4))
            if ident and name and name not in ("無", "_"):
                out["%d|%d" % (class_id, ident)] = name
    return out


def load_promo_kinds(data_dir):
    """ScheduleClass.dat：宣传子类编号 -> 简体显示名。"""
    out = {}
    for rec in read_table(os.path.join(data_dir, "ScheduleClass.dat")):
        ident = struct.unpack_from("<I", rec, 0)[0]
        if ident not in PROMO_KIND_IDS:
            continue
        name = PROMO_KIND_NAMES.get(text(rec, 4, len(rec) - 4))
        if name:
            out[str(ident)] = name
    return out


# 道具类型编号（Item.dat 记录 +4）-> 游戏物品窗口的三个页签。
ITEM_TYPE = {1: "公司物品", 2: "一般物品", 3: "特殊物品"}

# 甜蜜乐章 Item.dat 每条记录 452 字节，送礼向量在 +48 起 21 格。
# 只用 sources/sweet/favorite-gifts.txt 的八位艺人反推出真正有数据的槽位；
# 其余槽位（含 24/25/26 号剧情道具里出现的 5）不是好感加成，不映射艺人。
# 这里存 0 基数组下标，页面直接 vector[slot]。
SWEET_GIFT_SLOTS = {
    11: 13,  # 沈惟真
    13: 14,  # 史蒂芬
    12: 15,  # 丹尼斯
    14: 16,  # 姚子奇
    15: 17,  # 慕容和希
    16: 18,  # 卫亚
    17: 19,  # 纪翔
    18: 20,  # 城仲瑄
}


def load_sweet_items(data_dir):
    """解析甜蜜乐章 Item.dat：返回 (code -> 文本四元组, code -> 送礼向量)。

    与主站的变长 Item.dat 不同，这里的头部是 [1010][391][452][1]，每条记录定长
    452B：+0 编号、+4 类型、+8 名称（Big5，NUL 结束，最长 18 字节）、+48 起 21
    个送礼槽位、+148 说明、+349 属性行。名称 / 说明 / 属性都是连续 Big5 字节。
    """
    path = os.path.join(data_dir, "Item.dat")
    if not os.path.isfile(path):
        return {}, {}
    with open(path, "rb") as f:
        raw = f.read()
    if len(raw) < 12:
        return {}, {}
    magic, count, size, _flag = struct.unpack_from("<4I", raw, 0)
    if magic != 1010 or size != 452:
        return {}, {}
    items, gifts = {}, {}
    for i in range(count):
        off = 12 + i * size
        if off + size > len(raw):
            break
        rec = raw[off:off + size]
        code, typ = struct.unpack_from("<2I", rec, 0)
        if not code:
            continue
        name = text(rec, 8, 40)
        if not name:
            continue
        vector = list(struct.unpack_from("<21I", rec, 48))
        if max(vector) <= 4:
            gifts[str(code)] = vector
        items[str(code)] = [
            name,
            ITEM_TYPE.get(typ, "未知物品"),
            text(rec, 148, 196),
            text(rec, 349, 99),
        ]
    return items, gifts


def load_sweet_scenes(data_dir):
    """从 World.dat 取十座国际场景的费用与繁体原名。

    记录 0 的 +44 起是十个 int32 费用：前八个与主站 World.tab 一致，
    第九 / 十个是倫敦 / 米蘭（甜蜜乐章新增舞台剧 / 时装秀场景）。记录
    1..10 的 +12 起是 16B Big5 名字。存档里同样按 288B 步长排布，紧挨
    名字前的 int32 才是解锁标志，解析器按 rawName 对齐这两份数据。
    """
    path = os.path.join(data_dir, "World.dat")
    if not os.path.isfile(path):
        return []
    records = read_table(path)
    if len(records) < 11:
        return []
    costs = struct.unpack_from("<10i", records[0], 44)
    out = []
    for i in range(1, 11):
        ident = struct.unpack_from("<I", records[i], 0)[0]
        raw_name = text(records[i], 12, 16)
        if ident != i + 1 or raw_name not in WORLD_SCENE_NAMES:
            continue
        out.append({
            "name": WORLD_SCENE_NAMES[raw_name],
            "rawName": raw_name,
            "cost": costs[i - 1],
        })
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=DEFAULT_DATA)
    args = parser.parse_args()
    companies = load_companies(args.data)
    items, gifts = load_sweet_items(args.data)
    data = {
        "classes": load_names(os.path.join(args.data, "CaseClass.dat")),
        "roles": load_names(os.path.join(args.data, "RoleType.dat")),
        "companies": companies,
        "companyBySeq": load_company_by_seq(args.data, companies),
        "companyByCode": load_company_by_code(args.data, companies),
        "overseasCompanies": load_overseas_companies(args.data, companies),
        "lengths": load_lengths(args.data),
        "cases": load_cases(args.data),
        "subtypes": load_subtypes(args.data),
        "promoKinds": load_promo_kinds(args.data),
        "items": items,
        "gifts": gifts,
        "giftSlots": SWEET_GIFT_SLOTS,
        "scenes": load_sweet_scenes(args.data),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", OUT, "classes", len(data["classes"]), "roles", len(data["roles"]),
          "companies", len(data["companyBySeq"]), "lengths", len(data["lengths"]),
          "subtypes", len(data["subtypes"]), "promoKinds", len(data["promoKinds"]),
          "items", len(items), "gifts", len(gifts), "giftSlots", len(SWEET_GIFT_SLOTS),
          "scenes", len(data["scenes"]))


if __name__ == "__main__":
    main()
