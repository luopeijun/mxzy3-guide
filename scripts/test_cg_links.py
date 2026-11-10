"""`sources/cg-links.tsv` 的守护测试。

这份手写映射把攻略事件和 CG 图鉴里的条目连起来：写错一个事件号，界面上
就是一条死链，而且不会有任何报错——所以这里把它锁住：

  * 提交的 `guide.json` 里每张被映射的 CG 只有一个攻略落点，anchor 不重复；
  * 映射到的 CG id 必须在 `cg.json` 里真实存在；
  * 写错的行（节点不存在 / 事件号对不上 / 命中多条）必须让生成直接失败。
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import extract_guide as eg  # noqa: E402

ROOT = HERE.parent
GUIDE = ROOT / "public" / "data" / "guide.json"
CG = ROOT / "public" / "data" / "cg.json"


def _walk(node: dict):
    yield node
    for child in node["children"]:
        yield from _walk(child)


class TestCgLinkMapping(unittest.TestCase):
    def test_mapping_is_one_to_one_and_valid(self):
        data = json.loads(GUIDE.read_text(encoding="utf-8"))
        cg_ids = {item["id"] for item in json.loads(CG.read_text(encoding="utf-8"))["items"]}

        seen_cg: dict[str, str] = {}
        seen_anchor: set[str] = set()
        for category in data["categories"]:
            for node in _walk(category):
                for block in node["blocks"]:
                    if not block.get("cgIds"):
                        continue
                    anchor = block.get("anchor")
                    self.assertTrue(anchor, f"{node['id']} #{block.get('label')} 有 cgIds 却没有 anchor")
                    self.assertNotIn(anchor, seen_anchor, f"anchor 重复: {anchor}")
                    seen_anchor.add(anchor)
                    for cg_id in block["cgIds"]:
                        self.assertIn(cg_id, cg_ids, f"{cg_id} 不在 cg.json 里")
                        self.assertNotIn(
                            cg_id, seen_cg,
                            f"{cg_id} 被多个事件指向（{seen_cg.get(cg_id)} 与 {node['id']}）："
                            "这种应当只做 CG→事件单向，不该写进 cg-links.tsv",
                        )
                        seen_cg[cg_id] = f"{node['id']} #{block.get('label')}"

        # 映射是逐块长出来的，至少要覆盖已经核对过的两组（林芬芬 / 萧依莉），
        # 防止某次重构把整段映射悄悄丢掉。
        self.assertGreaterEqual(len(seen_cg), 14)

    def test_unknown_event_fails_loudly(self):
        categories = [{
            "id": "x", "title": "X", "blocks": [], "children": [{
                "id": "x/y", "title": "Y", "status": "ready", "children": [],
                "blocks": [{"kind": "event", "text": "t", "label": "1", "group": 1}],
            }],
        }]
        with tempfile.TemporaryDirectory() as tmp:
            links = Path(tmp) / "links.tsv"
            links.write_text("x/y\t9\tcg-1\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                eg.apply_cg_links(categories, links)

    def test_ambiguous_event_needs_chapter(self):
        categories = [{
            "id": "x", "title": "X", "blocks": [], "children": [{
                "id": "x/y", "title": "Y", "status": "ready", "children": [],
                "blocks": [
                    {"kind": "section", "text": "A", "group": 1},
                    {"kind": "event", "text": "t1", "label": "3", "group": 2},
                    {"kind": "section", "text": "B", "group": 3},
                    {"kind": "event", "text": "t2", "label": "3", "group": 4},
                ],
            }],
        }]
        with tempfile.TemporaryDirectory() as tmp:
            links = Path(tmp) / "links.tsv"
            links.write_text("x/y\t3\tcg-1\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                eg.apply_cg_links(categories, links)

            # 补上章节列就能唯一定位到第二条。
            links.write_text("x/y\t3\tcg-2\tB\n", encoding="utf-8")
            self.assertEqual(eg.apply_cg_links(categories, links), 1)
            blocks = categories[0]["children"][0]["blocks"]
            self.assertEqual(blocks[3]["cgIds"], ["cg-2"])
            self.assertEqual(blocks[3]["anchor"], "ev3")
            self.assertNotIn("cgIds", blocks[1])


if __name__ == "__main__":
    unittest.main()
