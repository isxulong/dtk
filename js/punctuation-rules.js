/**
 * punctuation-rules.js —— 标点占格规则表（纯数据 + 纯函数，无 DOM 依赖）
 * 依据：GB/T 15834—2011《标点符号用法》§5.1 + 申论格子纸通行实践
 * 版本：20261012a（与 index.html / engine.js 的引用 query 同步，防缓存错位）
 */

export const GRID_COLUMNS_PER_ROW = 25;
export const MAX_DIRECTIVE_SPACES = 500;

/** 全角点号：。 ， 、 ； ： ？ ！ */
export const FULL_DOT_PUNCT = /[。，、；：？！]/;

/** 半角点号（D2：不再挤格，随数字字母口径两两并格；单落时按点号规则独占/行首并格） */
export const HALF_DOT_PUNCT = /[.,;:!?]/;

/** 字母数字 */
export const ALNUM = /[a-zA-Z0-9]/;

/** 数字字母口径的并格字符集：两个连续此类字符共占一格（保留「1.」序数一格行为） */
export const HALF_PAIR_CHAR = /[a-zA-Z0-9.,;:!?]/;

/** 直引号（方向由 classifyQuotes 动态判定，不进静态禁则集） */
export const STRAIGHT_QUOTES = /["']/;

/**
 * 行首禁则（避头）静态集：后引号、后括号、后书名号、间隔号、分隔号、连接号
 * D4+D8 修复：补 》 U+300B、〉 U+3009、” U+201D、’ U+2019
 */
export const HEAD_FORBIDDEN_STATIC = /[』」”’》〉)〕］\]}】·\/\-―～]/;

/**
 * 行末禁则（避尾）静态集：前引号、前括号、前书名号
 * D4+D8 修复：补 “ U+201C、‘ U+2018
 */
export const TAIL_FORBIDDEN_STATIC = /[『「“‘(〔［\[{【《〈]/;

/**
 * D5：预扫描全文直引号，按出现奇偶做开/闭方向推断。
 * - 平衡文本（偶数个）：奇数次出现 = 开引号，偶数次 = 收引号（确定性分类，主路径）。
 * - 非平衡文本（奇数个）：最后一个未配对引号按上下文兜底——其后仅剩空白/换行
 *   视为收引号，否则视为开引号；同时登记 warning（不静默）。
 * @param {string} text
 * @returns {{ role: Map<number, 'open'|'close'>, unmatched: Set<number>, warnings: string[] }}
 */
export function classifyQuotes(text) {
  const role = new Map();
  const unmatched = new Set();
  const warnings = [];
  for (const q of ['"', "'"]) {
    const idxs = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === q) idxs.push(i);
    }
    idxs.forEach((idx, k) => role.set(idx, k % 2 === 0 ? 'open' : 'close'));
    if (idxs.length % 2 === 1) {
      const last = idxs[idxs.length - 1];
      unmatched.add(last);
      const rest = text.slice(last + 1);
      const inferred = /^\s*$/.test(rest) ? 'close' : 'open';
      role.set(last, inferred);
      warnings.push(
        `检测到未配对的直引号 ${q}（第 ${last + 1} 个字符），已按${inferred === 'open' ? '开' : '收'}引号处理`
      );
    }
  }
  return { role, unmatched, warnings };
}

/**
 * 字符的行首/行末禁则角色。
 * 直引号按 classifyQuotes 的判定：开引号 = 避尾（不得在行末），收引号 = 避头（不得在行首）。
 * @param {string} ch 单个字符
 * @param {'open'|'close'|undefined} quoteRole 直引号方向判定结果
 * @returns {'head'|'tail'|null}
 */
export function forbiddenRole(ch, quoteRole) {
  if (STRAIGHT_QUOTES.test(ch)) {
    return quoteRole === 'open' ? 'tail' : 'head';
  }
  if (TAIL_FORBIDDEN_STATIC.test(ch)) return 'tail';
  if (HEAD_FORBIDDEN_STATIC.test(ch)) return 'head';
  return null;
}
