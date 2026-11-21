"""Guard tests for the 六大通告 runtime data.

The condition table is hand-maintained, so the two ways it can quietly break
the planner are: emitting data while a row still has an unresolved question,
and shipping a deep link that points at a non-existent guide event. Both must
fail the build rather than render a dead link.

  python -m unittest discover -s scripts -p "test_*.py"
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_specials_review as review  # noqa: E402
import extract_specials as es  # noqa: E402

ROOT = HERE.parent
TSV = ROOT / "sources" / "special-notices.tsv"
JSON = ROOT / "public" / "data" / "specials.json"


def _tsv_rows():
    lines = TSV.read_bytes().decode("utf-8-sig").splitlines()
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"))) for line in lines[1:] if line.strip()]


def _json():
    return json.loads(JSON.read_bytes().decode("utf-8"))


@contextmanager
def _patched_tsv(mutate):
    """Write a mutated copy of the TSV and point the shared reader at it."""
    raw = TSV.read_bytes().decode("utf-8-sig")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "special-notices.tsv"
        path.write_bytes(mutate(raw).encode("utf-8"))
        with patch.object(review, "TSV", path):
            yield


class TestSpecialsJson(unittest.TestCase):
    def test_json_is_a_faithful_transcription_of_tsv(self):
        src = _tsv_rows()
        data = _json()
        self.assertEqual(len(src), len(data["rows"]))
        anchors = review.build_anchors(review.load_nodes())
        for source, out in zip(src, data["rows"]):
            for key in es.FIELDS_TO_EMIT:
                self.assertEqual(source[key], out[key], f"{source['id']}.{key}")
            self.assertEqual(source["verify"], "-", f"{source['id']} still has a question")
            self.assertEqual(es.resolve_link(source["link"], anchors), out["link"])

    def test_counts_match_the_reviewed_table(self):
        data = _json()
        s = data["stats"]
        self.assertEqual(s["rows"], 133)
        self.assertEqual(s["conditions"], 85)
        self.assertEqual(s["notes"], 48)
        self.assertEqual(len(data["notices"]), 7)
        self.assertEqual(
            sum(n["conditionCount"] for n in data["notices"]), s["conditions"]
        )
        self.assertEqual(sum(n["noteCount"] for n in data["notices"]), s["notes"])
        self.assertEqual(sum(s["scopeCounts"].values()), s["conditions"])

    def test_every_guide_link_points_at_a_real_event_block(self):
        nodes = review.load_nodes()
        for row in _json()["rows"]:
            link = row["link"]
            if not link or link["kind"] != "guide" or "event" not in link:
                continue
            node_id, anchor = link["href"].split("~")
            node_id = node_id.removeprefix("#/guide/")
            self.assertIn(node_id, nodes)
            index = int(anchor.removeprefix("ev"))
            block = nodes[node_id]["blocks"][index]
            self.assertEqual(block["kind"], "event", row["id"])
            self.assertEqual(str(block["label"]), link["event"], row["id"])

    def test_pending_question_blocks_the_build(self):
        def mutate(raw):
            lines = raw.splitlines(keepends=True)
            for i, line in enumerate(lines):
                if line.startswith("doom.tl.dates\t"):
                    parts = line.rstrip("\r\n").split("\t")
                    parts[-1] = "?未裁决的测试问题"
                    lines[i] = "\t".join(parts) + "\n"
                    break
            else:
                raise AssertionError("target row missing")
            return "".join(lines)

        with _patched_tsv(mutate):
            with self.assertRaises(SystemExit):
                es.build()

    def test_bad_event_number_blocks_the_build(self):
        def mutate(raw):
            return raw.replace("notices/angel#3", "notices/angel#9999", 1)

        with _patched_tsv(mutate):
            with self.assertRaises(SystemExit):
                es.build()

    def test_review_decisions_survive_into_runtime_data(self):
        rows = {r["id"]: r for r in _json()["rows"]}
        self.assertNotIn("proud.cdpro1", rows)
        self.assertNotIn("CD-PRO1", json.dumps(_json(), ensure_ascii=False))
        self.assertEqual(rows["kunlun.item.silk"]["name"], "真虹羽纱")
        self.assertEqual(rows["angel.divine10"]["target"], "10")
        self.assertEqual(rows["eternal.fame600"]["target"], "600")
        self.assertFalse(
            any(r["type"] == "resource" for r in _json()["rows"]),
            "4000 万等 resource 条件已从看板移除",
        )
        self.assertEqual(rows["kunlun.tl.maleOnly"]["kind"], "note")
        self.assertEqual(rows["galaxy.tl.stats"]["kind"], "note")

    def test_doomsday_has_male_and_female_slots_with_equal_stats(self):
        rows = [r for r in _json()["rows"] if r["notice"] == "doomsday-warrior"]
        notices = {n["id"]: n for n in _json()["notices"]}
        self.assertEqual(notices["doomsday-warrior"]["slots"], ["main", "support"])
        main = {r["name"]: r["target"] for r in rows
                if r["slot"] == "main" and r["type"] == "stat" and r["phase"] == "notice"}
        support = {r["name"]: r["target"] for r in rows
                   if r["slot"] == "support" and r["type"] == "stat" and r["phase"] == "notice"}
        self.assertEqual(main, support)
        self.assertEqual(main, {"演技": "550", "名气": "550", "体能": "500", "才智": "550"})

    def test_doomsday_has_five_event_nodes_and_no_manual_fallbacks(self):
        rows = _json()["rows"]
        node_ids = [
            r["id"] for r in rows
            if r["notice"] == "doomsday-warrior" and ".node." in r["id"]
        ]
        self.assertEqual(
            node_ids,
            [f"doom.node.{i}" for i in range(1, 6)],
        )
        targets = [r["target"] for r in rows if r["id"] in node_ids]
        self.assertEqual(targets, ["3年3月后", "3年3月", "3年4月", "3年7月", "3年8月"])
        for old_id in ("doom.metSmith", "doom.prepDays"):
            self.assertFalse(any(r["id"] == old_id for r in rows), old_id)

    def test_eternal_love_has_six_event_nodes(self):
        rows = _json()["rows"]
        node_ids = [
            r["id"] for r in rows
            if r["notice"] == "eternal-love" and ".node." in r["id"]
        ]
        self.assertEqual(node_ids, [f"eternal.node.{i}" for i in range(1, 7)])
        names = [r["name"] for r in rows if r["id"] in node_ids]
        self.assertIn("圣约翰的千年十字架", names[1])
        self.assertIn("朱莉外表的小魔女", names[2])
        self.assertIn("暗黑之服", names[3])
        self.assertIn("抽取利金", names[5])

    def test_doomsday_optional_numeric_checks_are_marked(self):
        rows = {r["id"]: r for r in _json()["rows"]}
        expected = {
            "doom.opt.male.films": ("count", "main", "3"),
            "doom.opt.male.stats": ("stat", "main", "600/600"),
            "doom.opt.female.films": ("count", "support", "3"),
            "doom.opt.female.stats": ("stat", "support", "400/400"),
        }
        for row_id, (kind, slot, target) in expected.items():
            self.assertIn(row_id, rows)
            row = rows[row_id]
            self.assertEqual(row["type"], kind)
            self.assertEqual(row["slot"], slot)
            self.assertEqual(row["target"], target)
            self.assertIn("可选", row["name"])

    def test_doomsday_required_film_checks_are_hard_conditions(self):
        rows = {r["id"]: r for r in _json()["rows"]}
        self.assertEqual(rows["doom.req.filmLead"]["target"], "1")
        self.assertEqual(rows["doom.req.films"]["target"], "2")
        for row_id in ("doom.req.filmLead", "doom.req.films"):
            self.assertEqual(rows[row_id]["scope"], "artist")
            self.assertEqual(rows[row_id]["phase"], "prepare")
            self.assertNotIn("可选", rows[row_id]["name"])

    def test_kunlun_has_three_named_role_slots(self):
        notices = {n["id"]: n for n in _json()["notices"]}
        self.assertEqual(
            [s for s in notices["kunlun-adventure"]["slots"] if s.startswith("role:")],
            ["role:男主", "role:女主一", "role:女主二"],
        )
        self.assertEqual(notices["galaxy"]["slots"], ["group"])


if __name__ == "__main__":
    unittest.main()
