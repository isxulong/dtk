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

// ---------- 缺陷#2 全角括号禁则（20261014a 批1） ----------
test('#2 全角圆括号：24字+（ 格25排版空位、（落r2c1、计数26；25字+） 「露）」并入格25、计数25', () => {
  const a = run(H24 + '（');
  assert.equal(a.result[24].isLayoutSpace, true);
  assert.equal(rc(a, 2, 1), '（');
  assert.equal(a.gridIndex, 26);
  const b = run(H25 + '）');
  assert.equal(cellAt(b, 25), '露）');
  assert.equal(b.result[24].isMergedEOL, true);
  assert.equal(b.gridIndex, 25);
});

test('#2 全角花括号镜像：24字+｛ / 25字+｝', () => {
  const a = run(H24 + '｛');
  assert.equal(a.result[24].isLayoutSpace, true);
  assert.equal(rc(a, 2, 1), '｛');
  assert.equal(a.gridIndex, 26);
  const b = run(H25 + '｝');
  assert.equal(cellAt(b, 25), '露｝');
  assert.equal(b.result[24].isMergedEOL, true);
  assert.equal(b.gridIndex, 25);
});

test('#2 全角白括号镜像：24字+｟ / 25字+｠', () => {
  const a = run(H24 + '｟');
  assert.equal(a.result[24].isLayoutSpace, true);
  assert.equal(rc(a, 2, 1), '｟');
  assert.equal(a.gridIndex, 26);
  const b = run(H25 + '｠');
  assert.equal(cellAt(b, 25), '露｠');
  assert.equal(b.result[24].isMergedEOL, true);
  assert.equal(b.gridIndex, 25);
});

test('#2 半角括号禁则不回归：25字+) 「露)」并入格25；24字+( 避尾下移', () => {
  const a = run(H25 + ')');
  assert.equal(cellAt(a, 25), '露)');
  assert.equal(a.result[24].isMergedEOL, true);
  assert.equal(a.gridIndex, 25);
  const b = run(H24 + '(');
  assert.equal(b.result[24].isLayoutSpace, true);
  assert.equal(rc(b, 2, 1), '(');
  assert.equal(b.gridIndex, 26);
});

// ---------- 缺陷#20(5) 英文撇号降噪（20261014a 批1） ----------
test("#20(5) don't stop：撇号不进入配对扫描、warnings=0", () => {
  const r = run("don't stop");
  assert.equal(r.warnings.length, 0);
});

test("#20(5) 英文成对直引号不受撇号降噪影响：He said 'ok' 无警告", () => {
  const r = run("He said 'ok'");
  assert.equal(r.warnings.length, 0);
  // J12b 口径（孤立 " 警告）不回归由下方既有用例覆盖
});


// ---------- 批2（20261014b）：#13/#14 CSP 双层同串 + #20(3) 版本号一致性（文件级静态检查） ----------
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('#13/#14 _headers 与 meta CSP 为同一份字符串，且含两个 beacon 域', () => {
  const headers = readFileSync(join(REPO, '_headers'), 'utf8');
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  const mH = headers.match(/Content-Security-Policy: (.+)/);
  const mM = html.match(/http-equiv="Content-Security-Policy" content="(.+?)">/);
  assert.ok(mH, '_headers 缺 CSP 行');
  assert.ok(mM, 'index.html 缺 meta CSP');
  assert.equal(mH[1].trim(), mM[1].trim(), '_headers 与 meta CSP 字符串必须完全一致（双层取交集）');
  const csp = mM[1];
  assert.ok(csp.includes('https://static.cloudflareinsights.com'), 'script-src 缺 beacon 域');
  assert.ok(csp.includes('https://cloudflareinsights.com'), 'connect-src 缺 beacon 域');
});

test('#13 _headers 含 HSTS / nosniff / Referrer-Policy 三项基础响应头', () => {
  const headers = readFileSync(join(REPO, '_headers'), 'utf8');
  assert.ok(/Strict-Transport-Security: max-age=31536000; includeSubDomains/.test(headers));
  assert.ok(/X-Content-Type-Options: nosniff/.test(headers));
  assert.ok(/Referrer-Policy: strict-origin-when-cross-origin/.test(headers));
});

test('#20(3) 版本号全仓同步：index.html ?v=（9 处）与 js/ 内引用（3 处）、package.json、各 js 版本注释一致', () => {
  // 白屏优化⑧（20261015a）：与 test/version-sync.test.mjs ①② 同口径——index.html
  // 因 modulepreload×5 从 4 处升为 9 处（5 preload + 4 import），全仓 12 处。
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  const engine = readFileSync(join(REPO, 'js/engine.js'), 'utf8');
  const punct = readFileSync(join(REPO, 'js/punctuation-rules.js'), 'utf8');
  const def = readFileSync(join(REPO, 'js/default-text.js'), 'utf8');
  const htmlVs = [...html.matchAll(/\.js\?v=([0-9a-z]+)/g)].map(m => m[1]);
  assert.ok(htmlVs.length === 9, `index.html 应有 9 处 .js?v= 引用（5 modulepreload + 4 import），实得 ${htmlVs.length}`);
  assert.equal(new Set(htmlVs).size, 1, 'index.html 九处 ?v= 版本不一致');
  const v = htmlVs[0];
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.version, v, `package.json version（${pkg.version}）应与 ?v=（${v}）一致`);
  const engineQ = [...engine.matchAll(/\?v=([0-9a-z]+)/g)].map(m => m[1]);
  assert.ok(engineQ.length === 1, 'engine.js 应有 1 处内部 ?v=');
  assert.equal(engineQ[0], v, 'engine.js 内部引用版本与 index.html 不一致');
  const autoFmt = readFileSync(join(REPO, 'js/auto-format.js'), 'utf8');
  const autoFmtQ = [...autoFmt.matchAll(/\?v=([0-9a-z]+)/g)].map(m => m[1]);
  assert.ok(autoFmtQ.length === 2, 'auto-format.js 应有 2 处内部 ?v=');
  assert.deepEqual([...new Set(autoFmtQ)], [v], 'auto-format.js 内部引用版本与 index.html 不一致');
  assert.ok(punct.includes(`版本：${v}`), 'punctuation-rules.js 版本注释不同步');
  assert.ok(def.includes(`版本：${v}`), 'default-text.js 版本注释不同步');
  assert.ok(engine.includes(`版本：${v}`), 'engine.js 版本注释不同步');
  const norm = readFileSync(join(REPO, 'js/text-normalize.js'), 'utf8');
  assert.ok(norm.includes(`版本：${v}`), 'text-normalize.js 版本注释不同步');
  assert.ok(autoFmt.includes(`版本：${v}`), 'auto-format.js 版本注释不同步');
});

// ---------- 批4（20261014d）：#8/#10 格位规则 + #11/#12/#15/emoji 输入边界 ----------
import { normalizeInputText } from '../js/text-normalize.js';

test('#8 你好+23+。：点号并入真实内容格「好」（格2=好。），指令空格保持、计数25', () => {
  const r = run('你好+23+。');
  assert.equal(cellAt(r, 1), '你');
  assert.equal(cellAt(r, 2), '好。');
  assert.equal(r.result[1].isMergedEOL, true);
  for (let i = 3; i <= 25; i++) {
    assert.equal(r.result[i - 1].isSpaceDirective, true, `格 ${i} 应为指令空格`);
  }
  assert.equal(r.gridIndex, 25);
});

test('#8 回溯不到内容格的 fallback：+25+。→ 点号不并入空格指令格、独占格26、计数26', () => {
  const r = run('+25+。');
  for (let i = 1; i <= 25; i++) {
    assert.equal(r.result[i - 1].isSpaceDirective, true, `格 ${i} 应为指令空格`);
  }
  assert.equal(cellAt(r, 26), '。');
  assert.equal(r.gridIndex, 26);
});

test('#10 25字+。！？」：合并链 5 字符全并入格25、gridIndex 不变（引擎语义锁定）', () => {
  const r = run(H25 + '。！？」');
  assert.equal(cellAt(r, 25), '露。！？」');
  assert.equal(r.result[24].isMergedEOL, true);
  assert.equal(r.gridIndex, 25);
});

test('#15(2) +501+露：超限登记 warning、指令格 500、计数 501', () => {
  const r = run('+501+露');
  assert.ok(r.warnings.length >= 1, '超限应产生 warning');
  assert.ok(r.warnings.some(w => w.includes('超过上限')), 'warning 文案应含「超过上限」');
  let directiveCells = 0;
  for (const c of r.result) { if (c && c.isSpaceDirective) directiveCells++; }
  assert.equal(directiveCells, 500);
  assert.equal(cellAt(r, 501), '露');
  assert.equal(r.gridIndex, 501);
});

test('#11 normalize：文件头 BOM 剥离', () => {
  assert.equal(normalizeInputText('\uFEFF申论'), '申论');
});

test('#11 normalize：正文内 BOM / 零宽空格 / 词连接符剥离', () => {
  assert.equal(normalizeInputText('申\uFEFF论\u200B测\u2060试'), '申论测试');
});

test('#11 normalize：CRLF 与孤立 CR 统一为 LF', () => {
  assert.equal(normalizeInputText('第一段\r\n第二段\r末段'), '第一段\n第二段\n末段');
});

// F3 修订（2026-10-17，主 AD 终裁）：原用例断言「段首\t正文 → 段首+2+正文」，
// 即全局 Tab→+2+；该口径会把段中 Tab 注入成指令文本。修订为仅行首 Tab 转 +2+、
// 行内 Tab 转单个半角空格，本组用例按新口径重写。
test('#11 normalize：行首 Tab 转 +2+ 指令（与 Tab 键空 2 格语义对齐，F3 防回归）', () => {
  assert.equal(normalizeInputText('\t段首正文'), '+2+段首正文');
  assert.equal(normalizeInputText('第一行\n\t第二行正文'), '第一行\n+2+第二行正文');
  assert.equal(normalizeInputText('\t\t段首正文'), '+2++2+段首正文', '连续行首 Tab 各转一个 +2+');
});

test('#11 normalize：行内 Tab 转单个半角空格（F3：不再注入指令文本）', () => {
  assert.equal(normalizeInputText('段中\t正文'), '段中 正文');
  assert.equal(normalizeInputText('奋斗\t青春'), '奋斗 青春');
  assert.ok(!normalizeInputText('段中\t正文').includes('+2+'), '段中 Tab 不得注入指令');
});

test('#11 normalize：C0 控制符与 DEL 剥离（\\n 保留）', () => {
  assert.equal(normalizeInputText('申\x00\x01论\x0B\x7F测\n'), '申论测\n');
});

test('#11 normalize：空串与纯文本原样通过', () => {
  assert.equal(normalizeInputText(''), '');
  assert.equal(normalizeInputText('申论+2+测试'), '申论+2+测试');
});

test('#3(终版) emoji 过滤：增补平面 emoji / ZWJ 家族序列 / BMP emoji / 变体选择符全剥离', () => {
  assert.equal(normalizeInputText('申👍论'), '申论');
  assert.equal(normalizeInputText('👨‍👩‍👧好'), '好'); // ZWJ 序列
  assert.equal(normalizeInputText('❤️意'), '意');     // BMP emoji + 变体选择符
  assert.equal(normalizeInputText('✅对'), '对');
  assert.equal(normalizeInputText('1️⃣号'), '1号');  // 键帽序列：数字保留、FE0F/20E3 剥离
});

test('#3(终版) emoji 过滤：CJK / 圈号数字 / 标点 / 指令语法全保留', () => {
  assert.equal(normalizeInputText('「申论」①②③㊗：《规范》+2+OK'), '「申论」①②③㊗：《规范》+2+OK');
});

test('#3(终版) emoji 过滤一致性：剥离后格位/计数与纯文本完全一致', () => {
  const clean = normalizeInputText('申👍论👨‍👩‍👧好❤️啊');
  assert.equal(clean, '申论好啊');
  const rA = computeGridContent(clean, MAX);
  const rB = computeGridContent('申论好啊', MAX);
  assert.equal(rA.gridIndex, rB.gridIndex, '计数一致');
  for (let i = 0; i < rB.gridIndex; i++) {
    assert.equal(rA.result[i].text, rB.result[i].text, `格 ${i + 1} 内容一致`);
    assert.equal(rA.result[i].sourceIndex, rB.result[i].sourceIndex, `格 ${i + 1} sourceIndex 一致`);
  }
});

test('#15(3)/#15(1) 导入预检与截断提示：index.html 含 400KB 字节门槛与「截断不报成功」分支（文件级静态检查）', () => {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  assert.ok(/MAX_IMPORT_BYTES = 400 \* 1024/.test(html), '缺 400KB 字节预检');
  assert.ok(/已取消导入/.test(html), '缺取消导入提示');
  assert.ok(/if \(!truncated\)/.test(html), '缺「截断时跳过成功提示」分支');
  assert.ok(/normalizeInputText\(e\.target\.result\)/.test(html), '导入内容未经 normalizeInputText 清洗');
});

// ---------- 批5（20261014e）：#7/#19/#5 文件级静态检查 ----------
test('#7 触屏防护（touch-action / user-select CSS + 长按兜底计时）', () => {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  assert.ok(/\.grid-item \{[^}]*touch-action: manipulation/s.test(html), 'grid-item 缺 touch-action');
  assert.ok(/\.grid-item \{[^}]*user-select: none/s.test(html), 'grid-item 缺 user-select');
  assert.ok(/pointerdown/.test(html) && /, 550\)/.test(html), '缺长按 550ms 兜底计时');
});

test('#19 无障碍标注（aria 改述 / role=gridcell / 撤销快捷键）', () => {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8');
  assert.ok(/aria-label="申论格子纸/.test(html), 'grid-container aria-label 未改述');
  assert.ok(/setAttribute\('role', 'gridcell'\)/.test(html), '缺 role=gridcell');
  assert.ok(/removeAttribute\('role'\)/.test(html), '缺空内容格 role 清理');
  assert.ok(/aria-keyshortcuts="Control\+Z"/.test(html), '撤销按钮缺 aria-keyshortcuts');
});

test('#5 E2E 可移植（探测链 + 环境变量 + package.json + CI）', () => {
  const bt = readFileSync(join(REPO, 'test/browser.test.mjs'), 'utf8');
  assert.ok(bt.includes('PUPPETEER_EXECUTABLE_PATH'), '缺环境变量探测');
  assert.ok(bt.includes('detectChromium'), '缺探测链');
  assert.ok(existsSync(join(REPO, 'package.json')), '缺 package.json');
  assert.ok(existsSync(join(REPO, '.github/workflows/test.yml')), '缺 CI workflow');
});
