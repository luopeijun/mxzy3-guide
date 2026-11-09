/** 通告元信息的配色：时间四档「菱形块 + 同色文字」。
 *
 *  年份有顺序性（第一年 → 第二年 → 第三年 → 特殊），值得给文字色；形状用
 *  菱形（旋转 45° 的方块）与卡片其它视觉元素区分。令牌都在 `global.css @theme`
 *  里，没登记的值回落墨色。 */

const TIME_DOT: Record<string, string> = {
  第一年: 'bg-year-1',
  第二年: 'bg-year-2',
  第三年: 'bg-year-3',
  特殊: 'bg-year-x',
};
const TIME_TEXT: Record<string, string> = {
  第一年: 'text-year-1',
  第二年: 'text-year-2',
  第三年: 'text-year-3',
  特殊: 'text-year-x',
};

export function timeDot(time?: string | null): string {
  return (time && TIME_DOT[time]) || 'bg-ink-faint';
}

export function timeText(time?: string | null): string {
  return (time && TIME_TEXT[time]) || 'text-ink';
}
