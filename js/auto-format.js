/**
 * auto-format.js —— 一键排版（纯逻辑，无 DOM 依赖，可被 Node 直接 import 测试）
 * 版本：20261015a
 *
 * 定位：text-normalize.js（字符级卫生，输入边界静默执行）之上的「结构级改写」层，
 * 由用户显式点击「一键排版」触发，改动经 stats 反馈给用户。两层的关注点与触发
 * 时机不同，刻意不合并。
 *
 * 五阶段确定性流水线（无随机、无 LLM，O(n)）：
 *   S1 行级空白清理：行尾删；行首 2+ 空白视为缩进意图转指令；行内按语言邻接
 *      规则删/留（两侧均 ASCII 可打印字符→保留单个半角空格，否则删除）。
 *      豁免：段首已有 +N+ 的行（已排版，R11）与判为标题的首行（R10）。
 *   S2 段落结构整理：连续空行折叠为单换行；去文首/文末空白行。
 *   S3 +N+ 注入：段首无指令的正文段统一补 +2+；已有指令不动（幂等关键）。
 *   S4 首段标题判定：9 特征加权评分（宁漏判不误判），判中按
 *      pad = clamp(⌊(25−有效格数)/2⌋, 2, 10) 注入居中指令；判不中回落 +2+。
 *   S5 输出 { text, stats }。
 *
 * 明确不处理（保守原则）：半角→全角标点转换、PDF 句中硬换行合并（本版只检测
 * 提示）、段尾补标点、已有 +N+ 数值调整、弯直引号互转。
 *
 * 不变量（测试锁定）：
 *   ① 零内容丢失——处理前后剥离空白与 +N+ 指令后，可见字符序列逐字节一致；
 *   ② 幂等——autoFormatText(autoFormatText(x)).text === autoFormatText(x).text。
 */

import { normalizeInputText } from './text-normalize.js?v=20261015a';
import { GRID_COLUMNS_PER_ROW, calculateEffectiveLength } from './engine.js?v=20261015a';

/** 行内空白字符类：半角空格 / 全角空格 / 不间断空格 */
const INLINE_WS = '[ \\u3000\\u00A0]';
const LEADING_WS_RE = new RegExp('^' + INLINE_WS + '+');
const TRAILING_WS_RE = new RegExp(INLINE_WS + '+$');
const INLINE_WS_RUN_RE = new RegExp(INLINE_WS + '+', 'g');

/** 段首 +N+ 指令 */
const LEADING_DIRECTIVE_RE = /^\+\d+\+/;

/** 句末终止符（疑似句中硬换行检测用）：行尾没有它且后随段落 → 疑似 PDF 拆行 */
const TERMINAL_PUNCT_RE = /[。！？；：…—」』”’）》】]$/;

/** 句读点号（含顿号）——标题判定的强否定特征；书名号《》与间隔号·允许 */
const SENTENCE_PUNCT_RE = /[。，；：？！、]/;
/** 句末点号 */
const END_PUNCT_RE = /[。！？；]$/;
/** 枚举头：一、 ／ （一） ／ 1. ／ 1、 */
const ENUM_HEAD_RE = /^\s*([一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|\d+[.、])/;

/** 标题评分阈值（最大正分 13；宁漏判不误判的不对称设计） */
const TITLE_THRESHOLD = 10;
/** 标题有效格数上限（一行 25 格留余量） */
const TITLE_MAX_LEN = 20;

/** ASCII 可打印字符（! 到 ~）：空格两侧都是它 → 空格保留（GB/T 15834、iOS 16） */
function isAsciiPrintable(ch) {
  return ch !== undefined && ch >= '\x21' && ch <= '\x7E';
}

/**
 * 9 特征加权评分判定首段是否标题。
 * 特征：①无句读点号 ②长度 2~20 格 ③非枚举头 ④结尾无点号 ⑤存在第 2 段
 *      ⑥第 2 段 ≥30 字符 ⑦次行长度 ≥2 倍首行 ⑧后随空行 ⑨首段无 +N+（门控）。
 * 强否定特征给大负分，弱相关特征只加不减——判不中回落 +2+，代价恒为用户手动调一行。
 *
 * @param {string} firstLine S1 清理后的首段文本（不含行首行尾空白）
 * @param {string[]} followingLines 其后的非空行（S1 清理后）
 * @param {boolean} blankLineFollows 原始结构中首段后是否有空行分隔
 * @returns {{ verdict: 'detected'|'uncertain'|'none', score: number, maxScore: number,
 *            threshold: number, effectiveLength: number }}
 *   verdict: detected=判中；uncertain=参与判定但未达阈值；none=未参与（已有指令/空文本）
 */
export function scoreTitle(firstLine, followingLines, blankLineFollows) {
  if (!firstLine || LEADING_DIRECTIVE_RE.test(firstLine)) {
    return { verdict: 'none', score: 0, maxScore: 13, threshold: TITLE_THRESHOLD, effectiveLength: 0 };
  }
  const len = calculateEffectiveLength(firstLine);
  const second = followingLines.length > 0 ? followingLines[0] : '';
  const secondLen = second ? calculateEffectiveLength(second) : 0;

  let score = 0;
  score += SENTENCE_PUNCT_RE.test(firstLine) ? -8 : 4;                    // ①无句读点号
  score += (len < 2 || len > TITLE_MAX_LEN) ? -8 : 3;                     // ②长度 2~20 格
  score += ENUM_HEAD_RE.test(firstLine) ? -8 : 1;                         // ③非枚举头
  score += END_PUNCT_RE.test(firstLine) ? -2 : 1;                         // ④结尾无点号
  score += followingLines.length === 0 ? -8 : 1;                          // ⑤存在第 2 段
  score += secondLen >= 30 ? 1 : 0;                                       // ⑥第 2 段 ≥30 字符
  score += (len > 0 && secondLen >= len * 2) ? 1 : 0;                     // ⑦次行 ≥2 倍首行
  score += blankLineFollows ? 1 : 0;                                      // ⑧后随空行

  return {
    verdict: score >= TITLE_THRESHOLD ? 'detected' : 'uncertain',
    score,
    maxScore: 13,
    threshold: TITLE_THRESHOLD,
    effectiveLength: len
  };
}

/** 标题居中左缩进格数：⌊(25−有效格数)/2⌋，clamp 到 [2,10]（奇数余量自然留在右侧） */
export function titlePadFor(effectiveLength) {
  const pad = Math.floor((GRID_COLUMNS_PER_ROW - effectiveLength) / 2);
  return Math.max(2, Math.min(10, pad));
}

/**
 * 行内空白按语言邻接规则清理：
 *   两侧均 ASCII 可打印字符 → 折叠为单个半角空格；其余一律删除。
 * @returns {{ line: string, changed: number }} changed = 被删除/折叠的空白 run 数
 */
function cleanInlineSpaces(line) {
  let changed = 0;
  const out = line.replace(INLINE_WS_RUN_RE, (run, offset, whole) => {
    const before = whole[offset - 1];
    const after = whole[offset + run.length];
    if (isAsciiPrintable(before) && isAsciiPrintable(after)) {
      if (run.length > 1 || run !== ' ') { changed++; }
      return ' ';
    }
    changed++;
    return '';
  });
  return { line: out, changed };
}

/**
 * 一键排版主入口。
 * @param {string} raw 输入框当前文本
 * @returns {{ text: string, stats: {
 *   indent: number,        // 段首补 +2+ 的段落数
 *   spaces: number,        // 行内清理空白的 run 数
 *   blankLines: number,    // 折叠/移除的空白行数
 *   title: 'detected'|'uncertain'|'none',  // 标题判定结论
 *   titleScore: number, titleMaxScore: number, titleThreshold: number,  // 置信度
 *   titlePad: number|null, // 判中时注入的居中格数
 *   hardBreaks: number     // 疑似句中硬换行数（只提示，不合并）
 * } }}
 */
export function autoFormatText(raw) {
  const stats = {
    indent: 0, spaces: 0, blankLines: 0,
    title: 'none', titleScore: 0, titleMaxScore: 13, titleThreshold: TITLE_THRESHOLD,
    titlePad: null, hardBreaks: 0
  };
  if (!raw) { return { text: '', stats }; }

  // 防御性前置：字符级卫生复用输入边界归一化（幂等，standalone 可测）
  const normalized = normalizeInputText(raw);
  const rawLines = normalized.split('\n');

  // ---- S1 行级空白清理（行内空格清理延后到标题判定之后，先取行首行尾与结构） ----
  const lines = rawLines.map((line) => {
    let s = line.replace(TRAILING_WS_RE, '');
    const lead = s.match(LEADING_WS_RE);
    if (lead) { s = s.slice(lead[0].length); }
    return s;
  });

  // ---- S4 标题判定（先于行内清理：标题行豁免清理，且需要原始空行结构特征⑧） ----
  const firstIdx = lines.findIndex((l) => l !== '');
  let titleInfo = { verdict: 'none', score: 0, maxScore: 13, threshold: TITLE_THRESHOLD, effectiveLength: 0 };
  if (firstIdx >= 0) {
    const rest = lines.slice(firstIdx + 1).filter((l) => l !== '');
    const blankLineFollows = lines.slice(firstIdx + 1).length > rest.length;
    titleInfo = scoreTitle(lines[firstIdx], rest, blankLineFollows);
    stats.title = titleInfo.verdict;
    stats.titleScore = titleInfo.score;
    stats.titleMaxScore = titleInfo.maxScore;
    stats.titleThreshold = titleInfo.threshold;
  }

  // ---- S1b 行内空格清理（豁免：段首已有 +N+ 的行、判为标题的首行） ----
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') { continue; }
    if (LEADING_DIRECTIVE_RE.test(lines[i])) { continue; }              // R11：已排版
    if (i === firstIdx && titleInfo.verdict === 'detected') { continue; } // R10：标题豁免
    const { line, changed } = cleanInlineSpaces(lines[i]);
    lines[i] = line;
    stats.spaces += changed;
  }

  // ---- S2 段落结构整理：去文首/文末空白行，连续空行折叠 ----
  const kept = [];
  for (const l of lines) {
    if (l === '') { stats.blankLines++; } else { kept.push(l); }
  }

  // ---- S3/S4 +N+ 注入 ----
  const out = kept.map((line, idx) => {
    if (LEADING_DIRECTIVE_RE.test(line)) { return line; }                // R8：已有指令不动
    if (idx === 0 && titleInfo.verdict === 'detected') {
      const pad = titlePadFor(titleInfo.effectiveLength);
      stats.titlePad = pad;
      return `+${pad}+` + line;
    }
    stats.indent++;
    return '+2+' + line;
  });

  // ---- 疑似句中硬换行检测（口径#5：只检测提示，不做合并）----
  // 行尾无终止符且后随段落 → 疑似 PDF 复制拆行；首行若判为标题或全行无句读
  // （标题/列举形态）则豁免，宁可漏报不误报。
  for (let i = 0; i < kept.length - 1; i++) {
    const content = kept[i].replace(LEADING_DIRECTIVE_RE, '');
    if (!content) { continue; }
    if (i === 0 && (titleInfo.verdict === 'detected' || !SENTENCE_PUNCT_RE.test(content))) { continue; }
    if (!TERMINAL_PUNCT_RE.test(content)) { stats.hardBreaks++; }
  }

  return { text: out.join('\n'), stats };
}
