"""`sources/cg-node-links.tsv` 的守护测试。

这张表现在只剩一种「多对一」：美丽之星写真集是 18 个角色各一张 CG，但出图的是同一个
事件（#14），落点唯一，所以带事件锚点。

路欧桑感情线原先也在这里（一段剧情写了五个分支，锚哪条都不对，只能整页跳），现已逐个
对应到「路风和某某都在旗下」那两页的具体事件，改走 `cg-links.tsv`，正反两个方向都能点。

这里把它锁住：

  * `cg.json` 里带 `guide` 的条目，节点必须真的存在、标题抄对；
  * 一张 CG 不能同时有事件级落点和页面级落点（否则按钮指哪条得靠猜）；
  * 写了事件号的行，锚点必须真的指到那个事件（块存在、正文对得上）；
  * 路欧桑那 17 张必须都在事件级有落点，不能退回整页；
  * 写错的行必须让生成直接失败。
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import extract_cg as xc  # noqa: E402
import extract_guide as eg  # noqa: E402

ROOT = HERE.parent
GUIDE = ROOT / "public" / "data" / "guide.json"
CG = ROOT / "public" / "data" / "cg.json"
LUOUSANG = "other-events/luousang"
BEAUTY_STAR = "other-events/beauty-star"
# 路欧桑 17 张感情线 CG：同一张图在几个人名下各列一次（sang-4 = lu-4 这类）。
LUOUSANG_CGS = (
    "sang-3", "sang-4", "sang-5", "sang-6", "sang-7",
    "ou-3", "ou-4", "ou-5", "ou-6",
    "lu-4", "lu-5", "lu-6", "lu-7", "lu-8", "lu-9", "lu-10", "lu-11",
)


def _walk(node: dict):
    yield node
    for child in node.get("children") or []:
        yield from _walk(child)


class TestCgNodeLinks(unittest.TestCase):
    def test_links_point_at_existing_nodes(self):
        guide = json.loads(GUIDE.read_text(encoding="utf-8"))
        titles = xc.guide_node_titles()
        self.assertIn(LUOUSANG, titles)

        linked = [it for it in json.loads(CG.read_text(encoding="utf-8"))["items"] if it.get("guide")]
        self.assertEqual(len(linked), 18, "页面级落点只剩美丽之星写真集这一组")
        for item in linked:
            node_id = item["guide"]["nodeId"]
            self.assertIn(node_id, titles, f"{item['id']} 指向不存在的节点 {node_id}")
            self.assertEqual(item["guide"]["title"], titles[node_id])
        self.assertEqual({item["guide"]["nodeId"] for item in linked}, {BEAUTY_STAR})
        # 告别演唱会核对后锚到了欧怡青「告别 #7」，应当已从页面级移出。
        self.assertNotIn("ou-8", {item["id"] for item in linked})
        # 路欧桑已全部改成事件级，不能有谁还赖在页面级。
        self.assertFalse(
            [item["id"] for item in linked if item["id"] in LUOUSANG_CGS],
            "路欧桑的 CG 应当走 cg-links.tsv 的事件落点，不该留在页面级",
        )

    def test_luousang_cgs_anchor_to_specific_events(self):
        """17 张感情线 CG 都要落到具体事件，且成对的两侧都得有入口。"""
        guide = json.loads(GUIDE.read_text(encoding="utf-8"))
        blocks: dict[str, list[tuple[str, str, dict]]] = {}
        for category in guide["categories"]:
            for node in _walk(category):
                for block in node["blocks"]:
                    for cg_id in block.get("cgIds") or []:
                        blocks.setdefault(cg_id, []).append((node["id"], block["anchor"], block))

        for cg_id in LUOUSANG_CGS:
            hits = blocks.get(cg_id) or []
            self.assertTrue(hits, f"{cg_id} 没有事件级落点，会退回整页头顶")
            for node_id, anchor, _block in hits:
                self.assertTrue(node_id.startswith(LUOUSANG), f"{cg_id} 落在了 {node_id}")
                self.assertTrue(anchor.startswith("ev"), f"{cg_id} 的 anchor 不像事件锚点：{anchor}")

        # 一张图两个名字：两侧都能从攻略点进同一个图鉴条目。
        for pair in (("sang-4", "lu-4"), ("ou-5", "lu-9"), ("sang-5", "lu-5"), ("sang-6", "lu-6"),
                     ("ou-3", "lu-7"), ("ou-4", "lu-8"), ("ou-6", "lu-10")):
            for cg in pair:
                self.assertIn(cg, blocks, f"{cg} 少了事件级落点")

    def test_beauty_star_shared_event_anchor(self):
        """18 张写真集都锚到美丽之星 #14，且那个块真的是「写真集」事件。"""
        guide = json.loads(GUIDE.read_text(encoding="utf-8"))
        node = next(
            node for category in guide["categories"] for node in _walk(category)
            if node["id"] == BEAUTY_STAR
        )
        items = json.loads(CG.read_text(encoding="utf-8"))["items"]
        photos = [it for it in items if it["name"] == "美丽之星写真集"]
        self.assertEqual(len(photos), 18)
        for item in photos:
            self.assertEqual(item["guide"]["nodeId"], BEAUTY_STAR)
            anchor = item["guide"].get("anchor")
            self.assertTrue(anchor, f"{item['id']} 少了事件锚点，会退回整页顶部")
            index = int(anchor.removeprefix("ev"))
            block = node["blocks"][index]
            self.assertEqual(block["kind"], "event")
            self.assertEqual(block.get("label"), "14")
            self.assertIn("写真集", block["text"])

    def test_no_item_has_both_kinds_of_link(self):
        guide = json.loads(GUIDE.read_text(encoding="utf-8"))
        event_level: set[str] = set()
        for category in guide["categories"]:
            for node in _walk(category):
                for block in node["blocks"]:
                    event_level.update(block.get("cgIds") or [])

        overlap = [
            item["id"]
            for item in json.loads(CG.read_text(encoding="utf-8"))["items"]
            if item.get("guide") and item["id"] in event_level
        ]
        self.assertEqual(overlap, [], "同一张 CG 不该同时写进 cg-links.tsv 和 cg-node-links.tsv")

    def test_bad_rows_fail_loudly(self):
        titles = {LUOUSANG: "路欧桑剧情整理"}
        items = [{"id": "sang-5"}, {"id": "lu-4"}]
        with tempfile.TemporaryDirectory() as tmp:
            links = Path(tmp) / "node-links.tsv"
            original = xc.NODE_LINKS
            xc.NODE_LINKS = links
            try:
                links.write_text(f"sang-5\t{LUOUSANG}\t备注\n", encoding="utf-8")
                self.assertEqual(xc.apply_node_links(items, titles), 1)
                self.assertEqual(items[0]["guide"], {"nodeId": LUOUSANG, "title": "路欧桑剧情整理"})
                self.assertNotIn("guide", items[1])

                links.write_text("nope-1\tother-events/luousang\n", encoding="utf-8")
                with self.assertRaises(SystemExit):
                    xc.apply_node_links(items, titles)

                links.write_text("sang-5\tother-events/nope\n", encoding="utf-8")
                with self.assertRaises(SystemExit):
                    xc.apply_node_links(items, titles)

                # 写了事件号却对不上：宁可让生成失败，也不要静默退回整页顶部。
                links.write_text(f"sang-5\t{LUOUSANG}\t备注\t9999\n", encoding="utf-8")
                with self.assertRaises(SystemExit):
                    xc.apply_node_links(items, titles)

                # 注释行与空行跳过，不参与校验。
                links.write_text(f"# 说明\n\nlu-4\t{LUOUSANG}\n", encoding="utf-8")
                self.assertEqual(xc.apply_node_links(items, titles), 1)
            finally:
                xc.NODE_LINKS = original

    def test_guide_side_notes_link_to_luousang(self):
        """路风 / 欧怡青页里的指引要带上《路欧桑剧情整理》站内链接。"""
        data = json.loads(GUIDE.read_text(encoding="utf-8"))
        found: list[str] = []
        for category in data["categories"]:
            for node in _walk(category):
                if node["id"] not in ("characters/lu-feng", "characters/ou-yiqing"):
                    continue
                for block in node["blocks"]:
                    for link in block.get("links") or []:
                        if link["target"] == LUOUSANG:
                            found.append(node["id"])
        self.assertIn("characters/lu-feng", found)
        self.assertIn("characters/ou-yiqing", found)
        # 欧怡青是两处：事件开头一处、☆路欧恋 标题下一处。
        self.assertEqual(found.count("characters/ou-yiqing"), 2)
        # 链接文本必须真的是《路欧桑剧情整理》，否则 1053 行的拆分逻辑找不到它。
        self.assertTrue(eg.LINK_TARGETS.get("路欧桑剧情整理") == LUOUSANG)


if __name__ == "__main__":
    unittest.main()
