#!/usr/bin/env python3
"""Regression checks for public/data/notices.json.

    python -m unittest scripts/test_notices.py -v

Only the standard library is required. When openpyxl is installed the test also
cross-checks the derived requirement ranges against the original spreadsheet:
every (类型, 对象, 能力) pair must land on exactly the same numbers.
"""

from __future__ import annotations

import io
import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data", "notices.json")
XLSX = os.path.join(ROOT, "sources", "notices", "requirements.xlsx")

ABILITIES = ["演技", "口才", "歌艺", "名气", "仪态", "动感", "体能", "才智", "自信"]
CATEGORY_KEYS = ["movie", "tv", "music", "ad", "show"]


def load() -> dict:
    with io.open(DATA, encoding="utf-8") as handle:
        return json.load(handle)


class NoticeDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = load()
        cls.notices = cls.data["notices"]
        cls.by_id = {notice["id"]: notice for notice in cls.notices}

    def test_categories(self) -> None:
        self.assertEqual([row["key"] for row in self.data["categories"]], CATEGORY_KEYS)
        for category in self.data["categories"]:
            counted = len([notice for notice in self.notices if notice["cat"] == category["key"]])
            self.assertEqual(category["count"], counted, category["key"])

    def test_notice_count_matches_meta(self) -> None:
        self.assertEqual(self.data["meta"]["noticeCount"], len(self.notices))
        self.assertEqual(len(self.by_id), len(self.notices), "通告编号应唯一")
        self.assertGreater(len(self.notices), 1500)

    def test_every_notice_has_a_role(self) -> None:
        # 唱片/主持 的角色由通告行本身合成，电影/电视剧/广告 来自角色表；
        # 任何一条没有角色都说明回填出了问题。
        empty = [notice["id"] for notice in self.notices if not notice.get("roles")]
        self.assertEqual(empty, [])

    def test_roles_keep_their_difficulty(self) -> None:
        for notice in self.notices:
            for role in notice["roles"]:
                self.assertIn("difficulty", role, f"{notice['id']} {role.get('name')}")
                self.assertTrue(1 <= role["difficulty"] <= 5, f"{notice['id']} {role['difficulty']}")

    def test_scale_covers_every_grade(self) -> None:
        self.assertEqual([row["stars"] for row in self.data["scale"]], [1, 2, 3, 4, 5])
        for row in self.data["scale"]:
            self.assertEqual(sorted(row["ranges"]), ["A", "B", "C", "D"], row["label"])

    def test_grades_use_known_abilities(self) -> None:
        for row in self.data["grades"]:
            self.assertTrue(row["grades"], row["type"])
            for ability, grade in row["grades"].items():
                self.assertIn(ability, ABILITIES)
                self.assertIn(grade, ["A", "B", "C", "D"])

    def test_special_kinds_are_known(self) -> None:
        known = {row["kind"] for row in self.data["specialEffects"]}
        for notice in self.notices:
            for role in notice["roles"]:
                for kind in role.get("specialKinds", []):
                    self.assertIn(kind, known, f"{notice['id']} {kind}")

    def test_growth_table_is_complete(self) -> None:
        self.assertEqual(len(self.data["growth"]), 18)
        for row in self.data["growth"]:
            self.assertEqual(len(row["values"]), len(ABILITIES), row["artist"])

    def test_known_notice_shape(self) -> None:
        movie = self.by_id["MV001"]
        self.assertEqual(movie["name"], "舞动人生")
        self.assertEqual(movie["type"], "歌舞音乐片")
        names = [role["name"] for role in movie["roles"]]
        self.assertEqual(names, ["男主角", "女主角", "男配角", "女配角"])
        advert = self.by_id["CF001"]
        self.assertEqual(advert["level"], "演技B")
        music = self.by_id["CD002"]
        self.assertEqual(music["roles"][0]["name"], "团体")

    def test_derived_ranges_match_the_spreadsheet(self) -> None:
        try:
            import openpyxl  # type: ignore
        except ImportError:
            self.skipTest("openpyxl 未安装，跳过与原表的交叉核对")

        scale = {row["stars"]: row["ranges"] for row in self.data["scale"]}
        workbook = openpyxl.load_workbook(XLSX, data_only=True)
        pairs = {}
        for sheet_name in ["电影", "电视剧", "唱片", "广告", "主持"]:
            sheet = workbook[sheet_name]
            header_row = None
            for row in range(1, 6):
                values = [sheet.cell(row=row, column=column).value for column in range(2, 12)]
                if "演技" in [str(value).strip() if value else "" for value in values]:
                    header_row = row
                    break
            self.assertIsNotNone(header_row, sheet_name)
            columns = {}
            for column in range(2, sheet.max_column + 1):
                value = sheet.cell(row=header_row, column=column).value
                name = str(value).strip() if value else ""
                # 第一组是能力要求，后面的「能力影响」重复了同名表头，不能覆盖。
                if name in ABILITIES and name not in columns:
                    columns[name] = column
            current = None
            role = ""
            for row in range(header_row + 1, sheet.max_row + 1):
                type_value = sheet.cell(row=row, column=2).value
                role_value = sheet.cell(row=row, column=3).value
                if type_value:
                    current = str(type_value).strip()
                if role_value and str(role_value).strip() in ("主角", "配角", "主持人", "助理主持", "外景主持"):
                    role = str(role_value).strip()
                if not current:
                    continue
                cells = {}
                for ability, column in columns.items():
                    value = sheet.cell(row=row, column=column).value
                    if value and "☆" in str(value):
                        cells[ability] = str(value)
                if cells:
                    pairs[(current, role)] = cells

        checked = 0
        for (type_name, role_name), abilities in pairs.items():
            grade_row = next(
                (
                    row
                    for row in self.data["grades"]
                    if row["type"] == type_name
                    and (row["role"] == role_name or not row["role"])
                ),
                None,
            )
            if grade_row is None:
                continue
            for ability, cell in abilities.items():
                grade = grade_row["grades"].get(ability)
                if not grade:
                    continue
                for line in cell.split("\n"):
                    match = re.match(r"\s*(☆+)\s+(\d+-\d+)", line)
                    if not match:
                        continue
                    stars = len(match.group(1))
                    expected = match.group(2)
                    checked += 1
                    self.assertEqual(
                        scale[stars].get(grade),
                        expected,
                        f"{type_name}/{role_name}/{ability} 第 {stars} 星",
                    )
        self.assertGreater(checked, 1000)


if __name__ == "__main__":
    unittest.main()
