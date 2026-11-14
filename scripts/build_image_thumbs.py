#!/usr/bin/env python3
"""Generate lightweight webp thumbnails for every source image in public/images.

The full-size originals are kept untouched: the CG lightbox still opens them so
players can see the artwork at full resolution. Cards, avatars and article covers
use the thumbnails instead, which is what makes the site usable on a slow link
(GitHub Pages from mainland China can take seconds per 100 KB).

Layout is a mirror of the source tree::

    images/cg/chen-6.webp                -> images/thumbs/cg/chen-6.webp
    images/sweet-cg/protagonist/1.webp   -> images/thumbs/sweet-cg/protagonist/1.webp
    images/sweet/du-sichen-logo.png      -> images/thumbs/sweet/du-sichen-logo.webp

So the frontend rule is one line: replace the ``images/`` prefix with
``images/thumbs/`` and the extension with ``.webp``.

Widths are chosen from where the image is actually displayed, never upscaled:
    *-logo.*   -> 128 px  (20 px tree avatar, 64 px character card, 26 px header)
    *-cover.*  -> 800 px  (article cover, w-full inside the reading column)
    everything else (CG) -> 560 px  (380 px card, 520 px at the large size)

Usage:
    python scripts/build_image_thumbs.py              # regenerate all
    python scripts/build_image_thumbs.py --check      # verify, do not write
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_ROOT = ROOT / "public" / "images"
OUT_ROOT = SRC_ROOT / "thumbs"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}
QUALITY = 74
MAX_THUMB_BYTES = 90 * 1024
WIDTH_LOGO = 128
WIDTH_COVER = 800
WIDTH_CG = 560


def target_width(src: Path) -> int:
    stem = src.stem
    if stem.endswith("-logo"):
        return WIDTH_LOGO
    if stem.endswith("-cover"):
        return WIDTH_COVER
    return WIDTH_CG


def source_files() -> list[Path]:
    """All originals, excluding anything already under the thumbs mirror."""
    return sorted(
        p for p in SRC_ROOT.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTS
        and OUT_ROOT not in p.parents
    )


def thumb_path(src: Path) -> Path:
    rel = src.relative_to(SRC_ROOT)
    return OUT_ROOT / rel.parent / (src.stem + ".webp")


def encode(src: Path) -> bytes:
    im = Image.open(src)
    has_alpha = im.mode in ("RGBA", "LA") or (
        im.mode == "P" and "transparency" in im.info
    )
    im = im.convert("RGBA" if has_alpha else "RGB")
    max_width = target_width(src)
    if im.width > max_width:
        im = im.resize((max_width, round(im.height * max_width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=QUALITY, method=6)
    return buf.getvalue()


def check() -> list[str]:
    """Return a list of problems; an empty list means the mirror is complete."""
    problems: list[str] = []
    for src in source_files():
        dst = thumb_path(src)
        if not dst.is_file():
            problems.append(f"missing thumbnail: {dst.relative_to(ROOT)}")
            continue
        if dst.stat().st_size > MAX_THUMB_BYTES:
            problems.append(
                f"thumbnail too large ({dst.stat().st_size} B): {dst.relative_to(ROOT)}"
            )
    known = {thumb_path(src) for src in source_files()}
    for dst in OUT_ROOT.rglob("*.webp"):
        if dst not in known:
            problems.append(f"orphan thumbnail: {dst.relative_to(ROOT)}")
    return problems


def build() -> None:
    before = after = 0
    for src in source_files():
        dst = thumb_path(src)
        data = encode(src)
        before += src.stat().st_size
        after += len(data)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
    print(f"images: {len(source_files())} thumbnails written")
    print(f"original {before / 1024:.0f} KB -> thumbnails {after / 1024:.0f} KB "
          f"({before / max(after, 1):.1f}x smaller)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify without writing")
    args = ap.parse_args()
    if args.check:
        problems = check()
        for line in problems:
            print(line, file=sys.stderr)
        if problems:
            return 1
        print(f"ok: {len(source_files())} thumbnails present")
        return 0
    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
