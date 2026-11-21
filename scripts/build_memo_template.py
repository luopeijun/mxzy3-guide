"""Build the memo Excel template for the #/case save reader.

The in-game calendar starts 2006-01-01, which is a Sunday. A game week runs
Sunday -> Saturday. We pre-fill three years of week rows (year / month / week
number / date range) and leave the note columns empty for the player to fill.

The date range always carries an explicit year on both ends so a cross-year
week (e.g. 2006.12.31-2007.1.6) cannot be mis-matched by the reader.

Run with the managed venv python. Output: public/memo-template.xlsx
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "memo-template.xlsx"

GAME_START = date(2006, 1, 1)   # Sunday
GAME_END = date(2008, 12, 31)

HEADERS = ["年", "月", "周次", "日期区间", "当周排班", "心得备注"]


def build_weeks() -> list[dict[str, str]]:
    weeks: list[dict[str, str]] = []
    cur = GAME_START
    while cur <= GAME_END:
        end = cur + timedelta(days=6)
        week_no = (cur.day - 1) // 7 + 1
        date_range = f"{cur.year}.{cur.month}.{cur.day}-{end.year}.{end.month}.{end.day}"
        weeks.append(
            {
                "year": str(cur.year - 2005),   # 游戏内第几年：2006 -> 1
                "month": str(cur.month),
                "week": str(week_no),
                "range": date_range,
            }
        )
        cur += timedelta(days=7)
    return weeks


def main() -> None:
    weeks = build_weeks()
    wb = Workbook()
    ws = wb.active
    ws.title = "每周备忘录"

    header_fill = PatternFill("solid", fgColor="FCE4D6")
    header_font = Font(bold=True)
    ws.append(HEADERS)
    for col in range(1, len(HEADERS) + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for w in weeks:
        ws.append([w["year"], w["month"], w["week"], w["range"], "", ""])

    widths = [6, 6, 8, 24, 60, 60]
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width
    for row in ws.iter_rows(min_row=2, min_col=1, max_col=4):
        for cell in row:
            cell.alignment = Alignment(horizontal="center", vertical="center")
    for row in ws.iter_rows(min_row=2, min_col=5, max_col=6):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    ws.freeze_panes = "A2"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"wrote {OUT} ({len(weeks)} weeks)")
    print("first:", weeks[0])
    print("last :", weeks[-1])


if __name__ == "__main__":
    main()
