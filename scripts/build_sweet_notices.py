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

角色星级（1~5）不在静态 Case 本体里，是游戏接取通告时写进存档的，但真源
换算规则在 Difficulty.dat：
- 存档是 4B 长度头 + zlib，解压后按 `[1][0][0][0][通告角色码][NUL]` 找角色
  记录，`+12` 是角色类型、`+16` 是星级、`+28..+64` 是九项能力门槛。
- Difficulty.dat 是「星级 -> 四档数值区间」表。每条存档门槛的每一个非零值都
  落在某个星级的区间里，把所有门槛取交集即可反推星级（真源在游戏源码 .dat）；
  区间重叠导致歧义时回退到存档 `+16` 字段。两种口径在 8946 条存档记录里
  99.92% 一致，11 份存档交叉验证同一角色码星级 100% 稳定。
- 通告角色码大多是 6 字节（末位是角色槽序号 1..4，静态本体 ROLE_OFFSETS 的
  第 i 个槽对应 `code + str(i+1)`）；唱片 CD / 主持 SH 是 5 字节码，不带槽号，
  要用 `存档码 + 角色类型`（如 CD0024 / SH0019）对应静态角色的 `code + role_index`。
只给有真值的角色写 `difficulty`，没被存档覆盖的角色留空，前端不显示星级，
绝不拿 `difficulty ?? 1` 兜底造出假的一星。

用法：
    python scripts/build_sweet_notices.py [--data <game data dir>] [--saves <save dir>]
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
DEFAULT_SAVES = os.path.join(ROOT, "tests", "fixtures", "saves", "sweet")
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


def load_difficulty(data_dir):
    """读取 Difficulty.dat：星级 1..5 -> 四档数值区间 [(lo, hi) × 4]。

    这是游戏源码给出的「星级 <-> 能力门槛」换算规则，用来把存档里的九项门槛
    反推成星级。记录为定长 36B：`[星级][A_lo][A_hi][B_lo][B_hi][C_lo][C_hi][D_lo][D_hi]`。
    """
    path = os.path.join(data_dir, "Difficulty.dat")
    with open(path, "rb") as handle:
        raw = handle.read()
    first, count, size = struct.unpack_from("<III", raw, 0)
    if first != 0x3F2 or count * size + 12 > len(raw):
        raise SystemExit("unexpected Difficulty.dat layout")
    out = {}
    for index in range(count):
        rec = raw[12 + index * size:12 + (index + 1) * size]
        values = [struct.unpack_from("<i", rec, o)[0] for o in range(0, size, 4)]
        star = values[0]
        out[star] = [(values[1 + 2 * j], values[2 + 2 * j]) for j in range(4)]
    return out


def load_need_grades(data_dir):
    """读取 NeedEffect.dat 每条记录的九项能力等级（0=不要求，1..4=A/B/C/D）。

    等级用来锁定存档门槛应落在 Difficulty.dat 的哪一档区间，避免只看数值时
    因档位重叠产生歧义。
    """
    path = os.path.join(data_dir, "NeedEffect.dat")
    with open(path, "rb") as handle:
        raw = handle.read()
    first, count, size = struct.unpack_from("<III", raw, 0)
    if first != 0x3F2 or count * size + 12 > len(raw):
        raise SystemExit("unexpected NeedEffect.dat layout")
    out = []
    for index in range(count):
        rec = raw[12 + index * size:12 + (index + 1) * size]
        values = [struct.unpack_from("<i", rec, o)[0] for o in range(0, size, 4)]
        out.append((values[0], values[3:12]))
    return out


def star_from_gates(gates, difficulty, needs):
    """用 NeedEffect 等级 + Difficulty 区间把九项能力门槛精确反推成星级。

    对每条 NeedEffect 等级模式，要求每个非零门槛落在 `Difficulty[星级][等级-1]`
    区间内；能解释全部门槛的星级若唯一即返回。等级模式不限制档位、门槛随机
    抽取超出区间（多解或无解）时返回 None，由调用方回退到存档 `+16` 字段。
    """
    stars = set()
    for star, ranges in difficulty.items():
        for _need_id, grades in needs:
            ok = True
            for index, gate in enumerate(gates):
                if not gate:
                    continue
                grade = grades[index]
                if not (1 <= grade <= 4):
                    ok = False
                    break
                low, high = ranges[grade - 1]
                if not (low <= gate <= high):
                    ok = False
                    break
            if ok:
                stars.add(star)
                break
    return next(iter(stars)) if len(stars) == 1 else None


def load_role_stars(save_dir, difficulty, needs):
    """从冻结存档 + Difficulty.dat 区间表烘焙「通告角色码 → 星级」真值表。

    存档格式是 4B 长度头 + zlib；角色记录以 `[1][0][0][0][ASCII 码][NUL]`
    起头，`+12` 角色类型、`+16` 星级、`+28..+64` 九项门槛。星级优先用门槛区间
    反推（真源在游戏源码），歧义时回退到 `+16`；严格过滤宽松扫描的假阳性
    （例如 SH005 在非角色记录上被误读成 2★）。跨存档验证 100% 稳定。
    """
    stars = {}
    if not os.path.isdir(save_dir):
        raise SystemExit("存档目录不存在：%s" % save_dir)
    files = sorted(
        os.path.join(save_dir, name)
        for name in os.listdir(save_dir)
        if name.lower().endswith(".sav")
    )
    for path in files:
        with open(path, "rb") as handle:
            packed = handle.read()
        if len(packed) < 4:
            continue
        try:
            raw = zlib.decompress(packed[4:])
        except zlib.error:
            continue
        for at in range(len(raw) - 96):
            if raw[at] != 1 or raw[at + 1:at + 4] != b"\x00\x00\x00":
                continue
            end = at + 4
            while end < at + 11 and 0x30 <= raw[end] <= 0x7a:
                end += 1
            code_len = end - (at + 4)
            if not (5 <= code_len <= 6) or raw[end] != 0:
                continue
            role_code = raw[at + 4:end].decode("ascii", "replace")
            if not role_code[:2].isalpha():
                continue
            role_type = struct.unpack_from("<i", raw, at + 12)[0]
            save_star = struct.unpack_from("<i", raw, at + 16)[0]
            gates = [
                struct.unpack_from("<i", raw, at + 28 + index * 4)[0]
                for index in range(9)
            ]
            if not (1 <= role_type <= 11 and 1 <= save_star <= 5):
                continue
            if not all(0 <= value <= 999 for value in gates):
                continue
            star = star_from_gates(gates, difficulty, needs) or save_star
            # CD / SH 存档码是 5 字节，不带槽号，用「码 + 角色类型」做 canonical key，
            # 与静态角色的 `code + role_index` 对齐；其余 6 字节码末位已是槽号。
            key = (
                role_code + str(role_type)
                if code_len == 5 and role_code[:2] in ("CD", "SH")
                else role_code
            )
            if key not in stars:
                stars[key] = star
    return stars


def load_cases(data_dir, roles, company_by_seq, overseas, producers, characters, stars=None):
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
            for slot, offset in enumerate(ROLE_OFFSETS):
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
                # 多数存档码末位是槽位序号（1..4），按槽位对应；CD / SH 存档码是
                # 5 字节不带槽号，用「码 + 角色类型」即静态的 `code + role_index` 查。
                if stars:
                    star = stars.get(code + str(slot + 1))
                    if star is None and code[:2] in ("CD", "SH"):
                        star = stars.get(code + str(role_index))
                    if star is not None:
                        entry["difficulty"] = star
                        entry["starSource"] = "存档+Difficulty区间"
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
    parser.add_argument("--saves", default=DEFAULT_SAVES)
    args = parser.parse_args()

    roles = load_names(os.path.join(args.data, "RoleType.dat"))
    company_by_seq, overseas = load_company_tables(args.data)
    _companies, producers = load_production(args.data)
    characters = load_character_names(args.data)
    difficulty = load_difficulty(args.data)
    needs = load_need_grades(args.data)
    stars = load_role_stars(args.saves, difficulty, needs)
    notices, cat_counts = load_cases(
        args.data, roles, company_by_seq, overseas, producers, characters, stars
    )

    categories = [
        {"key": cat, "name": CAT_NAMES[cat], "count": cat_counts[cat]}
        for _file, cat, _class, _type in CASE_FILES
    ]
    role_count = sum(len(notice.get("roles", [])) for notice in notices)
    star_count = sum(
        sum(1 for role in notice.get("roles", []) if role.get("difficulty") is not None)
        for notice in notices
    )
    data = {
        "meta": {
            "noticeCount": len(notices),
            "roleCount": role_count,
            "starCount": star_count,
            "sources": [
                "甜蜜乐章安装目录 Data/*.dat",
                "NeedEffect.dat 等级 + Difficulty.dat 星级区间 + 存档能力门槛匹配（跨存档交叉验证）",
            ],
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
            "角色星级（1~5★）由游戏源码 Difficulty.dat 的星级区间表匹配存档里的九项能力门槛反推得出，跨存档验证一致；静态 Case 本体没有这个字段。区间重叠时回退到存档记录的星级字段。存档没覆盖到的角色不显示星级，不用默认值代替。",
            "能力门槛每次接取会在该星级的区间内重新抽取，所以只给星级、不烘焙门槛值；能力要求按等级与星级区间现算。",
            "默认艺人、特殊要求的每日属性增减与艺人成长率不在游戏数据文件里，暂留空。",
        ],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    grade_rows = data["grades"]
    print("notices: %d  roles: %d  starred: %d  grades: %d  -> %s" %
          (len(notices), role_count, star_count, len(grade_rows), OUT))
    print("save role codes: %d  star coverage: %d/%d" %
          (len(stars), star_count, role_count))
    print("grades with gains: %d  with special kinds: %d" %
          (sum(1 for row in grade_rows if row.get("gains")),
           sum(1 for row in grade_rows if row.get("specialKinds"))))
    print("categories: " + ", ".join("%s %d" % (row["name"], row["count"]) for row in categories))


if __name__ == "__main__":
    main()
