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
        self.assertEqual(s["rows"], 101)
        self.assertEqual(s["conditions"], 73)
        self.assertEqual(s["notes"], 28)
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

    def test_kunlun_has_three_named_role_slots(self):
        notices = {n["id"]: n for n in _json()["notices"]}
        self.assertEqual(
            [s for s in notices["kunlun-adventure"]["slots"] if s.startswith("role:")],
            ["role:男主", "role:女主一", "role:女主二"],
        )
        self.assertEqual(notices["galaxy"]["slots"], ["group"])


if __name__ == "__main__":
    unittest.main()
