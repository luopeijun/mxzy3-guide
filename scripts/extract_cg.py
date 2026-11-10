"""Build the CG gallery data + thumbnails from the local CG archive.

Two source files are kept in sync by index (both 204 rows):

* ``CG清单.csv``  — the renamed, human-readable image files and their labels
* ``manifest.json`` — stable ids (``main-1``, ``lin-2`` …) and group ordering

Both are byte-read and decoded here; never retype the Chinese labels, the
original file contains full-width punctuation that must survive untouched.

Output: ``public/images/cg/<id>.webp`` (one file per CG, also used later by the
lightbox) and ``public/data/cg.json`` (metadata loaded at runtime).
"""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "outputs" / "明星志愿3_CG图鉴"
OUT_IMAGES = ROOT / "public" / "images" / "cg"
OUT_DATA = ROOT / "public" / "data" / "cg.json"

MAX_EDGE = 1100
QUALITY = 76

# 「主线」是玩家扮演的经纪人本人的 CG，不是剧情线；画廊里按人物分组显示成「经纪人」。
GROUP_LABELS = {"主线": "经纪人"}


def read_text(path: Path) -> str:
    return path.read_bytes().decode("utf-8-sig")


def main() -> None:
    manifest = json.loads(read_text(SRC / "manifest.json"))
    rows = list(csv.DictReader(io.StringIO(read_text(SRC / "CG清单.csv"))))
    if len(manifest) != len(rows):
        raise SystemExit(f"manifest {len(manifest)} rows != csv {len(rows)} rows")

    OUT_IMAGES.mkdir(parents=True, exist_ok=True)
    for stale in OUT_IMAGES.glob("*.webp"):
        stale.unlink()

    groups: dict[str, dict] = {}
    items: list[dict] = []
    total_bytes = 0

    for index, (meta, row) in enumerate(zip(manifest, rows), start=1):
        # Guard against the two files ever drifting out of order.
        for csv_key, meta_key in (
            ("人物", "group"),
            ("编号", "title"),
            ("CG名称", "desc"),
            ("获得条件", "condition"),
        ):
            if row[csv_key] != meta[meta_key]:
                raise SystemExit(
                    f"row {index}: {csv_key}={row[csv_key]!r} != {meta_key}={meta[meta_key]!r}"
                )

        item_id: str = meta["id"]
        group_id = item_id.rsplit("-", 1)[0]
        group_name = meta["group"]
        if group_id not in groups:
            groups[group_id] = {
                "id": group_id,
                "name": GROUP_LABELS.get(group_name, group_name),
                "kind": "agent" if group_name == "主线" else "artist",
                "count": 0,
            }
        groups[group_id]["count"] += 1

        saved_path = row["保存路径"].strip()
        if saved_path:
            image_path = SRC / saved_path
            if not image_path.is_file():
                raise SystemExit(f"row {index}: missing image {image_path}")
            with Image.open(image_path) as opened:
                image = opened.convert("RGB")
                image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
                width, height = image.size
                target = OUT_IMAGES / f"{item_id}.webp"
                image.save(target, "WEBP", quality=QUALITY, method=6)
            total_bytes += target.stat().st_size
            image_url: str | None = f"images/cg/{item_id}.webp"
        else:
            # 「站点未提供图片」：保留编号 / 名称 / 获得条件，画廊里显示占位格，
            # 这样图鉴的 204 个位置和收集进度仍然完整。
            if row["状态"] != "站点未提供图片":
                raise SystemExit(f"row {index}: empty image path but status={row['状态']!r}")
            width = height = 0
            image_url = None

        items.append(
            {
                "id": item_id,
                "groupId": group_id,
                "order": meta["order"],
                "code": meta["title"],
                "name": meta["desc"],
                "condition": meta["condition"],
                "image": image_url,
                "width": width,
                "height": height,
            }
        )

    payload = {
        "version": 1,
        "meta": {
            "itemCount": len(items),
            "groupCount": len(groups),
            "missingImageCount": sum(1 for item in items if item["image"] is None),
        },
        "groups": list(groups.values()),
        "items": items,
    }
    OUT_DATA.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {OUT_DATA.relative_to(ROOT)}: {len(items)} items / {len(groups)} groups, "
        f"images {total_bytes / 1024 / 1024:.1f} MB"
    )


if __name__ == "__main__":
    main()
