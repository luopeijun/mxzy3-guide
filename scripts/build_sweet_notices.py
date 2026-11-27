#!/usr/bin/env python3
"""烘焙甜蜜乐章「通告库」静态表到 public/data/sweet/notices.json。

真源是甜蜜乐章安装目录的 Data/*.dat，不是玩家整理的表格：
- CFCase/TVCase/MVCase/CDCase/SHCase/THCase/FSCase.dat：七类通告的编号、名字、
  剧情简介与角色简介。这些文件是自定义压缩的（4B 头 + zlib），解压后表头为
  `[magic][记录长][记录数]`，通告按 10188B 一块排布；块首是通告本体，块内
  +2036/+4076/+6116/+8156 是最多四条角色记录。
- XxxType.dat / TVLength.dat / CaseClass.dat / RoleType.dat / CaseSpecial.dat：
  子类型、角色类型与特殊要求的编号到繁体原文。
- NeedEffect.dat：类型 × 征求对象 → 九项能力的 A/B/C/D 要求、七种特殊要求
  标志，以及九项能力在拍摄期间「每天」的影响值（整数存储，除以 10 即游戏
  内的小数）；Difficulty.dat：星级 → 四档数值区间。
- Studio.dat + StudioProduce.dat + MapRole.dat：制作公司与制作人。

社区表格里的「默认艺人 / 特殊要求每日增减 / 艺人成长率 / 原表说明」不在
游戏数据里，脚本不会编造，只留空并在 notes 里交代。能力影响每日值原本也
被误判为缺失，实际就在 NeedEffect.dat 后半段，现已接入。

用法：
    python scripts/build_sweet_notices.py [--data <game data dir>]
"""

import argparse
import json
import os
import re
import struct
import sys
import zlib

try:
    from opencc import OpenCC
except ImportError:  # pragma: no cover - 只在重新烘焙时需要
    sys.exit("需要先安装依赖：pip install opencc-python-reimplemented")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = r"D:\Program Files (x86)\Softstar\Stardom3 - Sweet Melody\Data"
OUT = os.path.join(ROOT, "public", "data", "sweet", "notices.json")
BLOCK_SIZE = 10188
ROLE_OFFSETS = (2036, 4076, 6116, 8156)

# (文件, 分类键, 大类编号, 子类型表)
CASE_FILES = (
    ("CFCase.dat", "ad", 1, "CFType.dat"),
    ("TVCase.dat", "tv", 2, "TVType.dat"),
    ("MVCase.dat", "movie", 3, "MVType.dat"),
    ("CDCase.dat", "music", 4, "CDType.dat"),
    ("SHCase.dat", "show", 5, "SHType.dat"),
    ("THCase.dat", "stage", 6, "THType.dat"),
    ("FSCase.dat", "fashion", 7, "FSType.dat"),
)
CAT_NAMES = {
    "ad": "广告", "tv": "电视剧", "movie": "电影", "music": "唱片",
    "show": "主持", "stage": "舞台剧", "fashion": "时装秀",
}
# 甜站 ArtistAbility.dat 的编号 -> 主站九项能力（顺序与主站 notices.json 一致）
ABILITY_IDS = (2, 3, 1, 9, 4, 5, 6, 7, 8)
ABILITIES = ("演技", "口才", "歌艺", "名气", "仪态", "动感", "体能", "才智", "自信")
CODE_PREFIX = {1: "CF", 2: "TV", 3: "MV", 4: "CD", 5: "SH", 6: "TH", 7: "FS"}
# CaseFirm 刷新槽位里，这几个 seq 的公司由通告大类决定，不按槽号本身查。
# 与存档解析器 sweetCompany() / build_sweet_case_tables.py 完全同口径。
OVERSEAS_SEQS = {21, 24, 25, 26, 27}
NEED_TYPE_FILE = {
    1: "CFType.dat", 2: "TVType.dat", 3: "MVType.dat", 4: "CDType.dat",
    5: "SHType.dat", 7: "FSType.dat",
}

cc = OpenCC("t2s")


def simplify(value: str) -> str:
    return cc.convert(value or "")


def read_table(path):
    """读取甘大宇表格；甜站通告表是 zlib 压缩的，表头字段顺序与普通表相反。"""
    with open(path, "rb") as handle:
        raw = handle.read()
    compressed = len(raw) >= 6 and raw[4:6] == b"\x78\x9c"
    if compressed:
        raw = zlib.decompress(raw[4:])
    if len(raw) < 12:
        return []
    first, second, third = struct.unpack_from("<III", raw, 0)
    size, count = (second, third) if compressed else (third, second)
    if first != 0x3F2 or not size or count * size + 12 > len(raw):
        raise SystemExit("unexpected table layout in %s" % path)
    return [raw[12 + i * size:12 + (i + 1) * size] for i in range(count)]


def text_at(buf, offset=0, limit=64):
    end = offset
    while end < min(offset + limit, len(buf)) and buf[end]:
        end += 1
    return buf[offset:end].decode("big5", "replace")


def text_runs(buf, offset):
    """通告简介是多段 NUL 分隔的 Big5 文本，按出现顺序拼成一段。"""
    parts = []
    for match in re.finditer(rb"[ -~\xa1-\xfe]{2,}", buf[offset:]):
        raw = match.group()
        try:
            value = raw.decode("big5")
        except UnicodeDecodeError:
            continue
        if value.strip():
            parts.append(value)
    return "".join(parts).strip()


def load_names(path, value_offset=4, limit=24):
    out = {}
    for record in read_table(path):
        ident = struct.unpack_from("<i", record, 0)[0]
        name = text_at(record, value_offset, limit)
        if name and name != "_":
            out[ident] = simplify(name)
    return out


def load_studios(data_dir):
    out = {}
    for record in read_table(os.path.join(data_dir, "Studio.dat")):
        ident = struct.unpack_from("<I", record, 0)[0]
        name = text_at(record, 4, 28)
        if ident and name and name != "無":
            out[ident] = simplify(name)
    return out


def load_company_tables(data_dir):
    """公司槽位真源：Studio.dat + StudioProduce.dat，与存档解析器同口径。

    StudioProduce 的 `[seq][class][caseNo][studioId]` 里，seq 是 CaseFirm 槽位；
    海外刷新槽 21/24/25/26/27 的公司按通告大类取，不能按槽号直接查。
    """
    studios = load_studios(data_dir)
    by_seq = {}
    overseas = {}
    for record in read_table(os.path.join(data_dir, "StudioProduce.dat")):
        seq, class_id, _case_no, studio_id = struct.unpack_from("<4I", record, 0)
        name = studios.get(studio_id, "")
        if not name:
            continue
        if seq:
            by_seq.setdefault(seq, name)
        if seq in OVERSEAS_SEQS and class_id:
            overseas.setdefault(class_id, name)
    return by_seq, overseas


def load_production(data_dir):
    """按通告码查公司 / 制作人；class=0 的记录对所有大类通用。"""
    studios = load_studios(data_dir)
    company_by_code = {}
    producer_by_code = {}
    for record in read_table(os.path.join(data_dir, "StudioProduce.dat")):
        _seq, class_id, case_no, studio_id, char_id = struct.unpack_from("<5I", record, 0)
        company = studios.get(studio_id, "")
        if not case_no:
            continue
        for ident, prefix in CODE_PREFIX.items():
            if class_id not in (0, ident):
                continue
            code = prefix + ("%03d" % case_no)
            if company:
                company_by_code.setdefault(code, company)
            if char_id > 1:
                producer_by_code.setdefault(code, char_id)
    return company_by_code, producer_by_code


def load_character_names(data_dir):
    names = {}
    for record in read_table(os.path.join(data_dir, "MapRole.dat")):
        ident = struct.unpack_from("<i", record, 0)[0]
        name = text_at(record, 8, 32)
        if ident and name:
            names.setdefault(ident, simplify(name))
    return names


def load_grades(data_dir):
    """NeedEffect.dat 的完整等级行。

    记录长 120B、30 个 int32：
    - +12..+44（列 3..11）：九项能力的 A/B/C/D 档位，0 表示不要求；
    - +48..+76（列 12..18）：七位 0/1，对应 CaseSpecial.dat 的七种特殊要求；
    - +76..+108（列 19..27）：九项能力在拍摄期间每天的影响，整数存储，
      除以 10 才是游戏里的小数（例如 28 → 每天 +2.8）；0 为不增减，999 是
      游戏里不作数值展示的保留标记，跳过。
    同名类型 × 征求对象在社区表「能力影响（每天）」里的数值，与本文件逐格
    核对一致（广告 / 唱片 / 主持全命中），字段顺序同九项能力。
    """
    type_names = {}
    for file_name in NEED_TYPE_FILE.values():
        type_names[file_name] = load_names(os.path.join(data_dir, file_name))
    special_names = load_names(os.path.join(data_dir, "CaseSpecial.dat"))
    special_names.pop(0, None)  # 0 = 無，不是特殊要求
    rows = []
    for record in read_table(os.path.join(data_dir, "NeedEffect.dat")):
        values = [struct.unpack_from("<i", record, off)[0] for off in range(0, 120, 4)]
        code, second = values[0], values[1]
        group = code // 100
        tail = code % 100
        # 征求对象要归一到主站约定：广告/唱片/时装秀不按男女拆开（对应
        # gradeRole() 返回空串），电影/电视剧拆主角/配角，主持按通告码十位拆。
        # 甜站 NeedEffect 的 second 是难度档，不是角色，501/511/521 的 second
        # 都是 1，用 second//10 会把助理主持和外景主持都算成主持人。
        if group == 1:
            table, subtype, role = "CFType.dat", second, ""
        elif group == 2:
            table, subtype = "TVType.dat", tail
            role = "主角" if tail < 50 else "配角"
        elif group == 3:
            table, subtype = "MVType.dat", tail
            role = "主角" if tail < 50 else "配角"
        elif group == 4:
            table, subtype, role = "CDType.dat", second, ""
        elif group == 5:
            # 511/521 的尾号是 11..25，其中十位是主持角色（1 助理、2 外景），
            # 个位才是节目类型（SHType.dat 只有 1..5）。用完整尾号查不到类型名。
            table, subtype = "SHType.dat", tail % 10
            role = {0: "主持人", 1: "助理主持", 2: "外景主持"}.get(
                (code // 10) % 10, "主持人"
            )
        elif group == 7:
            table, subtype, role = "FSType.dat", second, ""
        else:
            continue
        type_name = type_names.get(table, {}).get(subtype, "")
        if not type_name:
            continue
        grades = {}
        for ability, value in zip(ABILITIES, values[3:12]):
            if value in (1, 2, 3, 4):
                grades[ability] = "ABCD"[value - 1]
        gains = {}
        for ability, value in zip(ABILITIES, values[19:28]):
            if value == 0 or value == 999:
                continue
            gains[ability] = round(value / 10.0, 1)
        kinds = [
            special_names[index]
            for index in range(1, 8)
            if values[11 + index] == 1 and special_names.get(index)
        ]
        if grades or gains:
            row = {"type": type_name, "role": role, "grades": grades}
            if gains:
                row["gains"] = gains
            if kinds:
                row["specialKinds"] = kinds
            rows.append(row)
    return rows


def load_scale(data_dir):
    labels = ("一星", "二星", "三星", "四星", "五星")
    rows = []
    for record in read_table(os.path.join(data_dir, "Difficulty.dat")):
        values = [struct.unpack_from("<i", record, off)[0] for off in range(0, 36, 4)]
        stars, *bounds = values
        if not 1 <= stars <= 5:
            continue
        ranges = {}
        for index, grade in enumerate("ABCD"):
            low, high = bounds[index * 2], bounds[index * 2 + 1]
            ranges[grade] = "%d-%d" % (low, high)
        rows.append({"stars": stars, "label": labels[stars - 1], "ranges": ranges})
    return rows


def load_special_effects(data_dir):
    out = []
    for record in read_table(os.path.join(data_dir, "CaseSpecial.dat")):
        ident = struct.unpack_from("<i", record, 0)[0]
        name = text_at(record, 4, 24)
        if ident and name and name != "無":
            out.append({"kind": simplify(name), "note": "甜蜜乐章数据文件未给出每日增减"})
    return out


def load_cases(data_dir, roles, company_by_seq, overseas, producers, characters):
    notices = []
    cat_counts = {}
    seen = set()
    for file_name, cat, class_id, type_file in CASE_FILES:
        path = os.path.join(data_dir, file_name)
        raw = open(path, "rb").read()
        body = zlib.decompress(raw[4:])[12:]
        type_names = load_names(os.path.join(data_dir, type_file))
        count = 0
        for index in range(len(body) // BLOCK_SIZE):
            block = body[index * BLOCK_SIZE:(index + 1) * BLOCK_SIZE]
            # 表头的「记录长」只是块内子记录大小（舞台剧 44B、时装秀 23B），
            # 通告本体与角色简介都跨多格，按固定窗口取整块正文。
            main = block[:1024]
            code_bytes = main[0:6]
            if not re.match(rb"^[A-Z]{2}[0-9A-Z]{3}\x00$", code_bytes):
                continue
            code = code_bytes[:5].decode("ascii")
            if code in seen:
                continue
            seen.add(code)
            subtype = struct.unpack_from("<i", main, 76)[0]
            type_name = type_names.get(subtype, "")
            notice = {
                "id": code,
                "cat": cat,
                "name": simplify(text_at(main, 8, 88)),
            }
            if type_name:
                notice["type"] = type_name
                if cat == "ad":
                    notice["level"] = type_name
            elif cat == "stage":
                # 舞台剧本体 +76 取 1~8，但 THType.dat 只给 1~4 配了春夏秋冬
                # 公演名，5~8 在游戏表里就是 `_` 占位。不编季节名，回退到
                # classes 表里的大类真源，避免同一类通告的类型时有时无。
                notice["type"] = CAT_NAMES[cat]
            brief = simplify(text_runs(main, 104))
            if brief:
                notice["brief"] = brief
            # 通告本体 +88 就是 CaseFirm 槽位 seq，与存档解析器同口径：海外
            # 刷新槽按大类取公司，其余按 seq 查 StudioProduce → Studio.dat。
            seq = struct.unpack_from("<i", main, 88)[0]
            company = overseas.get(class_id, "") if seq in OVERSEAS_SEQS else ""
            if not company:
                company = company_by_seq.get(seq, "")
            if company:
                notice["company"] = simplify(company)
            producer_id = producers.get(code)
            if producer_id and characters.get(producer_id):
                notice["producer"] = characters[producer_id]
            notice_roles = []
            for offset in ROLE_OFFSETS:
                role_rec = block[offset:offset + 1024]
                if role_rec[:6] != code_bytes:
                    continue
                role_index = struct.unpack_from("<i", role_rec, 8)[0]
                role_name = roles.get(role_index, "")
                if not role_name:
                    continue
                entry = {"id": code + str(role_index), "name": role_name}
                role_brief = simplify(text_runs(role_rec, 104))
                if role_brief:
                    entry["brief"] = role_brief
                notice_roles.append(entry)
            if notice_roles:
                notice["roles"] = notice_roles
            notices.append(notice)
            count += 1
        cat_counts[cat] = count
    return notices, cat_counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=DEFAULT_DATA)
    args = parser.parse_args()

    roles = load_names(os.path.join(args.data, "RoleType.dat"))
    company_by_seq, overseas = load_company_tables(args.data)
    _companies, producers = load_production(args.data)
    characters = load_character_names(args.data)
    notices, cat_counts = load_cases(
        args.data, roles, company_by_seq, overseas, producers, characters
    )

    categories = [
        {"key": cat, "name": CAT_NAMES[cat], "count": cat_counts[cat]}
        for _file, cat, _class, _type in CASE_FILES
    ]
    role_count = sum(len(notice.get("roles", [])) for notice in notices)
    data = {
        "meta": {
            "noticeCount": len(notices),
            "roleCount": role_count,
            "sources": ["甜蜜乐章安装目录 Data/*.dat"],
            "generatedBy": "scripts/build_sweet_notices.py",
        },
        "abilities": list(ABILITIES),
        "categories": categories,
        "notices": notices,
        "grades": load_grades(args.data),
        "scale": load_scale(args.data),
        "specialEffects": load_special_effects(args.data),
        "growth": [],
        "notes": [
            "编号、名称、剧情简介、角色与角色简介、子类型、等级要求、数值区间、拍摄期间每天的能力影响与特殊要求标志来自游戏数据文件。",
            "默认艺人、特殊要求的每日属性增减与艺人成长率不在游戏数据文件里，暂留空。",
        ],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    grade_rows = data["grades"]
    print("notices: %d  roles: %d  grades: %d  -> %s" %
          (len(notices), role_count, len(grade_rows), OUT))
    print("grades with gains: %d  with special kinds: %d" %
          (sum(1 for row in grade_rows if row.get("gains")),
           sum(1 for row in grade_rows if row.get("specialKinds"))))
    print("categories: " + ", ".join("%s %d" % (row["name"], row["count"]) for row in categories))


if __name__ == "__main__":
    main()
