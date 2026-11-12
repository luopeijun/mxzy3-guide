"""`scripts/extract_sweet_guide.py` 的守护测试。

甜蜜乐章的数据是脚本生成的，不允许手改 `public/data/sweet/guide.json` ——
手改一次之后重新生成就会悄悄回退。这里锁住这些事：

  * 提交的 guide.json 与脚本重算的结果完全一致；
  * 主线攻略被完整解析：4 个章节 + 23 个事件，编号连续，「时间/概要」都进了卡里；
  * 公司改建攻略：1 个章节 + 9 个事件（4-1 ~ 4-9），顶格的细节行也能识别；
  * 国外通告接拍条件：三行一组解析成 5 行表格，城市顺序与条件都对；
  * 目录结构按用户裁决：类目叫「经纪人事件簿」、没有「角色介绍」这一节。

跑法（用项目 venv 的 Python）：
    python scripts/test_sweet_guide.py
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import extract_sweet_guide as esg  # noqa: E402

ROOT = HERE.parent
GUIDE = ROOT / "public" / "data" / "sweet" / "guide.json"

# 主线攻略的四个章节，按原攻略顺序。
CHAPTERS = ["投资", "骗局", "摩登时代", "落日"]
# 每章的事件编号；合计 23 个事件。
EVENT_LABELS = [
    *[f"1-{i}" for i in range(1, 6)],
    *[f"2-{i}" for i in range(1, 6)],
    *[f"3-{i}" for i in range(1, 7)],
    *[f"4-{i}" for i in range(1, 8)],
]
# 公司改建攻略：单一章节「改建」，9 个事件。
COMPANY_LABELS = [f"4-{i}" for i in range(1, 10)]
# 国外通告接拍条件：五个城市 + 各自的公司与接拍条件。
ABROAD_ROWS = [
    ("东京", "京风唱片（唱片）", "推出3张唱片以上（个人、团体分开计算）"),
    ("好莱坞", "大宇宙影业（电影）", "拍过3部电影主角"),
    ("伦敦", "伊丽莎白（广告）", "拍过5个广告"),
    ("米兰", "柯里昂（时装秀）", "拍过5个广告"),
    ("纽约", "巴洛克之诗（舞台剧）", "拍过电影，拍过电视剧，做过主持"),
]


def _node(data: dict, slug: str) -> dict:
    category = next(c for c in data["categories"] if c["id"] == "sweet-guide")
    return next(n for n in category["children"] if n["id"] == f"sweet-guide/{slug}")


class TestSweetGuide(unittest.TestCase):
    def setUp(self) -> None:
        self.data = esg.build()
        self.story = _node(self.data, "main-story")
        self.blocks = self.story["blocks"]
        self.company = _node(self.data, "company")
        self.abroad = _node(self.data, "abroad-notices")

    def test_committed_json_matches_build(self) -> None:
        committed = json.loads(GUIDE.read_text(encoding="utf-8"))
        self.assertEqual(committed, self.data, "guide.json 与脚本重算不一致，请重新生成")

    def test_category_is_broker_events(self) -> None:
        first = self.data["categories"][0]
        self.assertEqual(first["id"], "sweet-guide")
        self.assertEqual(first["title"], "经纪人事件簿")
        self.assertEqual(len(first["children"]), 10)
        self.assertNotIn("角色介绍", [n["title"] for n in first["children"]])
        self.assertNotIn("sweet-guide/intro", [n["id"] for n in first["children"]])

    def test_three_categories(self) -> None:
        self.assertEqual(
            [c["title"] for c in self.data["categories"]],
            ["经纪人事件簿", "角色攻略", "支线攻略"],
        )
        stats = self.data["meta"]["stats"]
        self.assertEqual(stats["categories"], 3)
        self.assertEqual(stats["items"], 24)
        self.assertEqual(stats["readyItems"], 3)
        self.assertEqual(stats["missingItems"], 21)

    def test_main_story_is_ready(self) -> None:
        self.assertEqual(self.story["status"], "ready")
        self.assertEqual(self.story["description"], "主线任务（落日相关）")

    def test_chapters_and_events(self) -> None:
        sections = [b["text"] for b in self.blocks if b["kind"] == "section"]
        self.assertEqual(sections, [*CHAPTERS, "结局分歧"])
        labels = [b["label"] for b in self.blocks if b["kind"] == "event"]
        self.assertEqual(labels, EVENT_LABELS)

    def test_every_event_keeps_time_and_summary(self) -> None:
        by_group: dict[int, list[dict]] = {}
        for block in self.blocks:
            by_group.setdefault(block["group"], []).append(block)
        for label in EVENT_LABELS:
            group = next(
                b["group"] for b in self.blocks if b["kind"] == "event" and b["label"] == label
            )
            texts = [b["text"] for b in by_group[group] if b["kind"] == "paragraph"]
            self.assertTrue(
                any(t.startswith("时间：") for t in texts), f"{label} 缺时间行"
            )
            self.assertTrue(
                any(t.startswith("概要：") for t in texts), f"{label} 缺概要行"
            )

    def test_hints_and_footnotes_become_notes(self) -> None:
        notes = [b["text"] for b in self.blocks if b["kind"] == "note"]
        # 原攻略里 3 处「提示：」（2-2 / 3-4 / 3-6 / 4-1）
        self.assertEqual(sum(1 for n in notes if n.startswith("提示：")), 4)
        # 4-5 括号里的个人注解
        self.assertTrue(any("若到七月尚未开拍" in n for n in notes))
        # 文末的结局分歧
        self.assertTrue(any("迈向国际的经纪公司" in n for n in notes))

    def test_no_leftover_source_artifacts(self) -> None:
        # 全角句点 / 全角空格都是源文本的排版残留，生成的 JSON 里不该再出现
        # （表格页的单元格同样要干净）。
        def texts(node: dict):
            for block in node["blocks"]:
                yield block["text"]
                table = block.get("table")
                if table:
                    yield from (column["label"] for column in table["columns"])
                    for row in table["rows"]:
                        yield from row.values()

        for category in self.data["categories"]:
            for node in category["children"]:
                for text in texts(node):
                    self.assertNotIn("．", text, f"残留全角句点：{text}")
                    self.assertNotIn("\u3000", text, f"残留全角空格：{text}")

    def test_company_page(self) -> None:
        self.assertEqual(self.company["status"], "ready")
        self.assertEqual(self.company["description"], "从第 2 年的请客买单到气派大楼落成，共 9 个事件")

        blocks = self.company["blocks"]
        # 「4.改建」里的章节号不进标题，和主线攻略的「投资」「骗局」保持同一种写法。
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "section"], ["改建"])
        self.assertEqual([b["label"] for b in blocks if b["kind"] == "event"], COMPANY_LABELS)

        # 细节行顶格写（没有缩进），也得逐条落进对应事件卡里。
        by_group: dict[int, list[dict]] = {}
        for block in blocks:
            by_group.setdefault(block["group"], []).append(block)
        for label in COMPANY_LABELS:
            group = next(b["group"] for b in blocks if b["kind"] == "event" and b["label"] == label)
            texts = [b["text"] for b in by_group[group] if b["kind"] == "paragraph"]
            self.assertTrue(any(t.startswith("时间：") for t in texts), f"{label} 缺时间行")
            self.assertTrue(any(t.startswith("概要：") for t in texts), f"{label} 缺概要行")

        notes = [b["text"] for b in blocks if b["kind"] == "note"]
        self.assertEqual(len(notes), 3, notes)  # 4-1 / 4-3 / 4-7 各一条提示
        self.assertTrue(all(n.startswith("提示：") for n in notes))

    def test_abroad_notices_table(self) -> None:
        self.assertEqual(self.abroad["status"], "ready")
        self.assertEqual(
            self.abroad["description"], "东京、好莱坞、伦敦、米兰、纽约五个城市的接拍门槛"
        )
        self.assertEqual(len(self.abroad["blocks"]), 1)

        block = self.abroad["blocks"][0]
        self.assertEqual(block["kind"], "table")
        table = block["table"]
        self.assertEqual([c["label"] for c in table["columns"]], ["城市", "公司（通告类型）", "接拍条件"])
        self.assertEqual(
            [(r["city"], r["company"], r["requirement"]) for r in table["rows"]],
            ABROAD_ROWS,
        )

    def test_ids_unique(self) -> None:
        ids: list[str] = []

        def walk(node: dict) -> None:
            ids.append(node["id"])
            for child in node["children"]:
                walk(child)

        for category in self.data["categories"]:
            walk(category)
        self.assertEqual(len(ids), len(set(ids)), f"重复的节点 id：{ids}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
