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
import json
import os
import re
import struct
import sys

DEFAULT_DATA = r"D:\Program Files (x86)\dayuzixun\mxzy3\tw\data"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "public", "data", "case-tables.json")
CASE_FILES = ("CDCase.dat", "CFCase.dat", "MVCase.dat", "TVCase.dat", "SHCase.dat",
              "FSCase.dat", "THCase.dat", "SpecialCase.dat")
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


def load_cases(data_dir):
    """Notice code -> [name, type, subtype, company].

    The long plot description is left out: the reader tab is about the rolled
    numbers, and dropping it keeps the bundled JSON small. The 通告 tab already
    carries the full static notice details.
    """
    out = {}
    for filename in CASE_FILES:
        path = os.path.join(data_dir, filename)
        if not os.path.isfile(path):
            continue
        for rec in read_table(path):
            code = rec[:5].decode("ascii", "replace")
            if len(code) != 5 or not code[:2].isalpha() or not CODE_RE.fullmatch(code[2:]):
                continue
            parts = text_segments(rec)
            out[code] = parts[1:5]
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


def load_length(data_dir):
    """`notice kind|role` -> [工作天数, 每週上限].

    Length.tab: 4-byte id, the kind and role Big5 strings packed into bytes
    4..24, then three ints at 24 / 28 / 32. The last one is 工作天數 (唱片 25 天、
    電影 40 天), the middle one is 每週可排上限 (5 天，主持类 2~3 天).
    """
    records = read_table(os.path.join(data_dir, "Length.tab"))
    out = {}
    for rec in records:
        parts = [m.group().decode("big5", "replace")
                 for m in re.finditer(rb"[^\x00]+", rec[4:24])]
        if len(parts) < 2:
            continue
        _x, per_week, days = struct.unpack_from("<III", rec, 24)
        if not days or not per_week:
            continue
        out[parts[0] + "|" + parts[1]] = [days, per_week]
    return out


def load_difficulty(data_dir):
    """Star 1..5 -> [[A lo, hi], [B lo, hi], [C lo, hi], [D lo, hi]]."""
    records = read_table(os.path.join(data_dir, "Difficulty.tab"))
    out = []
    for rec in records:
        v = [struct.unpack_from("<I", rec, 4 * j)[0] for j in range(8)]
        out.append([[v[0], v[1]], [v[2], v[3]], [v[4], v[5]], [v[6], v[7]]])
    return out


def load_stars(data_dir):
    """艺人编号 -> [名字, 性别]（性别 1=男 0=女）。

    来源 StarRole.dat：每条 360 字节，名字在记录 +4 的 Big5 串里，性别在 +24。
    编号就是存档里艺人状态块 -16 处的那个 id，也与团队记录的成员编号一致。
    繁中三合一装的是旧版文件（只有 1..75 号），资料片新增的卫亚(76)、原少纬(77)
    在文件里没有记录 —— 76 由存档里「签约 + 团体成员 + 接下男主角」三处对得上，
    77 按角色表的相邻顺序补上。
    """
    path = os.path.join(data_dir, "StarRole.dat")
    if not os.path.isfile(path):
        return {}
    out = {}
    for i, rec in enumerate(read_table(path)):
        # 名字是定长字段，后面可能接着别的数据 —— 取到第一个 NUL 为止。
        name = big5(rec[4:40].split(b"\x00")[0])
        # 75 号是「千萬不要用」占位记录，不能当人名显示。
        if i and name and "不要用" not in name:
            out[str(i)] = [name, struct.unpack_from("<I", rec, 24)[0] and 1 or 0]
    out.setdefault("76", ["衛亞", 1])
    out.setdefault("77", ["原少緯", 1])
    return out


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DEFAULT_DATA, help="game data directory")
    args = ap.parse_args()
    if not os.path.isdir(args.data):
        print("game data directory not found: " + args.data, file=sys.stderr)
        return 1

    payload = {
        "source": "明星志愿3 繁中三合一（tw）",
        "cases": load_cases(args.data),
        "needEffect": load_need_effect(args.data),
        "length": load_length(args.data),
        "difficulty": load_difficulty(args.data),
        "stars": load_stars(args.data),
        "firms": load_firms(args.data),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print("cases        %d" % len(payload["cases"]))
    print("needEffect   %d" % len(payload["needEffect"]))
    print("length       %d" % len(payload["length"]))
    print("difficulty   %d stars" % len(payload["difficulty"]))
    print("stars        %d" % len(payload["stars"]))
    print("firms        %d" % len(payload["firms"]))
    print("written      %s (%d bytes)" % (OUT, os.path.getsize(OUT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
