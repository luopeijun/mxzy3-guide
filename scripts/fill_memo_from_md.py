#!/usr/bin/env python3
"""把「游戏排班与心得记录.md」的内容套进备忘录 Excel 模板。

对齐规则：
  * 绝大多数周：按 md 标注的「月.日–月.日」去匹配模板里相同的日期区间
    （模板日期带年份，md 不带；用记录所属的第几年补全年份）。
  * 唯一例外 = 第 1 年第 1 月：md 的周次号对、但日期整体晚标了一周
    （md 写「第 1 周 1.8–1.14」，实际游戏第 1 周是 1.1–1.7）。
    这 4 条按周次号定位到模板 1 月的第 1–4 周，内容原样保留。

用法：
    python scripts/fill_memo_from_md.py                      # 默认 md -> outputs/
    python scripts/fill_memo_from_md.py <md路径> <输出xlsx路径>
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MD = Path(r"E:/documents/workbuddy/2026-11-07-22-44-12/游戏排班与心得记录.md")
DEFAULT_TEMPLATE = ROOT / "public/memo-template.xlsx"
DEFAULT_OUT = ROOT / "outputs/游戏排班与心得记录-已填入模板.xlsx"

# | 第 1 周（1.8–1.14） | 排班 | 备注 |
WEEK_ROW = re.compile(
    r"^\|\s*第\s*(\d+)\s*周\s*[（(]([^）)]+)[）)]\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$"
)
MD_RANGE = re.compile(r"(\d{1,2})\.(\d{1,2})\s*[–—~-]\s*(\d{1,2})\.(\d{1,2})")
TPL_RANGE = re.compile(r"(\d{4})\.(\d{1,2})\.(\d{1,2})-(\d{4})\.(\d{1,2})\.(\d{1,2})")


def main() -> None:
    md_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MD
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    records: list[tuple[int, int, str, str, str]] = []
    year = 0
    for line in md_path.read_text(encoding="utf-8").splitlines():
        head = re.match(r"^##\s*第\s*(\d+)\s*年", line)
        if head:
            year = int(head.group(1))
            continue
        match = WEEK_ROW.match(line)
        if match:
            records.append(
                (year, int(match.group(1)), match.group(2).strip(),
                 match.group(3).strip(), match.group(4).strip())
            )

    wb = openpyxl.load_workbook(DEFAULT_TEMPLATE)
    ws = wb.active

    # 预建模板索引：日期区间(月日起止) -> 行号；(年,月,周次) -> 行号
    by_range: dict[tuple[int, int, int, int], list[int]] = {}
    by_week: dict[tuple[str, str, str], int] = {}
    for row in range(2, ws.max_row + 1):
        by_week[(str(ws.cell(row, 1).value), str(ws.cell(row, 2).value), str(ws.cell(row, 3).value))] = row
        rng = TPL_RANGE.match(str(ws.cell(row, 4).value or ""))
        if rng:
            key = (int(rng.group(2)), int(rng.group(3)), int(rng.group(5)), int(rng.group(6)))
            by_range.setdefault(key, []).append(row)

    warnings: list[str] = []
    preview: list[tuple[str, str, str]] = []
    for md_year, week_no, md_range, schedule, note in records:
        base_year = 2005 + md_year
        row = None
        parsed_here = MD_RANGE.search(md_range)
        start_month = int(parsed_here.group(1)) if parsed_here else 0

        # 唯一例外：第 1 年第 1 月的 4 条，按周次号定位（日期标注晚了一周）
        is_first_january = md_year == 1 and start_month == 1
        if is_first_january:
            row = by_week.get(("1", "1", str(week_no)))

        # 其余按标注日期匹配，用第几年补全年份
        if row is None:
            parsed = MD_RANGE.search(md_range)
            if not parsed:
                warnings.append(f"第{md_year}年 周次{week_no}：无法解析日期「{md_range}」")
                continue
            sm, sd, em, ed = (int(x) for x in parsed.groups())
            candidates = by_range.get((sm, sd, em, ed), [])
            year_ok = [
                r for r in candidates
                if base_year - 1 <= int(TPL_RANGE.match(str(ws.cell(r, 4).value)).group(1)) <= base_year
            ]
            if len(year_ok) == 1:
                row = year_ok[0]
            elif year_ok:
                row = year_ok[0]
                warnings.append(f"第{md_year}年 周次{week_no}「{md_range}」匹配到多行 {year_ok}，取第一行")
            else:
                warnings.append(f"第{md_year}年 周次{week_no}「{md_range}」在模板中无匹配")

        if row is None:
            continue
        tpl_range = str(ws.cell(row, 4).value or "")
        preview.append((f"第{md_year}年 第{week_no}周（{md_range}）", tpl_range, (schedule or note or "")[:24]))
        ws.cell(row, 5).value = schedule or None
        ws.cell(row, 6).value = note or None

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)

    filled = sum(1 for r in range(2, ws.max_row + 1) if ws.cell(r, 5).value or ws.cell(r, 6).value)
    print(f"md {len(records)} 条 -> 模板填入 {filled} 周；输出：{out_path}")
    if warnings:
        print("警告：")
        for w in warnings:
            print("  -", w)
    print("对齐预览（md 标注 -> 模板区间）：")
    for src, tpl, brief in preview[:6] + preview[-3:]:
        print(f"  {src:<32} -> {tpl:<20} {brief}")


if __name__ == "__main__":
    main()
