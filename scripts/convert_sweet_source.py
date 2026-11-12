"""把原始攻略 txt（GBK 繁体）转成 sources/sweet/*.txt（UTF-8 + CRLF）。

用法（在仓库根下）：
    python scripts/convert_sweet_source.py 卫亚.txt wei-ya.txt
    python scripts/convert_sweet_source.py 卫亚.txt:wei-ya.txt 纪翔.txt:ji-xiang.txt

原始素材在 `E:/Documents/明星志愿/攻略txt/甜蜜乐章/`，只读不写；产物落在
`sources/sweet/`，再由 `extract_sweet_guide.py` 生成 JSON。

转码规则（顺序有讲究）：
1. 解码 GBK（个别文件是 gb18030 / big5，按顺序试）。
2. 换行归一成 \\n，再一次性写成 CRLF —— **不要中途 write_text**，Windows 会把
   已存在的 \\r\\n 再翻成 \\r\\r\\n，空行会成倍变多。
3. 清掉 ASCII 控制字符（自制通告那页混进过 0x18）。
4. zhconv 转简体。
5. 全角数字 / `．` / `－` / `％` 归 ASCII。
6. 每行去尾空格（源文本用它对齐，进页面后只会多出看不见的空白）。
7. 补 zhconv 漏掉的：「讃」是「赞」的异体；「著」作语助词时应为「着」
   （「著名 / 原著 / 名著 / 土著 / 著作」这类词保留）。
8. 原文错字按用户裁决补正（见 FIXES）。

注意：`parse_character` 依赖「签约金 / 分红 / 可创作作品 / 事件」这些行原样存在，
所以这里只做字符级处理，不动行序、不加不删任何一行。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import zhconv

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = Path(r"E:\Documents\明星志愿\攻略txt\甜蜜乐章")
DST_DIR = ROOT / "sources" / "sweet"

CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")  # 换行/制表符之外的控制字符
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
# 「显着」→显著 这种词已经在 zhconv 里转好了，这里只收剩下没转的语助词「著」。
ZHU_RE = re.compile(r"(?<![显原名土])著(?![名作述书者])")

EXTRA_CHARS = {
    "讃": "赞",  # 稱讃 / 讃美
    "％": "%",  # 沈惟真的「分红：20％」
}

# 原文错字 → 正字（用户明确裁决过的才写在这里，别顺手改作者的行文）
FIXES = {
    "稱讚": "称赞",
    "稱讃": "称赞",
    # 约会页的地点被 OCR 成了「咚門」，游戏里是东门商店街（本仓其它页也写作商店街）。
    "咚门商店街": "东门商店街",
}


def convert(source: Path, target: Path) -> int:
    raw = source.read_bytes()
    for encoding in ("gbk", "gb18030", "big5", "utf-8"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit(f"{source.name}: 无法解码")

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = CTRL_RE.sub("", text)
    text = zhconv.convert(text, "zh-cn")
    text = text.translate(DIGITS).replace("．", ".").replace("－", "-")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    for bad, good in EXTRA_CHARS.items():
        text = text.replace(bad, good)
    text = ZHU_RE.sub("着", text)
    for bad, good in FIXES.items():
        text = text.replace(bad, good)

    data = text.replace("\n", "\r\n").encode("utf-8")
    target.write_bytes(data)
    return data.count(b"\r\n")


def parse_pairs(argv: list[str]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for arg in argv:
        if ":" in arg:
            name, slug = arg.split(":", 1)
            pairs.append((name, slug))
        else:
            pairs.append((arg, arg))  # 只给一个名字时，输出同名
    return pairs


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for name, slug in parse_pairs(sys.argv[1:]):
        lines = convert(SRC_DIR / name, DST_DIR / slug)
        print(f"{name} -> {slug}: {lines} 行")


if __name__ == "__main__":
    main()
