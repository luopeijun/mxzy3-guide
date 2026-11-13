"""Build the 甜蜜乐章 CG gallery from one folder per character.

The source images arrive one by one with **no name and no unlock condition**;
the file name is the only label we have, so it doubles as the displayed
number::

    outputs/sweet-cg/<groupSlug>/<code>.<bmp|png|jpg|webp>
        -> public/images/sweet-cg/<groupSlug>/<code>.webp
        -> public/data/sweet/cg.json

``groupSlug`` is the tail of the guide node id (``cheng-zhongxuan``, …), plus
``protagonist`` for 杜云芊 (she has no guide node).  ``code`` is sorted with a
natural key so ``1, 2, 10`` stays in that order.  The script is a **full
rebuild**: keep every image you have been sent in ``outputs/sweet-cg/`` (that
folder is ignored by git), then rerun it after each batch.

Group names and circular avatars come from ``public/data/sweet/guide.json``'s
character nodes, exactly like ``extract_cg.py`` does for the main site.  Items
carry only an id / group / order / code / image; ``name`` and ``condition`` are
empty strings and there is no ``guide`` link yet — 攻略跳转 is a later step.
``width`` / ``height`` stay 0 because the gallery never consumes them (this
also keeps ``test_sweet_cg.py`` free of any Pillow dependency).
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "outputs" / "sweet-cg"
OUT_IMAGES = ROOT / "public" / "images" / "sweet-cg"
OUT_GROUPS = ROOT / "public" / "data" / "sweet" / "cg.json"
GUIDE_DATA = ROOT / "public" / "data" / "sweet" / "guide.json"

CHARACTER_CATEGORY = "sweet-characters"
IMAGE_EXTS = {".bmp", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_EDGE = 1400
QUALITY = 82

# 主角没有攻略节点，头像单独固定（620-1.bmp 转出来的那张，不是卫亚）。
PROTAGONIST = {
    "id": "protagonist",
    "name": "杜云芊",
    "kind": "agent",
    "avatar": "images/sweet/protagonist-logo.png",
    "guideId": "",
}

# 支线五位也有圆圈头像；确认她们有 CG 后把开关翻成 True，分组就会一起出现。
# 单独放着，免得框架阶段侧栏挂五个永远 0/0 的空组。
ENABLE_EXTRA_GROUPS = False
EXTRA_GROUPS = [
    ("tian-qing", "天晴"),
    ("xia-yijun", "夏以军"),
    ("du-sichen", "杜司臣"),
    ("xu-shijie", "徐世杰"),
    ("jin-haoxun", "金皓薰"),
]


def read_text(path: Path) -> str:
    return path.read_bytes().decode("utf-8-sig")


def natural_key(code: str) -> list[object]:
    """`1`, `2`, `10` instead of `1`, `10`, `2`."""
    return [int(part) if part.isdigit() else part.lower()
            for part in re.split(r"(\d+)", code)]


def build_groups() -> list[dict]:
    guide = json.loads(read_text(GUIDE_DATA))
    category = next(
        (entry for entry in guide["categories"] if entry["id"] == CHARACTER_CATEGORY),
        None,
    )
    if category is None:
        raise SystemExit(f"missing category {CHARACTER_CATEGORY!r} in {GUIDE_DATA}")

    groups = [dict(PROTAGONIST)]
    for node in category.get("children", []):
        avatar = node.get("avatar")
        if not avatar:
            continue
        if not (ROOT / "public" / avatar).is_file():
            raise SystemExit(f"missing avatar for {node['id']}: {avatar}")
        groups.append({
            "id": node["id"].rsplit("/", 1)[-1],
            "name": node["title"],
            "kind": "artist",
            "avatar": avatar,
            "guideId": node["id"],
        })

    if ENABLE_EXTRA_GROUPS:
        for slug, name in EXTRA_GROUPS:
            avatar = f"images/sweet/{slug}-logo.png"
            if not (ROOT / "public" / avatar).is_file():
                raise SystemExit(f"missing avatar for extra group {slug}: {avatar}")
            groups.append({
                "id": slug,
                "name": name,
                "kind": "artist",
                "avatar": avatar,
                "guideId": f"sweet-side/{slug}",
            })

    if len({group["id"] for group in groups}) != len(groups):
        raise SystemExit("duplicate CG group ids")
    return groups


def scan_sources(groups: list[dict]) -> list[dict]:
    """Return one job per source image, already in display order."""
    known = {group["id"]: group for group in groups}
    jobs: list[dict] = []
    seen: set[str] = set()

    for folder in sorted(SRC.iterdir()) if SRC.is_dir() else []:
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        if folder.name not in known:
            raise SystemExit(
                f"unknown CG group folder {folder.name!r}; expected one of "
                + ", ".join(known)
            )
        by_code: dict[str, Path] = {}
        for source in folder.iterdir():
            if not source.is_file() or source.suffix.lower() not in IMAGE_EXTS:
                continue
            code = source.stem.strip()
            if not code:
                raise SystemExit(f"empty CG code: {source}")
            if code in by_code:
                raise SystemExit(
                    f"two images share the code {code!r} in {folder}: "
                    f"{by_code[code].name} and {source.name}"
                )
            by_code[code] = source

        for code in sorted(by_code, key=natural_key):
            item_id = f"{folder.name}-{code}"
            if item_id in seen:
                raise SystemExit(f"duplicate CG id {item_id!r}")
            seen.add(item_id)
            jobs.append({
                "groupId": folder.name,
                "id": item_id,
                "code": code,
                "source": by_code[code],
                "target": OUT_IMAGES / folder.name / f"{code}.webp",
                "image": f"images/sweet-cg/{folder.name}/{code}.webp",
            })
    return jobs


def build_payload(groups: list[dict], jobs: list[dict]) -> dict:
    """Pure metadata — safe for the unit tests to recompute without Pillow."""
    counts = {group["id"]: 0 for group in groups}
    for job in jobs:
        counts[job["groupId"]] += 1
    ordered_groups = [{**group, "count": counts[group["id"]]} for group in groups]

    items = [{
        "id": job["id"],
        "groupId": job["groupId"],
        "order": index,
        "code": job["code"],
        "name": "",
        "condition": "",
        "image": job["image"],
        "width": 0,
        "height": 0,
    } for index, job in enumerate(jobs, start=1)]

    return {
        "version": 1,
        "meta": {
            "itemCount": len(items),
            "groupCount": len(ordered_groups),
            "missingImageCount": sum(1 for item in items if item["image"] is None),
        },
        "groups": ordered_groups,
        "items": items,
    }


def write_images(jobs: list[dict]) -> int:
    """Full rebuild: drop the old webp tree, then convert every source image."""
    from PIL import Image

    if OUT_IMAGES.is_dir():
        shutil.rmtree(OUT_IMAGES)
    total = 0
    for job in jobs:
        job["target"].parent.mkdir(parents=True, exist_ok=True)
        with Image.open(job["source"]) as opened:
            image = opened.convert("RGB")
            image.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            image.save(job["target"], "WEBP", quality=QUALITY, method=6)
        total += job["target"].stat().st_size
    return total


def main() -> None:
    groups = build_groups()
    jobs = scan_sources(groups)
    payload = build_payload(groups, jobs)
    total_bytes = write_images(jobs)
    OUT_GROUPS.parent.mkdir(parents=True, exist_ok=True)
    # 与 public/data/*.json 的现有写法一致（Windows 上落 CRLF）；单测比对时
    # 会把 CRLF 归一成 LF，避免平台差异造成假红。
    OUT_GROUPS.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    per_group = ", ".join(f"{g['name']} {g['count']}" for g in payload["groups"] if g["count"])
    print(
        f"wrote {OUT_GROUPS.relative_to(ROOT)}: {len(payload['items'])} items / "
        f"{len(payload['groups'])} groups, images {total_bytes / 1024:.0f} KB"
    )
    print(f"groups with images: {per_group or '(none yet)'}")


if __name__ == "__main__":
    main()
