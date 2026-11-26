"""从甜蜜乐章安装目录烘焙称号表，供存档解析页的 hover 提示使用。

和主站 Nickname.tab 编号体系相同，但甜蜜乐章的 Nickname.dat 多了舞台剧 /
走秀 / 演唱会门槛，部分作品数量也不同，不能直接复用 case-tables.json。
"""
import json
import os
import struct

from build_case_tables import simplify_title

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME_DATA = os.path.join(
    "D:\\Program Files (x86)\\Softstar\\Stardom3 - Sweet Melody", "Data"
)
SOURCE = os.path.join(GAME_DATA, "Nickname.dat")
MAIN_TABLE = os.path.join(ROOT, "public", "data", "case-tables.json")
OUT = os.path.join(ROOT, "public", "data", "sweet", "title-meta.json")

# 甜蜜乐章记录 172B：+28 性别、+32 媒介位，其余门槛比主站提前 4B，
# 并在作品总数前多出舞台剧 / 走秀两列，总数后还有演唱会一列。
TAG_NUM = {0: "0", 1: "CF", 2: "TV", 3: "MV", 4: "CD", 5: "SH"}
ATTR_COLS = [
    (36, "演技"), (40, "口才"), (44, "歌艺"), (48, "名气"), (52, "仪态"),
    (56, "动感"), (60, "体能"), (64, "才智"), (68, "自信"), (72, "叛逆"),
    (76, "性感"), (80, "亲和"), (84, "人气"), (88, "曝光"),
]
WORK_COLS = [
    (100, "电视作品"), (104, "电影作品"), (108, "专辑"), (112, "广告"),
    (116, "节目"), (120, "舞台剧"), (124, "走秀"), (128, "作品总数"),
    (132, "演唱会"),
]


def big5(raw):
    return raw.split(b"\x00")[0].decode("big5", "replace")


def main():
    main_data = json.load(open(MAIN_TABLE, encoding="utf-8"))
    main_meta = main_data["titleMeta"]
    main_titles = main_data["titles"]
    raw = open(SOURCE, "rb").read()
    count, size = struct.unpack_from("<ii", raw, 4)
    if 12 + count * size != len(raw) or size != 172:
        raise SystemExit("unexpected Nickname.dat layout: %d x %d / %d" % (count, size, len(raw)))

    titles, meta = {}, {}
    for i in range(count):
        rec = raw[12 + i * size:12 + (i + 1) * size]
        tid = struct.unpack_from("<i", rec, 0)[0]
        name = big5(rec[4:24])
        if tid <= 0 or not name:
            continue
        key = str(tid)
        simplified = simplify_title(name)
        titles[key] = simplified
        donor_key = next((k for k, v in main_titles.items() if v == simplified), None)
        base = main_meta.get(key) or (main_meta.get(donor_key, {}) if donor_key else {})
        tag_num = struct.unpack_from("<i", rec, 32)[0]
        tag = base.get("tag") or TAG_NUM.get(tag_num, str(tag_num))
        # 同名媒介版先到先得，和主站烘焙脚本一致；通用版不覆盖专属版。
        if key in meta and meta[key]["tag"] != "0":
            continue
        need = []
        for off, label in ATTR_COLS + WORK_COLS:
            value = struct.unpack_from("<i", rec, off)[0]
            if value > 0:
                need.append([label, value])
        rank = base.get("rank")
        if rank is None:
            rank = main_meta.get(str(423), {}).get("rank")
        meta[key] = {
            "line": base.get("line") or ("screen" if tag == "TV" else "other"),
            "tag": tag,
            "sex": base.get("sex", struct.unpack_from("<i", rec, 28)[0]),
            "need": need,
            "rank": rank,
        }

    payload = {"titles": titles, "titleMeta": meta}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print("sweet titles %d (%d with meta) -> %s" % (len(titles), len(meta), OUT))


if __name__ == "__main__":
    main()
