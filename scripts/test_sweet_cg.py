"""`scripts/extract_sweet_cg.py` 的守护测试。

甜蜜乐章 CG 只有编号、没有名称 / 获得条件，且图片是用户一张一张发来的：
这里锁住「提交的 cg.json 与脚本按源目录重算的结果完全一致」以及分组、
编号、图片路径的约定，避免手改 JSON 后下次生成被悄悄回退。

跑法（用项目 venv 的 Python）：
    python scripts/test_sweet_cg.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import extract_sweet_cg as esc  # noqa: E402

ROOT = HERE.parent
CG_JSON = ROOT / "public" / "data" / "sweet" / "cg.json"


def payload() -> dict:
    groups = esc.build_groups()
    return esc.build_payload(groups, esc.scan_sources(groups))


class SweetCgTests(unittest.TestCase):
    def test_committed_json_matches_pipeline(self):
        expected = json.dumps(payload(), ensure_ascii=False, indent=2) + "\n"
        committed = CG_JSON.read_bytes().decode("utf-8").replace("\r\n", "\n")
        self.assertEqual(committed, expected)

    def test_meta_counts_agree_with_items(self):
        data = payload()
        meta = data["meta"]
        self.assertEqual(meta["itemCount"], len(data["items"]))
        self.assertEqual(meta["groupCount"], len(data["groups"]))
        self.assertEqual(
            meta["missingImageCount"],
            sum(1 for item in data["items"] if item["image"] is None),
        )
        for group in data["groups"]:
            self.assertEqual(
                group["count"],
                sum(1 for item in data["items"] if item["groupId"] == group["id"]),
            )

    def test_groups_come_from_guide_with_protagonist_first(self):
        data = payload()
        guide = json.loads(esc.read_text(esc.GUIDE_DATA))
        category = next(
            entry for entry in guide["categories"]
            if entry["id"] == esc.CHARACTER_CATEGORY
        )
        characters = [node for node in category["children"] if node.get("avatar")]

        self.assertEqual(len(data["groups"]), 1 + len(characters))
        first = data["groups"][0]
        self.assertEqual(first["id"], "protagonist")
        self.assertEqual(first["name"], "杜云芊")
        self.assertEqual(first["kind"], "agent")
        self.assertEqual(first["avatar"], "images/sweet/protagonist-logo.png")
        for group, node in zip(data["groups"][1:], characters):
            self.assertEqual(group["id"], node["id"].rsplit("/", 1)[-1])
            self.assertEqual(group["name"], node["title"])
            self.assertEqual(group["avatar"], node["avatar"])
            self.assertEqual(group["guideId"], node["id"])
            self.assertEqual(group["kind"], "artist")
        ids = [group["id"] for group in data["groups"]]
        self.assertEqual(len(ids), len(set(ids)))
        for group in data["groups"]:
            self.assertTrue((ROOT / "public" / group["avatar"]).is_file(), group["avatar"])

    def test_items_are_number_only(self):
        data = payload()
        group_ids = {group["id"] for group in data["groups"]}
        seen: set[str] = set()
        for order, item in enumerate(data["items"], start=1):
            self.assertEqual(
                set(item),
                {"id", "groupId", "order", "code", "name", "condition",
                 "image", "width", "height"},
            )
            self.assertEqual(item["order"], order)
            self.assertEqual(item["name"], "")
            self.assertEqual(item["condition"], "")
            self.assertEqual(item["width"], 0)
            self.assertEqual(item["height"], 0)
            self.assertNotIn("guide", item)
            self.assertIn(item["groupId"], group_ids)
            self.assertEqual(item["id"], f"{item['groupId']}-{item['code']}")
            self.assertEqual(
                item["image"],
                f"images/sweet-cg/{item['groupId']}/{item['code']}.webp",
            )
            self.assertNotIn(item["id"], seen)
            seen.add(item["id"])

    def test_generated_images_match_items(self):
        """No stale webp left behind after a full rebuild."""
        data = payload()
        expected = {
            ROOT / "public" / item["image"] for item in data["items"]
        }
        for path in expected:
            self.assertTrue(path.is_file(), str(path))
        actual = set((ROOT / "public" / "images" / "sweet-cg").glob("*/*.webp")) \
            if (ROOT / "public" / "images" / "sweet-cg").is_dir() else set()
        self.assertEqual(actual, expected)

    def test_natural_number_order(self):
        codes = ["10", "2", "1", "1-2", "1-10", "20", "3"]
        self.assertEqual(
            sorted(codes, key=esc.natural_key),
            ["1", "1-2", "1-10", "2", "3", "10", "20"],
        )

    def test_unknown_group_folder_is_rejected(self):
        groups = esc.build_groups()
        original = esc.SRC
        with tempfile.TemporaryDirectory() as tmp:
            esc.SRC = Path(tmp) / "sweet-cg"
            (esc.SRC / "not-a-character").mkdir(parents=True)
            with self.assertRaises(SystemExit) as caught:
                esc.scan_sources(groups)
            self.assertIn("unknown CG group folder", str(caught.exception))
        esc.SRC = original

    def test_duplicate_code_is_rejected(self):
        groups = esc.build_groups()
        original = esc.SRC
        with tempfile.TemporaryDirectory() as tmp:
            esc.SRC = Path(tmp) / "sweet-cg"
            folder = esc.SRC / "protagonist"
            folder.mkdir(parents=True)
            (folder / "1.bmp").write_bytes(b"x")
            (folder / "1.png").write_bytes(b"x")
            with self.assertRaises(SystemExit) as caught:
                esc.scan_sources(groups)
            self.assertIn("share the code", str(caught.exception))
        esc.SRC = original


if __name__ == "__main__":
    unittest.main()
