#!/usr/bin/env python3
"""烘焙甜蜜乐章「筹备中通告」静态表到 public/data/sweet/case-tables.json。

真源是甜蜜乐章安装目录的 Data/*.dat：
- CaseClass.dat / RoleType.dat：通告大类 / 角色类型编号到繁体原文。
- Studio.dat + World.dat + StudioProduce.dat：制作公司。StudioProduce 每条
  `[seq][class][kind][studioId][...]`，当事人看到的公司名由 studioId 决定；
  21..30 是 World.dat 的城市名（id-20），按通告大类补「廣告 / 電視劇 /
  電影 / 唱片 / 主持 / 舞台劇 / 走秀」后缀。
- Length.dat：`[class/ subtype][role]` -> [工作天数, 每周上限]，与存档里的
  角色类型一起决定表格上的两枚胶囊。
- 各 XxxCase.dat：通告码 -> 名字（存档里也有名字，这份只做回查）。

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
# World.dat 公司（id 21..30）按通告大类补的后缀；Studio.dat 自带公司性质，不再补。
WORLD_SUFFIX = {
    1: "廣告", 2: "電視劇", 3: "電影", 4: "唱片",
    5: "主持", 6: "舞台劇", 7: "走秀",
}
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
    studios = load_names(os.path.join(data_dir, "Studio.dat"), 4, 28)
    world = load_names(os.path.join(data_dir, "World.dat"), 12, 20)
    companies = {key: value for key, value in studios.items()}
    for ident in range(21, 31):
        name = world.get(str(ident - 20), "")
        if name:
            companies[str(ident)] = name
    return companies


def load_company_by_seq(data_dir, companies):
    out = {}
    for rec in read_table(os.path.join(data_dir, "StudioProduce.dat")):
        seq, kind, _sub, studio_id = struct.unpack_from("<4I", rec, 0)
        base = companies.get(str(studio_id), "")
        if not base:
            continue
        # 21..30 是城市名，拼上大类后缀才是界面里的制作公司。
        if studio_id >= 21:
            base += WORLD_SUFFIX.get(kind, "")
        out[str(seq)] = base
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=DEFAULT_DATA)
    args = parser.parse_args()
    data = {
        "classes": load_names(os.path.join(args.data, "CaseClass.dat")),
        "roles": load_names(os.path.join(args.data, "RoleType.dat")),
        "companies": load_companies(args.data),
        "companyBySeq": load_company_by_seq(args.data, load_companies(args.data)),
        "lengths": load_lengths(args.data),
        "cases": load_cases(args.data),
        "subtypes": load_subtypes(args.data),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", OUT, "classes", len(data["classes"]), "roles", len(data["roles"]),
          "companies", len(data["companyBySeq"]), "lengths", len(data["lengths"]),
          "subtypes", len(data["subtypes"]))


if __name__ == "__main__":
    main()
