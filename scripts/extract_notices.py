#!/usr/bin/env python3
"""Build public/data/notices.json from the two 通告 spreadsheets.

    python scripts/extract_notices.py

Reads sources/notices/notices.xls (通告 + 角色 + 等级/成长率参照表) and
sources/notices/requirements.xlsx (特殊要求影响), and writes a single JSON the
web app fetches at runtime — same idea as guide.json, so content updates never
need a rebuild.

Unlike extract_guide.py this one needs two third-party readers:

    pip install openpyxl xlrd

They are only needed when regenerating the data, never to run the site.
"""

from __future__ import annotations

import io
import json
import os
import sys

try:
    import openpyxl  # type: ignore
    import xlrd  # type: ignore
except ImportError:  # pragma: no cover - friendly message instead of a traceback
    sys.exit("需要先安装依赖：pip install openpyxl xlrd")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTICES_XLS = os.path.join(ROOT, "sources", "notices", "notices.xls")
REQUIREMENTS_XLSX = os.path.join(ROOT, "sources", "notices", "requirements.xlsx")
OUT = os.path.join(ROOT, "public", "data", "notices.json")

ABILITIES = ["演技", "口才", "歌艺", "名气", "仪态", "动感", "体能", "才智", "自信"]
SPECIAL_KINDS = ["搞笑", "反串", "暴力", "反派", "裸露", "丑化", "吻戏"]

# 每个分类在 xls 里的列位置（按表头核对过）。电影/电视剧/广告 没有分组表头，数据从第 1 行开始；
# 唱片/主持 第 0 行是「特殊要求」分组，第 1 行才是表头。
SHEETS = {
    "movie": {
        "sheet": "电影", "name": "电影", "first": 1, "roles": "电影角色",
        "cols": {"id": 0, "name": 1, "type": 2, "producer": 3, "time": 4, "company": 5, "brief": 6},
    },
    "tv": {
        "sheet": "电视剧", "name": "电视剧", "first": 1, "roles": "电视剧角色",
        "cols": {"id": 0, "name": 1, "type": 2, "series": 3, "producer": 4, "time": 5,
                 "company": 6, "brief": 7},
    },
    "music": {
        "sheet": "唱片", "name": "唱片", "first": 2, "roles": None,
        "cols": {"id": 0, "name": 1, "type": 2, "producer": 3, "role": 4, "time": 5,
                 "difficulty": 6, "rebellion": 7, "sexy": 8, "affinity": 9,
                 "defaultArtist": 10, "company": 11, "brief": 12},
    },
    "ad": {
        "sheet": "广告", "name": "广告", "first": 1, "roles": "广告角色",
        "cols": {"id": 0, "name": 1, "kindLabel": 2, "level": 3, "time": 4, "company": 5,
                 "adType": 6, "exclusive": 7, "brief": 8},
    },
    "show": {
        "sheet": "主持", "name": "主持", "first": 2, "roles": None,
        "cols": {"id": 0, "name": 1, "type": 2, "role": 3, "producer": 4, "time": 5,
                 "difficulty": 6, "specialKind": 7, "rebellion": 8, "sexy": 9,
                 "affinity": 10, "defaultArtist": 11, "company": 12, "brief": 13},
    },
}

ROLE_SHEETS = {
    "movie": {"sheet": "电影角色", "cols": {"id": 0, "notice": 1, "name": 4, "difficulty": 5,
                                            "specialKind": 6, "rebellion": 7, "sexy": 8,
                                            "affinity": 9, "gains": (10, ["仪态", "动感", "体能", "才智", "自信"]),
                                            "defaultArtist": 15, "brief": 16}},
    "tv": {"sheet": "电视剧角色", "cols": {"id": 0, "notice": 1, "name": 7, "difficulty": 8,
                                          "specialKind": 9, "rebellion": 10, "sexy": 11,
                                          "affinity": 12, "gains": (13, ["仪态", "动感", "体能", "才智", "自信"]),
                                          "defaultArtist": 18, "brief": 19}},
    "ad": {"sheet": "广告角色", "cols": {"id": 0, "notice": 1, "name": 7, "difficulty": 8,
                                         "specialKind": 9, "rebellion": 10, "sexy": 11,
                                         "affinity": 12, "defaultArtist": 13, "brief": 14}},
}


def text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    return str(value).strip()


def number(value):
    """Numbers arrive as floats from xlrd. Return an int when integral, else the
    float, and None for blanks / junk so the JSON stays clean."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else round(float(value), 2)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        parsed = float(raw)
    except ValueError:
        return None
    return int(parsed) if parsed.is_integer() else round(parsed, 2)


def split_specials(raw: str) -> list[str]:
    """「暴力反派」「反串搞笑丑化」这类复合标签拆成基本项。"""
    found = []
    rest = raw
    for kind in SPECIAL_KINDS:
        if kind in rest:
            found.append((rest.index(kind), kind))
            rest = rest.replace(kind, "")
    return [kind for _, kind in sorted(found)]


def role_from_cells(cells: dict) -> dict:
    special_kinds = split_specials(text(cells.get("specialKind")))
    special = {}
    for key in ("rebellion", "sexy", "affinity"):
        value = number(cells.get(key))
        if value is not None:
            special[key] = value
    role = {}
    if text(cells.get("id")):
        role["id"] = text(cells.get("id"))
    role["name"] = text(cells.get("name")) or text(cells.get("role"))
    difficulty = number(cells.get("difficulty"))
    if difficulty is not None:
        role["difficulty"] = difficulty
    if special_kinds:
        role["specialKinds"] = special_kinds
    if special:
        role["special"] = special
    gains = {}
    for ability, value in (cells.get("gains") or {}).items():
        parsed = number(value)
        if parsed is not None:
            gains[ability] = parsed
    if gains:
        role["gains"] = gains
    artist = text(cells.get("defaultArtist"))
    if artist:
        role["defaultArtist"] = artist
    brief = text(cells.get("brief"))
    if brief:
        role["brief"] = brief
    return role


def main() -> None:
    book = xlrd.open_workbook(NOTICES_XLS)
    notices: list[dict] = []
    categories: list[dict] = []
    seen = set()

    for key, spec in SHEETS.items():
        sheet = book.sheet_by_name(spec["sheet"])
        cols = spec["cols"]
        count = 0
        for row in range(spec["first"], sheet.nrows):
            get = lambda name: sheet.cell_value(row, cols[name]) if name in cols else ""
            notice_id = text(get("id"))
            if not notice_id:
                continue
            if notice_id in seen:  # 同一编号重复出现时保留第一条
                continue
            seen.add(notice_id)
            notice = {"id": notice_id, "cat": key, "name": text(get("name"))}
            for field in ("type", "series", "producer", "time", "company", "brief",
                          "level", "kindLabel", "adType"):
                value = text(get(field))
                if value:
                    notice[field] = value
            exclusive = text(get("exclusive"))
            if exclusive and exclusive != "-":
                notice["exclusive"] = True
            # 唱片 / 主持 没有角色表：通告行本身就是唯一的「征求对象」。
            if spec["roles"] is None:
                role = role_from_cells({
                    "role": text(get("role")),
                    "difficulty": get("difficulty"),
                    "specialKind": get("specialKind"),
                    "rebellion": get("rebellion"),
                    "sexy": get("sexy"),
                    "affinity": get("affinity"),
                    "defaultArtist": get("defaultArtist"),
                })
                notice["roles"] = [role] if role.get("name") else []
            notice["_order"] = len(notices)
            notices.append(notice)
            count += 1
        categories.append({"key": key, "name": spec["name"], "count": count})

    # 角色表回填：电影 / 电视剧 / 广告
    by_id = {notice["id"]: notice for notice in notices}
    for key, spec in ROLE_SHEETS.items():
        sheet = book.sheet_by_name(spec["sheet"])
        cols = spec["cols"]
        for row in range(2, sheet.nrows):
            notice_id = text(sheet.cell_value(row, cols["notice"]))
            if not notice_id:
                continue
            notice = by_id.get(notice_id)
            if notice is None:  # 数据缺失时跳过，不凭空造通告
                continue
            cells = {name: sheet.cell_value(row, index) for name, index in cols.items()
                     if isinstance(index, int) and name != "gains"}
            gains_start, gain_cols = cols.get("gains", (None, []))
            if gains_start is not None:
                cells["gains"] = {ability: sheet.cell_value(row, gains_start + offset)
                                  for offset, ability in enumerate(gain_cols)}
            notice.setdefault("roles", []).append(role_from_cells(cells))

    # 参照表：类型 × 征求对象 → 能力等级 + 每日成长
    grades = []
    grade_sheet = book.sheet_by_name("能力要求&影响")
    for row in range(2, grade_sheet.nrows):
        type_name = text(grade_sheet.cell_value(row, 0))
        if not type_name:
            continue
        entry = {"type": type_name, "role": text(grade_sheet.cell_value(row, 1))}
        levels = {}
        for offset, ability in enumerate(ABILITIES):
            level = text(grade_sheet.cell_value(row, 2 + offset))
            if level:
                levels[ability] = level
        if levels:
            entry["grades"] = levels
        gains = {}
        for offset, ability in enumerate(ABILITIES):
            value = number(grade_sheet.cell_value(row, 11 + offset))
            if value is not None:
                gains[ability] = value
        if gains:
            entry["gains"] = gains
        grades.append(entry)

    # 难度对照：等级字母 × 星数 → 具体区间
    scale = []
    scale_sheet = book.sheet_by_name("说明")
    for row in range(3, 8):
        label = text(scale_sheet.cell_value(row, 0))
        if not label:
            continue
        ranges = {}
        for offset, grade in enumerate(["A", "B", "C", "D"]):
            value = text(scale_sheet.cell_value(row, 1 + offset))
            if value:
                ranges[grade] = value
        scale.append({"stars": row - 2, "label": label, "ranges": ranges})

    # 艺人成长率
    growth = []
    growth_sheet = book.sheet_by_name("能力成长率")
    growth_cols = [text(growth_sheet.cell_value(1, column)) for column in range(1, 10)]
    for row in range(2, growth_sheet.nrows):
        artist = text(growth_sheet.cell_value(row, 0))
        if not artist:
            continue
        entry = {"artist": artist, "values": {}}
        for offset, ability in enumerate(growth_cols):
            value = number(growth_sheet.cell_value(row, 1 + offset))
            if value is not None:
                entry["values"][ability] = value
        total = number(growth_sheet.cell_value(row, 10))
        if total is not None:
            entry["total"] = total
        growth.append(entry)

    # 特殊要求影响（只在 xlsx 里）
    specials = []
    workbook = openpyxl.load_workbook(REQUIREMENTS_XLSX, data_only=True)
    sheet = workbook["特殊要求影响"]
    for row in range(3, sheet.max_row + 1):
        kind = text(sheet.cell(row=row, column=2).value)
        if not kind:
            continue
        entry = {"kind": kind}
        for column, field in ((3, "affinity"), (4, "rebellion"), (5, "sexy")):
            value = number(sheet.cell(row=row, column=column).value)
            if value is not None:
                entry[field] = value
        note = text(sheet.cell(row=row, column=6).value)
        if note:
            entry["note"] = note
        specials.append(entry)

    for notice in notices:
        notice.pop("_order", None)
        roles = notice.get("roles") or []
        if not roles:
            notice.pop("roles", None)

    payload = {
        "meta": {
            "noticeCount": len(notices),
            "roleCount": sum(len(notice.get("roles") or []) for notice in notices),
            "sources": ["sources/notices/notices.xls", "sources/notices/requirements.xlsx"],
            "generatedBy": "scripts/extract_notices.py",
        },
        "abilities": ABILITIES,
        "categories": categories,
        "notices": notices,
        "grades": grades,
        "scale": scale,
        "specialEffects": specials,
        "growth": growth,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    size = os.path.getsize(OUT) / 1024
    print(f"notices: {len(notices)}  roles: {payload['meta']['roleCount']}  "
          f"grades: {len(grades)}  growth: {len(growth)}  -> {OUT} ({size:.0f} KB)")
    for category in categories:
        print(f"  {category['name']}: {category['count']}")


if __name__ == "__main__":
    main()
