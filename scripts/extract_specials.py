#!/usr/bin/env python3
"""Build public/data/specials.json from the hand-maintained condition table.

`sources/special-notices.tsv` is the single source of truth for the 六大通告
planner. This script only transcribes it and resolves every deep link against
the real event blocks in guide.json -- it does not invent or normalise game
values, and it refuses to emit runtime data while a row still carries an
unresolved question in the `verify` column.

Usage: python scripts/extract_specials.py
Reads: sources/special-notices.tsv, public/data/guide.json
Writes: public/data/specials.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_specials_review as review  # noqa: E402

ROOT = HERE.parent
OUT = ROOT / "public" / "data" / "specials.json"

# The planner card links back to the guide page for that special notice.
# `_global` is the top-of-page prerequisite, not a card, so it has none.
GUIDE_NODES = {
    "_global": None,
    "proud-of-the-world": "notices/proud-of-the-world",
    "doomsday-warrior": "notices/doomsday-warrior",
    "eternal-love": "notices/eternal-love",
    "angel": "notices/angel",
    "kunlun-adventure": "notices/kunlun-adventure",
    "galaxy": "notices/galaxy",
}

# 落入凡间的天使 / 万年之恋 only ever go to one artist — the game picks a
# single 主艺人, so the main slot must hold one name, not a candidate pool.
SOLO_MAIN = {"angel", "eternal-love"}

FIELDS_TO_EMIT = [
    "id", "notice", "slot", "phase", "kind", "type", "scope",
    "name", "target", "hint", "source",
]


def resolve_link(raw: str, anchors: dict[str, str]):
    """Turn a TSV link into a UI-ready hash link (no host, no dev-server URL)."""
    if raw.startswith("tracker:"):
        return {
            "kind": "tracker",
            "href": "#/tracker",
            "node": raw.split(":", 1)[1],
        }
    if "#" in raw:
        node_id, label = raw.split("#", 1)
        return {
            "kind": "guide",
            "href": f"#/guide/{node_id}~{anchors[raw]}",
            "node": node_id,
            "event": label,
        }
    if raw == "-":
        return None
    return {"kind": "guide", "href": f"#/guide/{raw}", "node": raw}


def build():
    nodes = review.load_nodes()
    anchors = review.build_anchors(nodes)
    rows = review.read_rows(nodes, anchors)

    pending = [r["id"] for r in rows if r["verify"] != "-"]
    if pending:
        raise SystemExit(f"unresolved questions: {', '.join(pending)}")

    for notice_id, node_id in GUIDE_NODES.items():
        if node_id and node_id not in nodes:
            raise SystemExit(f"guide node missing for {notice_id}: {node_id}")

    out_rows = []
    for row in rows:
        item = {key: row[key] for key in FIELDS_TO_EMIT}
        item["link"] = resolve_link(row["link"], anchors)
        out_rows.append(item)

    notices = []
    for notice_id in review.ORDER:
        group = [r for r in out_rows if r["notice"] == notice_id]
        if not group:
            continue
        notices.append({
            "id": notice_id,
            "title": review.NOTICE_TITLES[notice_id],
            "guideNode": GUIDE_NODES[notice_id],
            "conditionCount": sum(1 for r in group if r["kind"] == "condition"),
            "noteCount": sum(1 for r in group if r["kind"] == "note"),
            "slots": list(dict.fromkeys(r["slot"] for r in group if r["slot"] != "-")),
            "soloMain": notice_id in SOLO_MAIN,
        })

    conditions = [r for r in out_rows if r["kind"] == "condition"]
    scopes: dict[str, int] = {}
    for row in conditions:
        scopes[row["scope"]] = scopes.get(row["scope"], 0) + 1

    return {
        "version": 1,
        "meta": {
            "generatedBy": "scripts/extract_specials.py",
            "source": "sources/special-notices.tsv",
        },
        "stats": {
            "rows": len(out_rows),
            "conditions": len(conditions),
            "notes": len(out_rows) - len(conditions),
            "scopeCounts": dict(sorted(scopes.items())),
            "eventAnchorsChecked": len(anchors),
        },
        "notices": notices,
        "rows": out_rows,
    }


def main():
    data = build()
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    OUT.write_bytes(payload.encode("utf-8"))
    s = data["stats"]
    print(
        f"OK  {s['rows']} rows | {s['conditions']} conditions | {s['notes']} notes | "
        f"{len(data['notices'])} notices | {s['eventAnchorsChecked']} anchors checked"
    )
    print(f"    -> {OUT}")


if __name__ == "__main__":
    main()
