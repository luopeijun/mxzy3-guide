"""`scripts/extract_sweet_cg.py` 的守护测试。

甜蜜乐章的 CG 图片是用户一张一张发来的，编号与顺序都由管线算出来：
这里锁住「提交的 cg.json 与脚本按源目录重算的结果完全一致」以及分组、
编号、图片路径、名称（= 对应攻略事件标题）的约定，避免手改 JSON 后下次
生成被悄悄回退。

跑法（用项目 venv 的 Python）：
    python scripts/test_sweet_cg.py
"""

from __future__ import annotations

import json
import re
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
    items, _ = esc.scan_sources(groups)
    return esc.build_payload(groups, items)


class SweetCgTests(unittest.TestCase):
    def test_committed_json_matches_pipeline(self):
        expected = json.dumps(payload(), ensure_ascii=False, indent=2) + "\n"
        committed = CG_JSON.read_bytes().decode("utf-8").replace("\r\n", "\n")
        self.assertEqual(committed, expected)

    def test_meta_counts_agree_with_items(self):
        data = payload()
        meta = data["meta"]
        # itemCount 是「唯一可收集张数」：共享 CG 只算一次，因此可能小于条目数。
        self.assertEqual(
            meta["itemCount"],
            len({item["collectionId"] for item in data["items"]}),
        )
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
        seen_ids: set[str] = set()
        # order 是「人物内」从 1 起的连续序号，不是全局扁平下标；按组累计校验。
        group_order: dict[str, int] = {}
        # 若仓库带甜站顺序覆盖文件，锁死「烘焙后的顺序 == 导出文件里的顺序」。
        override_path = ROOT / "public" / "data" / "sweet" / "sweet-cg-order.json"
        override = {}
        if override_path.is_file():
            override = json.loads(
                override_path.read_bytes().decode("utf-8-sig")
            ).get("order", {})
        group_seq_ids: dict[str, list[str]] = {}
        for item in data["items"]:
            self.assertEqual(
                set(item),
                {"id", "groupId", "order", "code", "name", "condition",
                 "image", "collectionId", "width", "height"},
            )
            expected_order = group_order.get(item["groupId"], 0) + 1
            self.assertEqual(item["order"], expected_order)
            group_order[item["groupId"]] = expected_order
            self.assertIsInstance(item["name"], str)
            self.assertEqual(item["condition"], "")
            self.assertEqual(item["width"], 0)
            self.assertEqual(item["height"], 0)
            self.assertNotIn("guide", item)
            self.assertIn(item["groupId"], group_ids)
            # id 仍是稳定的「slug-自然序号」：调顺序只改 order/code，不搬家图片。
            self.assertRegex(
                item["id"], r"^" + re.escape(item["groupId"]) + r"-\d+$"
            )
            self.assertEqual(item["code"], f"CG {item['order']:02d}")
            group_seq_ids.setdefault(item["groupId"], []).append(item["id"])
            if item["collectionId"].startswith("shared-"):
                # 两人共用的同一张图：落到 _shared/，collectionId 前 8 位与文件名一致。
                self.assertEqual(
                    item["image"],
                    f"images/sweet-cg/_shared/{item['collectionId'][len('shared-'):]}.webp",
                )
            else:
                # 人物专属 CG：collectionId 就是自身 id，图落在各自的 slug 目录。
                # 注意图片文件名用的是「原始游戏编号」（稳定、调顺序不搬家），
                # 与展示用的全新序号 code 无关，这里只校验目录结构。
                self.assertEqual(item["collectionId"], item["id"])
                prefix = f"images/sweet-cg/{item['groupId']}/"
                self.assertTrue(
                    item["image"].startswith(prefix)
                    and item["image"].endswith(".webp")
                    and "_shared/" not in item["image"],
                    item["image"],
                )
            self.assertNotIn(item["id"], seen_ids)
            seen_ids.add(item["id"])
        # 锁死烘焙顺序：每个分组的 id 序列必须和导出文件完全一致，防止被悄悄回退。
        for gid, ids in group_seq_ids.items():
            self.assertEqual(ids, override.get(gid, ids), f"group {gid} order drift")

    def test_names_come_from_linked_guide_events(self):
        """CG 名称 = 这张图对应的攻略事件标题（`cg-links.tsv` → guide.json 的 cgIds）。

        没有对应事件的 CG 名称留空（画廊只显示编号）；结局这类手填名称的条目
        见 `test_manual_ending_names`，手填优先于事件标题。
        """
        data = payload()
        names = esc.cg_names()
        manual = esc.manual_names()
        self.assertTrue(names, "guide.json 里没有 cgIds —— 请先跑 extract_sweet_guide.py")
        by_id = {item["id"]: item for item in data["items"]}

        # 映射表里点到的每个 cgId 都必须是一张真实存在的 CG，不能指向不存在的图。
        for cg_id, title in names.items():
            self.assertIn(cg_id, by_id, f"cg-links.tsv 指向了不存在的 CG：{cg_id}")
            if cg_id not in manual:
                self.assertEqual(by_id[cg_id]["name"], title, cg_id)
        # 反向：凡是没被映射点到、也没手填的条目，名称必须为空，不许出现「来历不明的名字」。
        for item in data["items"]:
            if item["id"] not in names and item["id"] not in manual:
                self.assertEqual(item["name"], "", item["id"])
        self.assertEqual(
            sum(1 for item in data["items"] if item["name"]),
            len(set(names) | set(manual)),
        )

    def test_manual_ending_names(self):
        """`cg-names.tsv`：结局类 CG 的手填名称，行里的源图编号必须对得上。

        源图编号是 `images/sweet-cg/<人物>/<原编号>.webp` 的文件名，一旦管线重排
        导致 id 与图错位，这条会先挂掉，而不是把名字悄悄贴到别的图上。
        """
        table = esc.manual_names()
        self.assertTrue(table, "sources/sweet/cg-names.tsv 缺失或为空")
        data = payload()
        by_id = {item["id"]: item for item in data["items"]}
        for cg_id, (source, name) in table.items():
            self.assertIn(cg_id, by_id, f"cg-names.tsv 指向了不存在的 CG：{cg_id}")
            item = by_id[cg_id]
            self.assertEqual(Path(item["image"]).stem, source, cg_id)
            self.assertEqual(item["name"], name, cg_id)
        # 杜云芊的九个事业结局（CG 14/15/18/19/21/22/23/24/25）都在这张表里。
        self.assertEqual(
            {by_id[cg_id]["code"] for cg_id in table},
            {"CG 14", "CG 15", "CG 18", "CG 19", "CG 21",
             "CG 22", "CG 23", "CG 24", "CG 25"},
        )
        for _source, name in table.values():
            self.assertTrue(name.startswith("事业结局（"), name)


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

    def test_shared_cg_dedup(self):
        """全批量只有一张真正共用的 CG（丹尼斯 / 史蒂芬 的 561-1）。

        它拆成两条条目（分属两个人物），但共享同一个 collectionId 与同一张
        webp，因此只能收集一次。其余条目都是人物专属，collectionId 等于自身 id。
        单纯游戏编号撞了、但字节不同（杜云芊 / 沈 的 83-1 等）不算共用。"""
        data = payload()
        shared = [item for item in data["items"]
                  if item["collectionId"].startswith("shared-")]
        self.assertEqual(len(shared), 2, shared)
        self.assertEqual(len({item["id"] for item in shared}), 2)
        self.assertEqual(len({item["groupId"] for item in shared}), 2)
        self.assertEqual(
            {item["collectionId"] for item in shared},
            {shared[0]["collectionId"]},
        )
        self.assertEqual(
            {item["image"] for item in shared},
            {f"images/sweet-cg/_shared/{shared[0]['collectionId'][len('shared-'):]}.webp"},
        )
        non_shared = [item for item in data["items"]
                      if not item["collectionId"].startswith("shared-")]
        self.assertTrue(non_shared)
        for item in non_shared:
            self.assertEqual(item["collectionId"], item["id"])

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
            folder = esc.SRC / "丹尼斯"
            folder.mkdir(parents=True)
            (folder / "1.bmp").write_bytes(b"x")
            (folder / "1.png").write_bytes(b"x")
            with self.assertRaises(SystemExit) as caught:
                esc.scan_sources(groups)
            self.assertIn("share the code", str(caught.exception))
        esc.SRC = original


if __name__ == "__main__":
    unittest.main()
