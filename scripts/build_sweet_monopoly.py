"""从甜蜜乐章源码 RichBa.dat 生成大富翁题库 txt，答案沿用明星志愿3 题库。

- 题目 / 选项 / 组号：`Data/RichBa.dat`（201 条 × 468B），
  `+4` = 组号（第 N 题，1..10），`+8` = 题目 Big5（101B），
  `+109` 起 6 个选项（每个 51B）。
- 答案：读主站 `public/data/guide.json` 的 `game-guide/monopoly-answers`
  节点（`qa` block 的 text/answer）。先按归一题目精确匹配，再按相似度配对。
- 产物 `sources/sweet/monopoly.txt` 供 `extract_sweet_guide.py` 走
  `build_monopoly_blocks()`，渲染格式与主站一致（section 第N题 + qa）。

用法（仓库根下）：
    python scripts/build_sweet_monopoly.py
"""

from __future__ import annotations

import difflib
import json
import re
import struct
import sys
import zlib
from pathlib import Path

import zhconv

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = Path(r"D:\Program Files (x86)\Softstar\Stardom3 - Sweet Melody\Data")
OUT = ROOT / "sources" / "sweet" / "monopoly.txt"
MAIN_GUIDE = ROOT / "public" / "data" / "guide.json"

# 甜站题库里主站没有、且相似度配不上的题，人工核定答案。
MANUAL_ANSWERS = {
    "卢浮宫在哪里？": "巴黎",
}
# 两站题目措辞差异较大时相似度会掉到 0.6~0.85；逐条核对过最佳候选都是同一题，
# 所以阈值放宽到 0.6，再低就判为无法对应（避免错配）。
SIMILAR_THRESHOLD = 0.6


def simplify(text: str) -> str:
    return zhconv.convert(text, "zh-cn")


def norm(text: str) -> str:
    text = simplify(text)
    return re.sub(r"[\s　，。？！、：；「」『』（）()\"“”'’．.…~～\-—﹖]", "", text)


def read_questions(data_dir: Path) -> list[tuple[int, str, list[str]]]:
    raw = (data_dir / "RichBa.dat").read_bytes()
    magic, count, size = struct.unpack_from("<iii", raw, 0)
    if magic != 1010 or count * size + 12 > len(raw):
        raise SystemExit("unexpected RichBa.dat layout")

    def big5(base: int, offset: int, limit: int) -> str:
        start = base + offset
        end = raw.find(b"\0", start, start + limit)
        if end < 0:
            end = start + limit
        try:
            return raw[start:end].decode("big5", "replace").strip()
        except Exception:
            return ""

    rows = []
    for index in range(count):
        base = 12 + index * size
        group = struct.unpack_from("<i", raw, base + 4)[0]
        question = big5(base, 8, 101)
        if not question:
            continue
        options = [big5(base, 109 + 51 * k, 51) for k in range(6)]
        rows.append((group, question, [opt for opt in options if opt]))
    return rows


def read_main_answers(path: Path) -> list[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    for category in data.get("categories", []):
        stack = list(category.get("children", []))
        while stack:
            node = stack.pop()
            if node.get("id") == "game-guide/monopoly-answers":
                return [
                    (block["text"], block["answer"])
                    for block in node.get("blocks", [])
                    if block.get("kind") == "qa" and block.get("text") and block.get("answer")
                ]
            stack.extend(node.get("children", []))
    raise SystemExit("main monopoly node not found")


def main() -> int:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    rows = read_questions(data_dir)
    main_answers = read_main_answers(MAIN_GUIDE)

    by_norm: dict[str, str] = {}
    for question, answer in main_answers:
        by_norm.setdefault(norm(question), answer)

    resolved: list[tuple[int, str, str, str]] = []
    unmatched: list[tuple[int, str]] = []
    for group, question, _options in rows:
        key = norm(question)
        answer = by_norm.get(key)
        source = "exact"
        if not answer:
            simplified = simplify(question)
            answer = MANUAL_ANSWERS.get(simplified) or MANUAL_ANSWERS.get(question)
            source = "manual"
        if not answer:
            best = None
            best_ratio = 0.0
            for other, other_answer in main_answers:
                ratio = difflib.SequenceMatcher(None, key, norm(other)).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best = other_answer
            if best is not None and best_ratio >= SIMILAR_THRESHOLD:
                answer = best
                source = f"similar {best_ratio:.2f}"
        if answer:
            resolved.append((group, simplify(question), answer, source))
        else:
            unmatched.append((group, question))

    if unmatched:
        print(f"未匹配 {len(unmatched)} 题：")
        for group, question in unmatched:
            print(f"  第{group}题 | {simplify(question)}")
        return 1

    lines = ["★大富翁BaBaBa答案", ""]
    current = None
    for group, question, answer, _source in sorted(resolved, key=lambda row: row[0]):
        if group != current:
            current = group
            lines.append("")
        lines.append(f"{group}) {question}")
        lines.append(f"Ans: {answer}")
    lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")

    stats: dict[str, int] = {}
    for _group, _question, _answer, source in resolved:
        bucket = "exact" if source == "exact" else ("manual" if source == "manual" else "similar")
        stats[bucket] = stats.get(bucket, 0) + 1
    print(f"写出 {len(resolved)} 题 -> {OUT}")
    print(f"答案来源: {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
