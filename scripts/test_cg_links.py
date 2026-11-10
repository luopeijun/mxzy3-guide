"""`sources/cg-links.tsv` 的守护测试。

这份手写映射把攻略事件和 CG 图鉴里的条目连起来：写错一个事件号，界面上
就是一条死链，而且不会有任何报错——所以这里把它锁住：

  * 提交的 `guide.json` 里每张被映射的 CG 都有攻略落点，anchor 在节点内不重复；
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
# 路欧桑五个分支页：同一段剧情各写一遍，跨页重复的 CG 只在这组节点之间才允许。
LUOUSANG = "other-events/luousang/"
# 同一张图在「角色页」和「路欧桑分支页」各写了一遍、两处都值得留入口的已知例外：
# ou-8 告别演唱会在欧怡青「告别 #7」和「路风和欧怡青都在旗下 #63」都有详细步骤。
DUPLICATED_ACROSS_NODES = {"ou-8"}


def _walk(node: dict):
    yield node
    for child in node["children"]:
        yield from _walk(child)


class TestCgLinkMapping(unittest.TestCase):
    def test_mapping_is_one_to_one_and_valid(self):
        data = json.loads(GUIDE.read_text(encoding="utf-8"))
        cg_ids = {item["id"] for item in json.loads(CG.read_text(encoding="utf-8"))["items"]}

        seen_cg: dict[str, str] = {}
        seen_anchor: set[tuple[str, str]] = set()
        per_node: dict[str, int] = {}
        for category in data["categories"]:
            for node in _walk(category):
                for block in node["blocks"]:
                    if not block.get("cgIds"):
                        continue
                    per_node[node["id"]] = per_node.get(node["id"], 0) + 1
                    anchor = block.get("anchor")
                    self.assertTrue(anchor, f"{node['id']} #{block.get('label')} 有 cgIds 却没有 anchor")
                    # anchor 是「节点内块下标」，同一页里唯一就行：一次只渲染一个节点，
                    # 不同角色的 ev12 互不影响。
                    self.assertNotIn(
                        (node["id"], anchor), seen_anchor,
                        f"anchor 重复: {node['id']} {anchor}",
                    )
                    seen_anchor.add((node["id"], anchor))
                    for cg_id in block["cgIds"]:
                        self.assertIn(cg_id, cg_ids, f"{cg_id} 不在 cg.json 里")
                        where = f"{node['id']} #{block.get('label')}"
                        if cg_id in seen_cg:
                            # 允许同一张 CG 在同一节点的两个事件里出现（苏嫚君 CG05
                            # 圣诞布置第二年、第三年各一次），反跳取第一条即可。
                            # 路欧桑感情线是另一回事：五个分支页各写了一遍同一段剧情，
                            # 同一张图在「只有 X 在旗下」和「两人都在旗下」都拿得到，
                            # 跨分支重复是数据本身的样子（回跳按来源页走，见 cgOrigin）。
                            # 其余跨节点重复说明该做成单向，得挪去 cg-node-links.tsv。
                            first = seen_cg[cg_id].split(" ")[0]
                            if first != node["id"] and cg_id not in DUPLICATED_ACROSS_NODES:
                                self.assertTrue(
                                    first.startswith(LUOUSANG) and node["id"].startswith(LUOUSANG),
                                    f"{cg_id} 被多个事件指向（{seen_cg[cg_id]} 与 {where}）："
                                    "这种应当只做 CG→事件单向，不该写进 cg-links.tsv",
                                )
                        seen_cg.setdefault(cg_id, where)

        # 映射是逐块长出来的，至少要覆盖已经核对过的几组，防止某次重构把整段映射悄悄丢掉。
        self.assertGreaterEqual(len(seen_cg), 98)

        # 每个已经核对完的角色各锁一个下限：漏掉一整段（比如改 tsv 时误删）会立刻红。
        expected = {
            "characters/lin-fenfen": 7,
            "characters/xiao-yili": 7,
            "characters/sang-hebei": 3,
            "characters/su-manjun": 7,
            "characters/ou-yiqing": 3,
            "characters/lu-min": 8,
            "characters/lu-feng": 1,
            "characters/yao-ziqi": 6,
            "characters/tian-qing": 6,
            "characters/guan-guwei": 6,
            "characters/chen-yifu": 3,
            "characters/ji-xiang": 6,
            "characters/xinming-shaxue": 9,
            "characters/yao-ziying": 5,
            "characters/ling-xiang": 5,
            "characters/ke-liesi": 7,
            "characters/wei-ya": 5,
            "characters/yuan-shaowei": 5,
            "other-events/secretary": 1,
            # 路欧桑感情线：五个分支页各写了一遍同一段剧情，能拿到 CG 的三页都要有映射。
            "other-events/luousang/only-lufeng": 2,
            "other-events/luousang/only-sanghebei": 3,
            "other-events/luousang/lufeng-sanghebei": 4,
            "other-events/luousang/lufeng-ouyiqing": 7,
        }
        for node_id, least in expected.items():
            self.assertGreaterEqual(
                per_node.get(node_id, 0), least,
                f"{node_id} 的 CG 映射只剩 {per_node.get(node_id, 0)} 条，少于核对过的 {least} 条",
            )

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
