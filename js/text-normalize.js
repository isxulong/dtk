/**
 * text-normalize.js —— 输入边界归一化（纯逻辑，无 DOM 依赖，可被 Node 直接 import 测试）
 * 版本：20261014e
 * 归口条目：#11 BOM/零宽/控制字符/CR、Tab→+2+；#12 富文本粘贴取纯文本后归一化；
 *          #15 导入内容同链清洗；#3（终版改口径）emoji 与非书写符号的输入边界过滤。
 *
 * 接入边界（不进 distributeText 主路径，避免逐键改写扰动光标）：
 *   ① paste 拦截器  ② importText 的 reader.onload  ③ window.onload 恢复存档
 * 引擎主循环与坐标系零改动：进引擎的文本永远是归一化后的干净文本，
 * sourceIndex / 双击定位 / 计数因此与「剥离后的纯文本」完全一致。
 */

// #11：不可见控制符（\n 保留、\t 已在前一步转 +2+ 指令）：
// \x00-\x08、\x0B、\x0C、\x0E-\x1F（C0 其余成员）、\x7F（DEL）
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// emoji 过滤（#3 终版口径：剥离而非码点化）——静默处理，考试场景不给提示。
// 覆盖：
//   ① U+1F000 以上表情区（U+1F000–U+1FFFF：全量 emoji、肤色修饰符 1F3FB–1F3FF、
//      旗帜区 1F1E6–1F1FF、麻将/骨牌区等），代理对整体剥离；
//   ② BMP emoji 呈现区：杂项符号/装饰符号（2600–27BF，含 ❌✅❤✔✘）、
//      星形/箭头装饰（2B00–2BFF，含 ⭐⭕）、媒体与时钟（231A–231B、23E9–23FA）、
//      几何图形 emoji 呈现（25AA–25FE）、双感叹/双问号（203C、2049）；
//   ③ emoji 字素连接件：ZWJ（200D）、变体选择符（FE0E/FE0F）、键帽封闭符（20E3）。
// 保留：全部 CJK（汉字/假名/注音/CJK 符号区 3000–303F/兼容区 F900+ 含 ㊗㊙）、
//   圈号数字（①②…2460–24FF）、全部标点、数字字母、既有 +N+ 指令语法。
const EMOJI_ASTRAL = /[\u{1F000}-\u{1FFFF}]/gu;
const EMOJI_BMP = /[\u203C\u2049\u231A\u231B\u23E9-\u23FA\u25AA-\u25FE\u2600-\u27BF\u2B00-\u2BFF]/g;
const EMOJI_JOINER = /[\u200D\u20E3\uFE0E\uFE0F]/g;

/**
 * 归一化输入文本（所有输入边界统一入口）。
 * @param {string} raw 原始输入（粘贴板纯文本 / 导入文件内容 / localStorage 存档）
 * @returns {string} 干净文本：可见书写符号 + \n + 既有指令语法
 */
export function normalizeInputText(raw) {
  return raw
    .replace(/^\uFEFF/, '')                 // #11：文件头 BOM
    .replace(/[\uFEFF\u200B\u2060]/g, '')   // #11：正文内 BOM / 零宽空格 / 词连接符
    .replace(/\r\n?/g, '\n')                // #11：CRLF/CR 行尾归一（隐性格主源）
    .replace(/\t/g, '+2+')                  // #11：Tab → 空 2 格指令（与 Tab 键语义对齐）
    .replace(CONTROL_CHARS, '')             // #11：其余不可见控制符
    .replace(EMOJI_ASTRAL, '')              // #3：U+1F000+ 表情区（代理对整体剥离）
    .replace(EMOJI_BMP, '')                 // #3：BMP emoji 呈现区
    .replace(EMOJI_JOINER, '');             // #3：ZWJ / 变体选择符 / 键帽封闭符
}
