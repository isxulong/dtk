/**
 * engine.test.mjs —— 终局裁决（E）验收用例机测套件（node:test）
 * 运行：node --test test/
 * 预期值来源：裁判 C/D 双裁脚本实算（J 系列），本引擎实跑复核一致。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGridContent, calculateEffectiveLength } from '../js/engine.js';
import { DEFAULT_TEXT } from '../js/default-text.js';

const MAX = Number.MAX_SAFE_INTEGER;
const H24 = '天地玄黄宇宙洪荒日月盈昃辰宿列张律吕调阳云腾致雨'; // 24 字
const H25 = H24 + '露'; // 25 字
const cellAt = (r, n) => (r.result[n - 1] ? r.result[n - 1].text : undefined);
const rc = (r, row, col) => cellAt(r, (row - 1) * 25 + col);
const run = (t) => computeGridContent(t, MAX);

test('J01 你好，世界。：，独占格3、。独占格6、计数6', () => {
  const r = run('你好，世界。');
  assert.equal(cellAt(r, 3), '，');
  assert.equal(cellAt(r, 6), '。');
  assert.equal(r.gridIndex, 6);
});

test('J02 25字+。：「露。」并入格25（允许例外标记）、计数25', () => {
  const r = run(H25 + '。');
  assert.equal(cellAt(r, 25), '露。');
  assert.equal(r.result[24].isMergedEOL, true);
  assert.equal(r.gridIndex, 25);
});

test('J03 24字+。：。独占格25、计数25', () => {
  const r = run(H24 + '。');
  assert.equal(cellAt(r, 25), '。');
  assert.equal(r.gridIndex, 25);
});

test('J04 24字+“：格25排版空位、“落r2c1、计数26', () => {
  const r = run(H24 + '“');
  assert.equal(cellAt(r, 25), '');
  assert.equal(r.result[24].isLayoutSpace, true);
  assert.equal(rc(r, 2, 1), '“');
  assert.equal(r.gridIndex, 26);
});

test('J05 25字+”：「露”」并入格25、计数25', () => {
  const r = run(H25 + '”');
  assert.equal(cellAt(r, 25), '露”');
  assert.equal(r.result[24].isMergedEOL, true);
  assert.equal(r.gridIndex, 25);
});

test('J06 什么？！：？！独占格3、计数3', () => {
  const r = run('什么？！');
  assert.equal(cellAt(r, 3), '？！');
  assert.equal(r.gridIndex, 3);
});

test('J06b 25字+？！：行首避头并入格25、计数25', () => {
  const r = run(H25 + '？！');
  assert.equal(cellAt(r, 25), '露？！');
  assert.equal(r.result[24].isMergedEOL, true);
  assert.equal(r.gridIndex, 25);
});

test('J07 一、坚定理想信念：各占一格、计数8', () => {
  const r = run('一、坚定理想信念');
  assert.equal(cellAt(r, 1), '一');
  assert.equal(cellAt(r, 2), '、');
  assert.equal(r.gridIndex, 8);
});

test('J08a 23字+——：占格24–25不断开、计数25', () => {
  const r = run(H24.slice(0, 23) + '——');
  assert.equal(cellAt(r, 24), '——');
  assert.equal(r.result[24].isWideSecond, true);
  assert.equal(r.gridIndex, 25);
});

test('J08b 24字+——：格25排版空位、——占26–27、计数27', () => {
  const r = run(H24 + '——');
  assert.equal(r.result[24].isLayoutSpace, true);
  assert.equal(cellAt(r, 26), '——');
  assert.equal(r.gridIndex, 27);
});

test('J10 预设文本：一/二/三、均新行行首+2格缩进、计数382、无禁则字符落行首', () => {
  const r = run(DEFAULT_TEXT);
  assert.equal(r.gridIndex, 382);
  assert.equal(rc(r, 8, 3), '一');
  assert.equal(rc(r, 8, 4), '、');
  assert.equal(rc(r, 10, 3), '二');
  assert.equal(rc(r, 12, 3), '三');
  for (let idx = 0; idx < r.gridIndex; idx += 25) {
    const t = r.result[idx] ? r.result[idx].text : '';
    assert.ok(!/^["'”’》〉。，、；：？！]/.test(t), `行首格 ${idx + 1} 出现禁则字符 ${t}`);
  }
});

test('J11a A+3+B：不换行、计数5', () => {
  const r = run('A+3+B');
  assert.equal(r.gridIndex, 5);
  assert.equal(cellAt(r, 5), 'B');
});

test('J11b A\\n+3+B：B落r2c4、计数29', () => {
  const r = run('A\n+3+B');
  assert.equal(rc(r, 2, 4), 'B');
  assert.equal(r.gridIndex, 29);
});

test('J12a 24字+"+引用内容：格25排版空位、"落r2c1、计数30（保护现状正确行为）', () => {
  const r = run(H24 + '"引用内容');
  assert.equal(r.result[24].isLayoutSpace, true);
  assert.equal(rc(r, 2, 1), '"');
  assert.equal(r.gridIndex, 30);
  assert.equal(r.warnings.length, 1); // 非平衡，提示不静默
});

test('J12b 24字+孤立"：按收引号并入格24、计数24', () => {
  const r = run(H24 + '"');
  assert.equal(cellAt(r, 24), '雨"');
  assert.equal(r.result[23].isMergedEOL, true);
  assert.equal(r.gridIndex, 24);
  assert.equal(r.warnings.length, 1);
});

test('J13 <img src=x onerror=alert(1)>：纯文本逐字占格', () => {
  const s = '<img src=x onerror=alert(1)>';
  const r = run(s);
  const joined = r.result.slice(0, r.gridIndex).map((c) => c.text).join('');
  assert.equal(joined, s); // 无任何字符被解释/丢弃（渲染侧 innerText 保证无弹窗）
});

test('J-Perf 2000字引擎计算 ≤0.5s', () => {
  const text = '申论范文，标点占格。'.repeat(200); // 2000 字符
  const t0 = performance.now();
  const r = run(text);
  const ms = performance.now() - t0;
  assert.ok(ms <= 500, `引擎计算耗时 ${ms.toFixed(2)}ms 超限`);
});

test('T06 他说：“好。”：标点各占一格、计数7', () => {
  const r = run('他说：“好。”');
  assert.equal(r.gridIndex, 7);
  assert.equal(cellAt(r, 3), '：');
  assert.equal(cellAt(r, 4), '“');
  assert.equal(cellAt(r, 6), '。');
  assert.equal(cellAt(r, 7), '”');
});

test('T08 23字+——……：——格24–25、……格26–27、计数27', () => {
  const r = run(H24.slice(0, 23) + '——……');
  assert.equal(cellAt(r, 24), '——');
  assert.equal(cellAt(r, 26), '……');
  assert.equal(r.gridIndex, 27);
});

test('T10 ！！！：宽符号2格、计数2', () => {
  const r = run('！！！');
  assert.equal(r.gridIndex, 2);
});

test('T11 5·12：·独占一格、计数3', () => {
  const r = run('5·12');
  assert.equal(r.gridIndex, 3);
  assert.equal(cellAt(r, 2), '·');
});

test('D4新增 25字+》：「露》」并入格25；24字+》：》独占格25', () => {
  const a = run(H25 + '》');
  assert.equal(cellAt(a, 25), '露》');
  assert.equal(a.gridIndex, 25);
  const b = run(H24 + '》');
  assert.equal(cellAt(b, 25), '》');
  assert.equal(b.gridIndex, 25);
});

test('D2 半角分流：1.5, → 「1.」「5,」计数2；abc123 → ab|c1|23 计数3（两位一格默认）', () => {
  const a = run('1.5,');
  assert.equal(cellAt(a, 1), '1.');
  assert.equal(cellAt(a, 2), '5,');
  assert.equal(a.gridIndex, 2);
  const b = run('abc123');
  assert.equal(cellAt(b, 1), 'ab');
  assert.equal(cellAt(b, 2), 'c1');
  assert.equal(cellAt(b, 3), '23');
  assert.equal(b.gridIndex, 3);
});

test('D5 平衡文本直引号成对方向确定性：他说"好。" 计数6', () => {
  const r = run('他说"好。"');
  assert.equal(cellAt(r, 3), '"');
  assert.equal(cellAt(r, 6), '"');
  assert.equal(r.gridIndex, 6);
  assert.equal(r.warnings.length, 0); // 平衡文本无提示
});

test('UC-06 +3+测试 计数5；+abc+文字 字面渲染6格', () => {
  const a = run('+3+测试');
  assert.equal(a.gridIndex, 5);
  const b = run('+abc+文字');
  assert.equal(b.gridIndex, 6);
});

test('calculateEffectiveLength 与 computeGridContent 一致', () => {
  assert.equal(calculateEffectiveLength('你好，世界。'), 6);
});
