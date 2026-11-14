"""图片缩略图的交付校验：每张原图都有对应的小图，且没有多余的孤儿文件。

不依赖 Pillow —— 只按文件名和文件头检查，这样在任何 Python 环境都能跑。
具体的尺寸与编码规则由 `build_image_thumbs.py` 负责，这里只锁「产物完整」。
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "public" / "images"
THUMBS = IMAGES / "thumbs"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_THUMB_BYTES = 90 * 1024


def sources():
    return sorted(
        p for p in IMAGES.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTS and THUMBS not in p.parents
    )


def thumb_for(src):
    rel = src.relative_to(IMAGES)
    return THUMBS / rel.parent / (src.stem + ".webp")


class ImageThumbTests(unittest.TestCase):
    def test_every_source_has_a_thumbnail(self):
        missing = [str(thumb_for(p).relative_to(ROOT)) for p in sources()
                   if not thumb_for(p).is_file()]
        self.assertEqual(missing, [], f"缺少缩略图：{missing[:5]}")
        self.assertGreater(len(sources()), 300)

    def test_thumbnails_are_real_webp_and_smaller(self):
        for src in sources():
            thumb = thumb_for(src)
            if not thumb.is_file():
                continue
            head = thumb.read_bytes()[:12]
            self.assertEqual(head[:4], b"RIFF", str(thumb))
            self.assertEqual(head[8:12], b"WEBP", str(thumb))
            self.assertLess(thumb.stat().st_size, MAX_THUMB_BYTES, str(thumb))
            self.assertLess(thumb.stat().st_size, src.stat().st_size, str(thumb))

    def test_no_orphan_thumbnails(self):
        known = {thumb_for(p) for p in sources()}
        orphans = [str(p.relative_to(ROOT)) for p in THUMBS.rglob("*.webp")
                   if p not in known]
        self.assertEqual(orphans, [], f"多余的缩略图：{orphans[:5]}")

    def test_total_payload_is_halved(self):
        original = sum(p.stat().st_size for p in sources())
        small = sum(thumb_for(p).stat().st_size for p in sources()
                    if thumb_for(p).is_file())
        self.assertLess(small * 2, original,
                        f"缩略图总体积 {small} 没有比原图 {original} 减半")


if __name__ == "__main__":
    unittest.main(verbosity=2)
