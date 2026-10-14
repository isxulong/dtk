/**
 * engine.js —— 申论格子纸排版引擎（纯逻辑，无 DOM 依赖，可被 Node 直接 import 测试）
 * 版本：20261014e（与 index.html 的引用 query 同步，防缓存错位）
 *
 * 终局裁决（E）落地口径：
 * - D1 点号默认独占一格，仅落点恰为行首（上一行 25 格已满）时并入末字格（考试允许；
 *   F1 视觉区分已按用户 2026-10-13 真机反馈移除，merge-eol 仅保留标记语义）
 * - D2 半角点号不挤格，随数字字母口径两两并格（保留「1.」序数一格）
 * - D3 叠用标点（?!/??/!! 等）组合自身独占一格，行首场景避头并格
 * - D5 直引号按全文配对预扫描确定性分类开/闭，非平衡文本行末兜底按收引号并格，歧义登记 warning
 */
import {
  GRID_COLUMNS_PER_ROW,
  MAX_DIRECTIVE_SPACES,
  FULL_DOT_PUNCT,
  HALF_DOT_PUNCT,
  ALNUM,
  HALF_PAIR_CHAR,
  STRAIGHT_QUOTES,
  classifyQuotes,
  forbiddenRole
} from './punctuation-rules.js?v=20261014e';

export { GRID_COLUMNS_PER_ROW, MAX_DIRECTIVE_SPACES };

/** 叠用标点判定（全角与半角，同宽成对）：?! !? ?? !! */
function isComboPair(a, b) {
  if (a === undefined || b === undefined) return false;
  if (a === b) return a === '?' || a === '!' || a === '？' || a === '！';
  return (a === '?' && b === '!') || (a === '!' && b === '?') ||
         (a === '？' && b === '！') || (a === '！' && b === '？');
}

/** 三连叠用判定：??? !!! */
function isComboTriple(a, b, c) {
  if (a === undefined || b === undefined || c === undefined) return false;
  return a === b && b === c && (a === '?' || a === '!' || a === '？' || a === '！');
}

/** 找到前一个有效内容格（#8：指令空格不是字——回溯须跳过 isSpaceDirective，
 *  使点号并格目标回到真实内容字格；否则「你好+23+。」的点号会并进空格指令格） */
export function findPrevContentCell(result, startIndex) {
  for (let idx = startIndex; idx >= 0; idx--) {
    const cell = result[idx];
    if (cell && !cell.isLayoutSpace && !cell.isWideSecond
        && !cell.isSpaceDirective && cell.text !== '') {
      return idx;
    }
  }
  return -1;
}

/** 行末同格合并：把 text 并入前一内容格，并打 F1 允许例外标记 */
function mergeIntoPrevCell(result, gridIndex, text) {
  const prev = findPrevContentCell(result, gridIndex - 1);
  if (prev >= 0) {
    result[prev].text += text;
    result[prev].isMergedEOL = true;
    return true;
  }
  return false;
}

/** 放置宽符号（处理跨行禁则，保持原 v9 行为） */
export function placeWideSymbol(result, symbol, width, gridIndex, sourceIndex, maxItems) {
  const posInRow = gridIndex % GRID_COLUMNS_PER_ROW;
  const remaining = GRID_COLUMNS_PER_ROW - posInRow;
  // 如果当前不在行首且剩余空间不足，先填满当前行（排版空位）
  if (posInRow !== 0 && remaining < width) {
    while (gridIndex % GRID_COLUMNS_PER_ROW !== 0 && gridIndex < maxItems) {
      result[gridIndex] = { text: '', sourceIndex: sourceIndex, isLayoutSpace: true };
      gridIndex++;
    }
  }
  if (gridIndex >= maxItems) return gridIndex;
  // 放置符号第一格
  result[gridIndex] = { text: symbol, sourceIndex: sourceIndex, isWide: true };
  gridIndex++;
  // 放置后续占位格
  for (let w = 1; w < width && gridIndex < maxItems; w++) {
    result[gridIndex] = { text: '', sourceIndex: sourceIndex, isWideSecond: true };
    gridIndex++;
  }
  return gridIndex;
}

/**
 * 计算格子内容。
 * @param {string} text 输入文本（含 +N+ 指令）
 * @param {number} maxItems 最大格数
 * @returns {{ result: Array<object>, gridIndex: number, warnings: string[] }}
 *   result[i] 字段：text, sourceIndex, isSpaceDirective?, isWide?, isWideSecond?,
 *   isLayoutSpace?, isMergedEOL?（F1：行末无格与末字同格，考试允许）
 *   warnings：D5 直引号歧义等提示（不静默）
 */
export function computeGridContent(text, maxItems) {
  const result = [];
  let gridIndex = 0;
  let i = 0;

  // D5：全文直引号配对预扫描
  const quoteInfo = classifyQuotes(text);
  const warnings = [...quoteInfo.warnings];

  while (i < text.length && gridIndex < maxItems) {
    const ch = text[i];

    // 1. 换行符
    if (ch === '\n') {
      if (gridIndex % GRID_COLUMNS_PER_ROW !== 0) {
        gridIndex = Math.floor(gridIndex / GRID_COLUMNS_PER_ROW) * GRID_COLUMNS_PER_ROW + GRID_COLUMNS_PER_ROW;
      }
      i++;
      continue;
    }

    // 2. +N+ 指令
    if (ch === '+') {
      if (i + 1 < text.length && /\d/.test(text[i + 1])) {
        let j = i + 1;
        let validDirective = true;
        while (j < text.length && text[j] !== '+') {
          if (!/\d/.test(text[j])) { validDirective = false; break; }
          j++;
        }
        if (validDirective && j < text.length && text[j] === '+') {
          // #15(2)：+N+ 超限不再静默按上限处理——经 warnings 通道可见提示（与 D5 同哲学）
          const want = parseInt(text.substring(i + 1, j), 10);
          const numSpaces = Math.min(want, MAX_DIRECTIVE_SPACES);
          if (want > MAX_DIRECTIVE_SPACES) {
            warnings.push(`+${want}+ 超过上限 ${MAX_DIRECTIVE_SPACES}，已按 ${MAX_DIRECTIVE_SPACES} 格处理`);
          }
          for (let k = 0; k < numSpaces && gridIndex < maxItems; k++) {
            result[gridIndex] = { text: ' ', sourceIndex: i, isSpaceDirective: true };
            gridIndex++;
          }
          i = j + 1;
          continue;
        } else {
          result[gridIndex] = { text: ch, sourceIndex: i, isSpaceDirective: false };
          gridIndex++; i++;
          continue;
        }
      } else {
        result[gridIndex] = { text: ch, sourceIndex: i, isSpaceDirective: false };
        gridIndex++; i++;
        continue;
      }
    }

    // 3. 字母数字合并（D2：半角点号随此口径两两并格；叠用组合不被拆散）
    if (ALNUM.test(ch) && i + 1 < text.length && HALF_PAIR_CHAR.test(text[i + 1]) && !isComboPair(text[i + 1], text[i + 2])) {
      result[gridIndex] = { text: text.substring(i, i + 2), sourceIndex: i, isSpaceDirective: false };
      gridIndex++; i += 2;
      continue;
    }

    // 4. 叠用标点（D3：组合自身独占一格；落点恰为行首时避头并格）
    // 4.2 ??? !!!（2 格宽符号）——须先于两连判定，否则 ??? 被拆成 ?? + ?
    if (isComboTriple(ch, text[i + 1], text[i + 2])) {
      gridIndex = placeWideSymbol(result, text.substring(i, i + 3), 2, gridIndex, i, maxItems);
      i += 3;
      continue;
    }
    // 4.1/4.3 ?! !? ?? !!（1 格）
    if (isComboPair(ch, text[i + 1])) {
      const combo = text.substring(i, i + 2);
      if (gridIndex > 0 && gridIndex % GRID_COLUMNS_PER_ROW === 0) {
        if (mergeIntoPrevCell(result, gridIndex, combo)) { i += 2; continue; }
      }
      result[gridIndex] = { text: combo, sourceIndex: i };
      gridIndex += 1; i += 2;
      continue;
    }

    // 5. 破折号 ——（2 格宽符号）
    if (ch === '—' && text[i + 1] === '—') {
      gridIndex = placeWideSymbol(result, '——', 2, gridIndex, i, maxItems);
      i += 2;
      continue;
    }
    // 单个破折号 —（1 格）
    if (ch === '—') {
      result[gridIndex] = { text: '—', sourceIndex: i };
      gridIndex++; i++;
      continue;
    }

    // 6. 省略号 ……（2 格宽符号）
    if (ch === '…' && text[i + 1] === '…') {
      gridIndex = placeWideSymbol(result, '……', 2, gridIndex, i, maxItems);
      i += 2;
      continue;
    }
    // 单个省略号字符 …（1 格）
    if (ch === '…') {
      result[gridIndex] = { text: '…', sourceIndex: i };
      gridIndex++; i++;
      continue;
    }

    // 7. 行末禁则（避尾）：前引号、前括号、前书名号（含直引号开引号）不能出现在行末
    const role = forbiddenRole(ch, quoteInfo.role.get(i));
    if (role === 'tail') {
      const posInRow = gridIndex % GRID_COLUMNS_PER_ROW;
      if (posInRow === GRID_COLUMNS_PER_ROW - 1) {
        // 在行末，留排版空位后推至下一行
        result[gridIndex] = { text: '', sourceIndex: i, isLayoutSpace: true };
        gridIndex++;
        result[gridIndex] = { text: ch, sourceIndex: i };
        gridIndex++; i++;
        continue;
      }
    }

    // 8. 点号（D1 重写）：默认独占一格，仅落点恰为行首（上一行 25 格已满）时并入末字格
    if (FULL_DOT_PUNCT.test(ch) || HALF_DOT_PUNCT.test(ch)) {
      if (gridIndex > 0 && gridIndex % GRID_COLUMNS_PER_ROW === 0) {
        if (mergeIntoPrevCell(result, gridIndex, ch)) { i++; continue; }
      }
      result[gridIndex] = { text: ch, sourceIndex: i };
      gridIndex++; i++;
      continue;
    }

    // 9. 行首禁则（避头）：后引号、后括号、后书名号、间隔号等不能出现在行首
    if (role === 'head' && gridIndex > 0 && gridIndex % GRID_COLUMNS_PER_ROW === 0) {
      if (mergeIntoPrevCell(result, gridIndex, ch)) { i++; continue; }
    }

    // 9b. D5 兜底：非平衡文本的孤立收引号落在行末时，并入末字格（按收引号处理）
    if (STRAIGHT_QUOTES.test(ch) && quoteInfo.unmatched.has(i) && quoteInfo.role.get(i) === 'close') {
      const posInRow = gridIndex % GRID_COLUMNS_PER_ROW;
      if (posInRow === GRID_COLUMNS_PER_ROW - 1) {
        if (mergeIntoPrevCell(result, gridIndex, ch)) { i++; continue; }
      }
    }

    // 10. 普通字符：独占一格
    result[gridIndex] = { text: ch, sourceIndex: i };
    gridIndex++; i++;
  }

  return { result, gridIndex, warnings };
}

/** 精确有效长度（格数） */
export function calculateEffectiveLength(text) {
  const { gridIndex } = computeGridContent(text, Number.MAX_SAFE_INTEGER);
  return gridIndex;
}
