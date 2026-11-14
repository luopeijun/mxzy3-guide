"""Regression + unit tests for the 明星志愿3 guide parser.

Why this exists
--------------
`scripts/extract_guide.py` is a 2800+ line parser that has grown many
character-specific branches. A small change to a shared regex can silently
reshape an unrelated character page. These tests are the regression net:

  * Unit tests for the small, pure helpers (`classify`, `_has_cg`,
    `_is_item_line`, `_split_letter_items`, ...) — fast, no I/O.
  * An integration "smoke" test that re-runs the *real* pipeline on the
    committed sources and asserts the produced `guide.json` is byte-for-byte
    identical to the one already checked in. Any parser patch that changes
    output without a matching `guide.json` regeneration fails loudly.

Running
-------
    python -m unittest discover -s scripts -p "test_*.py"
    # or, directly:
    python scripts/test_extract.py
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import extract_guide as eg  # noqa: E402

ROOT = HERE.parent
COMMITTED = ROOT / "public" / "data" / "guide.json"

# Map build() parameter names to the module's DEFAULT_* path constants.
_BUILD_ARGS = {
    "docx": "DEFAULT_DOCX",
    "questions": "DEFAULT_QUESTIONS",
    "events": "DEFAULT_EVENTS",
    "stats": "DEFAULT_STATS",
    "scenes": "DEFAULT_SCENES",
    "work": "DEFAULT_WORK",
    "training": "DEFAULT_TRAINING",
    "certificates": "DEFAULT_CERTIFICATES",
    "producers": "DEFAULT_PRODUCERS",
    "selfmade": "DEFAULT_SELFMADE",
    "titles": "DEFAULT_TITLES",
    "monopoly": "DEFAULT_MONOPOLY",
    "endings": "DEFAULT_ENDINGS",
    "items": "DEFAULT_ITEMS",
    "favorites": "DEFAULT_FAVORITES",
    "easyshop": "DEFAULT_EASYSHOP",
    "notices": "DEFAULT_NOTICES",
    "notices_intro": "DEFAULT_NOTICES_INTRO",
    "sd_events": "DEFAULT_SD",
    "father_events": "DEFAULT_FATHER",
    "hollywood_events": "DEFAULT_HOLLYWOOD",
    "will_events": "DEFAULT_WILL",
    "expansion_events": "DEFAULT_EXPANSION",
    "secretary_events": "DEFAULT_SECRETARY",
    "manyang_events": "DEFAULT_MANYANG",
    "beauty_star_events": "DEFAULT_BEAUTY_STAR",
    "president_he_events": "DEFAULT_PRESIDENT_HE",
    "luousang_sanghebei_events": "DEFAULT_LUOUSANG_SANGHEBEI",
    "luousang_ouyiqing_events": "DEFAULT_LUOUSANG_OUYIQING",
    "luousang_lufeng_events": "DEFAULT_LUOUSANG_LUFENG",
    "luousang_lufeng_sanghebei_events": "DEFAULT_LUOUSANG_LUFENG_SANGHEBEI",
    "luousang_lufeng_ouyiqing_events": "DEFAULT_LUOUSANG_LUFENG_OUYIQING",
}


def build_kwargs() -> dict:
    return {param: getattr(eg, attr) for param, attr in _BUILD_ARGS.items()}


# --------------------------------------------------------------------------- #
# Unit tests — pure helpers (no file I/O)
# --------------------------------------------------------------------------- #
class TestClassify(unittest.TestCase):
    def test_event_line(self):
        blk = eg.classify("1 （自动）第一年6月，前往工作场所。")
        self.assertEqual(blk["kind"], "event")
        self.assertEqual(blk["label"], "1")

    def test_sub_event_line(self):
        blk = eg.classify("29－1 （新闻）上个事件中选择“乐观其成”，隔天。")
        self.assertEqual(blk["kind"], "event")
        self.assertEqual(blk["label"], "29－1")

    def test_note_prefix(self):
        blk = eg.classify("提示：以下为路风视角的路欧桑感情剧情。")
        self.assertEqual(blk["kind"], "note")

    def test_heading_colon(self):
        # A short `项目：` line is a (sub) heading, not a list entry.
        blk = eg.classify("签约金：")
        self.assertEqual(blk["kind"], "heading")

    def test_heading_short(self):
        blk = eg.classify("暗恋")
        self.assertEqual(blk["kind"], "heading")

    def test_paragraph_with_punctuation(self):
        blk = eg.classify("这是一个包含逗号，以及句号。的普通说明段落。")
        self.assertEqual(blk["kind"], "paragraph")

    def test_option_line(self):
        blk = eg.classify("A. 选择“答应”")
        self.assertEqual(blk["kind"], "option")


class TestHasCg(unittest.TestCase):
    def test_positive_forms(self):
        for text in ("可看到CG", "看到CG", "获得CG", "（CG）", "CG图"):
            with self.subTest(text=text):
                self.assertTrue(eg._has_cg(text), msg=text)

    def test_explicit_denial(self):
        # The event states it has NO CG — must NOT be flagged.
        self.assertFalse(eg._has_cg("（结局没有特殊对白和CG）"))
        self.assertFalse(eg._has_cg("无CG"))

    def test_no_cg_substring(self):
        self.assertFalse(eg._has_cg("普通事件没有任何特殊画面"))


class TestItemLines(unittest.TestCase):
    def test_item_prefix(self):
        self.assertEqual(eg._item_prefix("签约金：0（不断续约…）"), "签约金")

    def test_is_item_line_true(self):
        self.assertTrue(eg._is_item_line("签约金：0（不断续约…）"))

    def test_is_item_line_false_on_colon_ending(self):
        # A lead-in sentence ending in a colon is NOT an entry of its own.
        self.assertFalse(eg._is_item_line("升级的条件：训练有4个档次…如下："))

    def test_is_item_line_false_on_prose(self):
        # A clause before the colon reads as prose, not a label.
        self.assertFalse(eg._is_item_line("周映彤与小熊的友好度增加的方法：选择xxx"))


class TestSplitLetterItems(unittest.TestCase):
    def test_splits_letter_entries(self):
        text = "材料A．天使的音乐盒。B．天使羽衣。C．最后一项。"
        out = eg._split_letter_items(text)
        self.assertEqual(out.count("\n"), 2)
        self.assertIn("B．天使羽衣。", out)


# --------------------------------------------------------------------------- #
# Integration tests — run the real parser and lock the output
# --------------------------------------------------------------------------- #
@unittest.skipUnless(
    COMMITTED.exists() and eg.DEFAULT_DOCX.exists(),
    "source docx / committed guide.json not available in this environment",
)
class TestParserBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = eg.build(**build_kwargs())
        cls.committed = json.loads(COMMITTED.read_text(encoding="utf-8"))

    # --- helpers ---------------------------------------------------------- #
    @staticmethod
    def _walk(items):
        for node in items:
            yield node
            yield from TestParserBuild._walk(node.get("children", []))

    def _node(self, node_id):
        for n in self._walk(self.data["categories"]):
            if n.get("id") == node_id:
                return n
        raise KeyError(node_id)

    def _heading_depth(self, node_id, text):
        node = self._node(node_id)
        for b in node["blocks"]:
            if b["kind"] in ("section", "heading") and b["text"] == text:
                return b.get("depth")
        return None

    # --- structural invariants -------------------------------------------- #
    def test_category_order(self):
        # 「路欧桑剧情整理」提升成独立类目：夹在「艺人事件簿」和「六大特殊通告」之间。
        self.assertEqual(
            [(c["id"], c["title"]) for c in self.data["categories"]],
            [
                ("game-guide", "经纪人事件簿"),
                ("characters", "艺人事件簿"),
                ("other-events/luousang", "路欧桑剧情整理"),
                ("notices", "六大特殊通告"),
                ("other-events", "其他事件"),
            ],
        )

    def test_luousang_moved_out_of_other_events(self):
        by_id = {c["id"]: c for c in self.data["categories"]}
        other = by_id["other-events"]
        self.assertNotIn(
            "other-events/luousang", [n["id"] for n in other["children"]],
            msg="路欧桑剧情整理还留在「其他事件」里",
        )
        luousang = by_id["other-events/luousang"]
        self.assertEqual(
            [n["id"] for n in luousang["children"]],
            [
                "other-events/luousang/only-sanghebei",
                "other-events/luousang/only-ouyiqing",
                "other-events/luousang/only-lufeng",
                "other-events/luousang/lufeng-sanghebei",
                "other-events/luousang/lufeng-ouyiqing",
            ],
            msg="五条分支的 id 不能跟着搬家改掉（追踪器与 CG 落点都按它们找）",
        )

    def test_unique_node_ids(self):
        ids = [n.get("id") for n in self._walk(self.data["categories"])]
        self.assertEqual(len(ids), len(set(ids)), msg=f"duplicate ids: {ids}")

    def test_every_node_has_id_and_title(self):
        for n in self._walk(self.data["categories"]):
            self.assertTrue(n.get("id"), msg=f"missing id: {n}")
            self.assertTrue(n.get("title"), msg=f"missing title: {n.get('id')}")

    def test_link_targets_resolve(self):
        # Note: question-option `target` values are *intra-page* anchors
        # (`heading.id`, e.g. "q3") resolved by the front-end, not node ids.
        # Only the `links` field carries cross-node jumps (e.g. 路欧桑剧情整理
        # -> other-events/luousang), so that is what we validate here.
        id_set = {n.get("id") for n in self._walk(self.data["categories"])}
        for n in self._walk(self.data["categories"]):
            for b in n.get("blocks", []):
                for link in b.get("links", []) or []:
                    self.assertIn(
                        link["target"], id_set, msg=f"broken link {link} in {n.get('id')}"
                    )

    def test_character_pages_have_cover(self):
        for n in self._walk(self.data["categories"]):
            if n.get("id", "").startswith("characters/"):
                self.assertIn("cover", n, msg=f"{n['id']} missing cover")

    def test_meta_stats_present(self):
        stats = self.data["meta"]["stats"]
        for key in ("categories", "items", "blocks", "readyItems", "missingItems"):
            self.assertIn(key, stats)

    # --- the big one: output must match the committed artifact ------------ #
    def test_output_matches_committed_guide_json(self):
        self.assertEqual(self.data, self.committed)

    def test_will_notice_is_separate_from_blocks(self):
        """页首提示挂在 notice 字段，不能挤进 blocks：追踪器按块下标存进度，
        往正文前面加一个块会让玩家已有的勾选整体错位一格。"""
        node = self._node("other-events/will")
        self.assertEqual(node["notice"]["title"], "一个存档，打出两个结局")
        self.assertEqual(len(node["notice"]["lines"]), 3)
        self.assertEqual(len(node["notice"]["outcomes"]), 2)
        self.assertEqual(len(node["blocks"]), 26)
        self.assertEqual(node["blocks"][0]["kind"], "section")
        self.assertEqual(sum(1 for b in node["blocks"] if b["kind"] == "event"), 22)
        for n in self._walk(self.data["categories"]):
            if n["id"] != "other-events/will":
                self.assertNotIn("notice", n)

    # --- hierarchy locks (regressions the user has fixed before) ---------- #
    def test_lu_feng_romance_under_events(self):
        self.assertEqual(self._heading_depth("characters/lu-feng", "与桑禾蓓的感情"), 1)
        self.assertEqual(self._heading_depth("characters/lu-feng", "暗恋"), 2)
        self.assertEqual(self._heading_depth("characters/lu-feng", "复合"), 2)

    def test_tian_qing_romance_under_events(self):
        self.assertEqual(self._heading_depth("characters/tian-qing", "与路敏的感情"), 1)
        self.assertEqual(self._heading_depth("characters/tian-qing", "路边摊"), 1)

    def test_guan_guwei_battle_nested(self):
        self.assertEqual(self._heading_depth("characters/guan-guwei", "爱情大混战"), 1)
        self.assertEqual(self._heading_depth("characters/guan-guwei", "和方若绮的绯闻"), 2)
        self.assertEqual(self._heading_depth("characters/guan-guwei", "音乐剧"), 1)

    def test_ji_xiang_romance_under_events(self):
        self.assertEqual(
            self._heading_depth("characters/ji-xiang", "与主角的感情（简体版需打上BL补丁）"), 1
        )
        self.assertEqual(self._heading_depth("characters/ji-xiang", "达成结局条件"), 2)

    def test_xinming_shaxue_star_dance_under_events(self):
        self.assertEqual(
            self._heading_depth(
                "characters/xinming-shaxue",
                "星光圆舞曲限定事件（只运行星光圆舞曲时出现；简体版无法遇到）",
            ),
            1,
        )
        self.assertEqual(self._heading_depth("characters/xinming-shaxue", "初识"), 2)
        # The second 考大学 (inside the star-dance section) is depth 2,
        # the first (under 七夕邀约) stays depth 1.
        depths = [
            b.get("depth")
            for b in self._node("characters/xinming-shaxue")["blocks"]
            if b["kind"] in ("section", "heading") and b["text"] == "考大学"
        ]
        self.assertEqual(sorted(depths), [1, 2])

    def test_ou_yiqing_luou_romance_top_level(self):
        self.assertEqual(self._heading_depth("characters/ou-yiqing", "路欧恋"), 1)
        self.assertEqual(
            self._heading_depth("characters/ou-yiqing", "与主角的感情（需安装资料片“星光圆舞曲”）"), 1
        )

    def test_ke_liesi_structure(self):
        self.assertEqual(self._heading_depth("characters/ke-liesi", "与杨安妤的感情"), 1)
        self.assertEqual(self._heading_depth("characters/ke-liesi", "初识"), 2)
        self.assertEqual(self._heading_depth("characters/ke-liesi", "与纪翔的事件"), 1)
        self.assertEqual(self._heading_depth("characters/ke-liesi", "决斗"), 2)
        self.assertEqual(self._heading_depth("characters/ke-liesi", "与史蒂芬的事件"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
