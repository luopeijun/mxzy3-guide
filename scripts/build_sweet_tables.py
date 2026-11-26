#!/usr/bin/env python3
"""烘焙甜蜜乐章静态表到 public/data/sweet/star-roles.json。

来源 StarRole.dat：文件头 [magic=0x3f2][count=111][size=376] + 定长记录；
名字在记录 +20 的 NUL 结尾 Big5 串。编号即存档艺人属性块里的 id。

用法：
    python scripts/build_sweet_tables.py [--data <game data dir>]
"""

import argparse
import json
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = r"D:\Program Files (x86)\Softstar\Stardom3 - Sweet Melody\Data"
OUT = os.path.join(ROOT, "public", "data", "sweet", "star-roles.json")


def load_stars(data_dir):
    path = os.path.join(data_dir, "StarRole.dat")
    with open(path, "rb") as f:
        raw = f.read()
    magic, count, size = struct.unpack_from("<III", raw, 0)
    if magic != 0x3F2 or 12 + count * size != len(raw):
        raise SystemExit("unexpected StarRole.dat layout")
    stars = {}
    for i in range(count):
        rec = raw[12 + i * size:12 + (i + 1) * size]
        name = rec[20:60].split(b"\x00")[0].decode("big5", "replace")
        if not name:
            continue
        # 性别字段位置尚未确认（+8 是别的编号），第一步只烘焙名字，避免放入错值。
        stars[str(i)] = name
    return stars


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=DEFAULT_DATA)
    args = parser.parse_args()
    stars = load_stars(args.data)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"stars": stars}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", OUT, "stars", len(stars))


if __name__ == "__main__":
    main()
