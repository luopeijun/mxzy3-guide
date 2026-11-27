# -*- coding: utf-8 -*-
"""把攻略 `sources/self-made.txt` 烘成 `public/data/selfmade.json`。

源文件是按「艺人 → 作品名－条件」手写的，这里只做结构化：
作品名、所属 section（歌曲 / 剧本）、艺人、条件原文、能解析出来的数值门槛，
以及作品名对上的通告编码（查 `public/data/case-tables.json` 的 cases 表）。

编码对不上就留 null：页面仍然列出这条作品和它的条件，只是没法按存档打勾。
不做任何猜测，改名 / 错字走下面的 ALIASES，改一个记一个。
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "sources", "self-made.txt")
NOTICES = os.path.join(ROOT, "public", "data", "notices.json")
CASES = os.path.join(ROOT, "public", "data", "case-tables.json")
OUT = os.path.join(ROOT, "public", "data", "selfmade.json")

# 攻略里的写法 -> 游戏静态表里的名字（错字 / 少字 / 繁简差异）。
ALIASES = {
    "阿妈的肉棕": "阿妈的肉粽",
    "夏之夜不可思议": "夏之夜不思议",
    "恋爱的十字街": "恋爱十字街",
}

ATTRS = ["演技", "口才", "歌艺", "名气", "仪态", "动感", "体能", "才智", "自信"]

# 条件里除了九项属性，还能从存档直接比的两个数。
FRIEND_RE = re.compile(r"友好度\s*(?:大于|>|超過|超过|≥)\s*(\d{1,4})")
GIFT_RE = re.compile(r"(?:赠送|送)(?:喜欢的物品|礼物)?\s*(?:大于|>|超過|超过)\s*(\d{1,3})\s*件")
ATTR_RE = re.compile(r"(%s)\s*(\d{2,4})" % "|".join(ATTRS))
ANNOTATION_RE = re.compile(r"[（(]([^）)]*)[）)]")


def normalise(name: str) -> str:
    """比对用的键：去掉括号注释、空格、连字符与冒号，再转小写。"""
    name = ANNOTATION_RE.sub("", name)
    name = name.replace(":", "").replace("：", "")
    return re.sub(r"[\s\-·]", "", name).lower()


def section_key(title: str) -> str:
    if "剧本" in title:
        return "script"
    return "song"


def parse_thresholds(condition: str) -> list[dict]:
    """条件里能直接算差的数值：九项属性 / 友好度 / 赠送件数。"""
    out: list[dict] = []
    for label, value in ATTR_RE.findall(condition):
        out.append({"label": label, "value": int(value), "kind": "attr"})
    match = FRIEND_RE.search(condition)
    if match:
        out.append({"label": "友好度", "value": int(match.group(1)), "kind": "friendship"})
    match = GIFT_RE.search(condition)
    if match:
        out.append({"label": "赠送件数", "value": int(match.group(1)), "kind": "gifts"})
    return out


def main() -> None:
    # 作品名 -> 编码优先用 notices.json：它的名字已经是简体，跟攻略表同一套写法。
    # case-tables.json 里的名字是 Big5 繁体原文，只在 notices 里查不到时兜底。
    by_name: dict[str, str] = {}
    with open(NOTICES, encoding="utf-8") as handle:
        for notice in json.load(handle)["notices"]:
            by_name.setdefault(normalise(notice["name"]), notice["id"])
    with open(CASES, encoding="utf-8") as handle:
        cases = json.load(handle)["cases"]
    for code, row in cases.items():
        if row and row[0]:
            by_name.setdefault(normalise(row[0]), code)

    with open(SRC, encoding="utf-8") as handle:
        lines = [raw.strip() for raw in handle.read().splitlines()]

    sections: list[dict] = []
    entries: list[dict] = []
    current_section = "song"
    current_artist = "其他"
    pending_note = ""

    for line in lines:
        if not line:
            continue
        if line.startswith("★"):
            rest = line.lstrip("★").strip()
            if "部分" in rest:
                current_section = section_key(rest)
                current_artist = "其他"
                note = ""
                # 「★歌曲部分（满足条件后需安排自由活动大于20天）」括号里是补充说明。
                match = ANNOTATION_RE.search(rest)
                if match:
                    note = match.group(1).strip()
                sections.append({
                    "key": current_section,
                    "name": re.sub(ANNOTATION_RE, "", rest).strip(),
                    "note": note,
                })
            else:
                pending_note = rest
            continue

        match = re.match(r"^(.+?)[－-](.+)$", line)
        if match:
            raw_name = match.group(1).strip()
            condition = match.group(2).strip()
            annotations = [a.strip() for a in ANNOTATION_RE.findall(raw_name)]
            name = ANNOTATION_RE.sub("", raw_name).strip()
            lookup = ALIASES.get(name, name)
            entries.append({
                "section": current_section,
                "artist": current_artist,
                "name": name,
                "code": by_name.get(normalise(lookup)),
                "condition": condition,
                "thresholds": parse_thresholds(condition),
                "note": "；".join(a for a in annotations if a),
            })
            continue

        # 没有连字符的是艺人小标题（「其他」也在里面）。
        current_artist = ANNOTATION_RE.sub("", line).strip()

    if not sections:
        sections = [{"key": "song", "name": "歌曲", "note": ""}]

    counts = {s["key"]: 0 for s in sections}
    for entry in entries:
        counts[entry["section"]] = counts.get(entry["section"], 0) + 1

    payload = {
        "meta": {
            "source": "sources/self-made.txt",
            "count": len(entries),
            "coded": sum(1 for entry in entries if entry["code"]),
            "note": pending_note,
        },
        "sections": sections,
        "entries": entries,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print("sections     %d" % len(sections))
    print("entries      %d (%d with code)" % (len(entries), payload["meta"]["coded"]))
    missing = [f'{e["artist"]}/{e["name"]}' for e in entries if not e["code"]]
    print("no code      %d %s" % (len(missing), missing))


if __name__ == "__main__":
    main()
