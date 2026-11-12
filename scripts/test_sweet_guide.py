"""`scripts/extract_sweet_guide.py` 的守护测试。

甜蜜乐章的数据是脚本生成的，不允许手改 `public/data/sweet/guide.json` ——
手改一次之后重新生成就会悄悄回退。这里锁住三件事：

  * 提交的 guide.json 与脚本重算的结果完全一致；
  * 主线攻略被完整解析：4 个章节 + 23 个事件，编号连续，「时间/概要」都进了卡里；
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


def _main_story(data: dict) -> dict:
    category = next(c for c in data["categories"] if c["id"] == "sweet-guide")
    return next(n for n in category["children"] if n["id"] == "sweet-guide/main-story")


class TestSweetGuide(unittest.TestCase):
    def setUp(self) -> None:
        self.data = esg.build()
        self.story = _main_story(self.data)
        self.blocks = self.story["blocks"]

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
        self.assertEqual(stats["readyItems"], 1)
        self.assertEqual(stats["missingItems"], 23)

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
        for block in self.blocks:
            self.assertNotIn("．", block["text"], f"残留全角句点：{block['text']}")
            self.assertNotIn("\u3000", block["text"], f"残留全角空格：{block['text']}")

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
