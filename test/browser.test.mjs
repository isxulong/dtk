// 浏览器端 E2E 验收测试（dtk 申论格子纸 · 终局裁决 E 清单）
// 运行：node test/browser.test.mjs（无需外部服务器，本文件内置静态服务）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGridContent } from '../js/engine.js';
// #5 E2E 可移植：优先裸包名（npm i 后可用），回退沙箱绝对路径；可执行文件走探测链
let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { puppeteer = (await import('/home/gem/.aily/.cli/npm/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default; }
import { execSync } from 'node:child_process';
function detectChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  for (const bin of ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable']) {
    try { return execSync('which ' + bin, { stdio: ['ignore', 'ignore', 'ignore'] }).toString().trim(); }
    catch { /* 继续探测下一项 */ }
  }
  throw new Error('未找到 Chromium：安装后重试，或设置 PUPPETEER_EXECUTABLE_PATH 指向可执行文件');
}

// ---- in-process static server（规避沙箱后台进程限制）----
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const results = [];
let phase = 'init';
function record(name, pass, detail) {
  phase = name;
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

const browser = await puppeteer.launch({
  executablePath: detectChromium(),
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => {
    consoleErrors.push('[' + phase + '] ' + (e && e.stack || e));
  });
  let alertFired = null;
  await page.exposeFunction('__recordAlert', (msg) => { alertFired = msg; });
  await page.evaluateOnNewDocument(() => { window.alert = (msg) => { window.__recordAlert(String(msg)); }; });

  // ---------- J10: 预设文本首载 ----------
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('#grid-container .grid-item').length > 0, { timeout: 10000 });
  const j10 = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#grid-container .grid-item'));
    const display = document.getElementById('count-display').textContent;
    const count = parseInt((display.match(/(\d+)/) || [0, 0])[1], 10);
    const positions = {};
    all.forEach((c, i) => {
      const t = c.textContent;
      const row = Math.floor(i / 25) + 1, col = i % 25 + 1;
      const pos = 'r' + row + 'c' + col;
      if (t === '\u4e00' && all[i + 1] && all[i + 1].textContent === '\u3001' && !positions.yi) positions.yi = pos;
      if (t === '\u4e8c' && all[i + 1] && all[i + 1].textContent === '\u3001' && !positions.er) positions.er = pos;
      if (t === '\u4e09' && all[i + 1] && all[i + 1].textContent === '\u3001' && !positions.san) positions.san = pos;
    });
    // 行首禁则扫描：任何文本格位于行首且首字符为禁则字符
    const headForbidden = '\u3002\uff0c\u3001\uff1b\uff1a\uff1f\uff01\uff09\uff3d\u3011\u300b\u3009\u201d\u2019\u300d\u300f\u3015\u00b7~\uff5e';
    const rowStartForbidden = [];
    all.forEach((c, i) => {
      if (i % 25 === 0 && c.textContent && headForbidden.includes(c.textContent[0])) {
        rowStartForbidden.push('r' + (Math.floor(i / 25) + 1) + ':' + c.textContent[0]);
      }
    });
    return { count, positions, rowStartForbidden, display: display.trim() };
  });
  record('J10 预设计数 = 382', j10.count === 382, 'display="' + j10.display + '"');
  record('J10 「一、」新行+2格缩进(列3)', j10.positions.yi === 'r8c3', '一 at ' + j10.positions.yi);
  record('J10 「二、」列3', j10.positions.er === 'r10c3', '二 at ' + j10.positions.er);
  record('J10 「三、」列3', j10.positions.san === 'r12c3', '三 at ' + j10.positions.san);
  record('J10 行首无禁则字符', j10.rowStartForbidden.length === 0, JSON.stringify(j10.rowStartForbidden));

  // helper：写入输入区并填格，返回计数与格子快照
  async function runCase(text) {
    await page.evaluate((t) => {
      document.getElementById('input-text').innerText = t;
      window.distributeText();
    }, text);
    return page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('#grid-container .grid-item'));
      const display = document.getElementById('count-display').textContent;
      const count = parseInt((display.match(/(\d+)/) || [0, 0])[1], 10);
      return {
        count,
        cells: all.map(c => ({ t: c.textContent, cls: c.className, title: c.getAttribute('title') || '' })),
        display: display.trim()
      };
    });
  }
  const L = (s) => s.repeat(1); // readability no-op

  // ---------- J02 ----------
  const r02 = await runCase('\u9732'.repeat(25) + '\u3002');
  record('J02 25字+。 「露。」并入格25 + merge-eol 标记（视觉区分已移除，title 为空）',
    r02.cells[24].t === '\u9732\u3002' && r02.cells[24].cls.includes('merge-eol') && r02.count === 25
      && r02.cells[24].title === '',
    'cell25="' + r02.cells[24].t + '" cls="' + r02.cells[24].cls + '" count=' + r02.count + ' title="' + r02.cells[24].title + '"');

  // ---------- J03 ----------
  const r03 = await runCase('\u9732'.repeat(24) + '\u3002');
  record('J03 24字+。 。独占格25',
    r03.cells[24].t === '\u3002' && !r03.cells[24].cls.includes('merge-eol') && r03.count === 25,
    'cell25="' + r03.cells[24].t + '" count=' + r03.count);

  // ---------- J04 ----------
  const r04 = await runCase('\u9732'.repeat(24) + '\u201c');
  record('J04 24字+“ 格25排版空位、“落r2c1、计数26',
    r04.cells[24].t === '' && r04.cells[25].t === '\u201c' && r04.count === 26,
    'cell25="' + r04.cells[24].t + '" cell26="' + r04.cells[25].t + '" count=' + r04.count);

  // ---------- J05 ----------
  const r05 = await runCase('\u9732'.repeat(25) + '\u201d');
  record('J05 25字+” 「露”」并入格25、计数25',
    r05.cells[24].t === '\u9732\u201d' && r05.cells[24].cls.includes('merge-eol') && r05.count === 25,
    'cell25="' + r05.cells[24].t + '" count=' + r05.count);

  // ---------- J06 ----------
  const r06 = await runCase('\u4ec0\u4e48\uff1f\uff01');
  record('J06 什么？！ 「？！」独占格3、计数3',
    r06.cells[2].t === '\uff1f\uff01' && r06.count === 3,
    'cell3="' + r06.cells[2].t + '" count=' + r06.count);

  // ---------- J07 ----------
  const r07 = await runCase('\u4e00\u3001\u575a\u5b9a\u7406\u60f3\u4fe1\u5ff5');
  record('J07 一、坚定理想信念 各占一格、计数8',
    r07.cells[0].t === '\u4e00' && r07.cells[1].t === '\u3001' && r07.count === 8,
    'cell1="' + r07.cells[0].t + '" cell2="' + r07.cells[1].t + '" count=' + r07.count);

  // ---------- J08 ----------
  const r08a = await runCase('\u9732'.repeat(23) + '\u2014\u2014');
  record('J08a 23字+—— 占格24-25不断开、计数25',
    r08a.cells[23].t === '\u2014\u2014' && r08a.count === 25,
    'cell24="' + r08a.cells[23].t + '" count=' + r08a.count);
  const r08b = await runCase('\u9732'.repeat(24) + '\u2014\u2014');
  record('J08b 24字+—— 格25空位、——占26-27、计数27',
    r08b.cells[24].t === '' && r08b.cells[25].t === '\u2014\u2014' && r08b.count === 27,
    'cell25="' + r08b.cells[24].t + '" cell26="' + r08b.cells[25].t + '" count=' + r08b.count);

  // ---------- J11 ----------
  const r11a = await runCase('A+3+B');
  record('J11a A+3+B 不换行、计数5',
    r11a.count === 5 && r11a.cells[0].t === 'A' && r11a.cells[4].t === 'B',
    'cell1="' + r11a.cells[0].t + '" cell5="' + r11a.cells[4].t + '" count=' + r11a.count);
  const r11b = await runCase('A\n+3+B');
  record('J11b A\\n+3+B B落r2c4、计数29',
    r11b.cells[28].t === 'B' && r11b.count === 29,
    'cell29="' + r11b.cells[28].t + '" count=' + r11b.count);

  // ---------- J12 ----------
  const r12a = await runCase('\u9732'.repeat(24) + '"\u5f15\u7528\u5185\u5bb9');
  record('J12a 24字+"+引用内容 格25空位、"落r2c1、计数30',
    r12a.cells[24].t === '' && r12a.cells[25].t === '"' && r12a.count === 30,
    'cell25="' + r12a.cells[24].t + '" cell26="' + r12a.cells[25].t + '" count=' + r12a.count);
  const r12b = await runCase('\u9732'.repeat(24) + '"');
  record('J12b 24字+孤立" 按收引号并入格24、计数24',
    r12b.cells[23].t === '\u9732"' && r12b.count === 24,
    'cell24="' + r12b.cells[23].t + '" count=' + r12b.count);

  // ---------- J13 ----------
  const r13 = await runCase('<img src=x onerror=alert(1)>');
  await new Promise(res => setTimeout(res, 300));
  const gridImgs = await page.evaluate(() => document.querySelectorAll('#grid-container img, #input-text img').length);
  record('J13 XSS 纯文本占格、无弹窗',
    r13.count > 0 && alertFired === null && gridImgs === 0,
    'cells=' + r13.count + ' alert=' + alertFired + ' imgs=' + gridImgs);

  // ---------- 走查19 ----------
  const depth = await page.evaluate(() => {
    const ta = document.getElementById('input-text');
    ta.innerText = '\u524d\u6587+2+\u4e2d\u6bb5+3+\u540e\u6587';
    for (let k = 0; k < 5; k++) { window.highlightDirectives(); }
    let maxDepth = 0;
    document.querySelectorAll('#input-text span').forEach(s => {
      let d = 0, el = s;
      while (el && el.tagName === 'SPAN') { d++; el = el.parentElement; }
      if (d > maxDepth) maxDepth = d;
    });
    return { maxDepth, directiveCount: document.querySelectorAll('#input-text span.directive').length };
  });
  record('走查19 重复高亮无 span 嵌套（F1/F2 前置）',
    depth.maxDepth <= 1 && depth.directiveCount === 2,
    'maxDepth=' + depth.maxDepth + ' directiveSpans=' + depth.directiveCount);

  // ---------- 双击定位回归（2026-10-13 真机反馈：前文正常、后文随换行累积偏后）----------
  // 布置文本：前段纯文字 / 换行 / +2+ 指令 / 二次换行 / 25字+。（行末同格合并格）/ 三次换行+指令+末段
  const dblText = '一二三四五六七八九十' + '\n+2+中段文字测试，' + '\n' + '露'.repeat(25) + '。' + '\n+3+末尾段落的收束句。';
  const dblEngine = computeGridContent(dblText, Number.MAX_SAFE_INTEGER);
  const dblMergedIdx = dblEngine.result.findIndex((c) => c && c.isMergedEOL);
  const dblSdIdx = dblEngine.result.findIndex((c) => c && c.isSpaceDirective);
  const dblProbes = [
    { name: '前段首字', idx: 0 },
    { name: '前段末字', idx: 9 },
    { name: '换行后指令格', idx: dblSdIdx },
    { name: '中段末字（1次换行后）', idx: 33 },
    { name: '二次换行后段首字', idx: 50 },
    { name: '行末同格合并格', idx: dblMergedIdx },
    { name: '三次换行后末段首字', idx: 78 },
    { name: '全文末字', idx: dblEngine.gridIndex - 1 }
  ];
  await page.evaluate((t) => {
    document.getElementById('input-text').innerText = t;
    window.distributeText();
    window.highlightDirectives();
  }, dblText);
  const dblOut = await page.evaluate((idxs) => {
    const div = document.getElementById('input-text');
    const items = Array.from(document.querySelectorAll('#grid-container .grid-item'));
    function caretIndex() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return -1;
      const range = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.selectNodeContents(div);
      pre.setEnd(range.startContainer, range.startOffset);
      // innerText 坐标：<br> 计 1 字符（与引擎 sourceIndex 同尺）
      return pre.toString().length + pre.cloneContents().querySelectorAll('br').length;
    }
    return idxs.map((i) => {
      items[i].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const it = items[i];
      return {
        text: it.textContent,
        src: it.dataset.sourceIndex === undefined ? null : parseInt(it.dataset.sourceIndex, 10),
        caret: caretIndex()
      };
    });
  }, dblProbes.map((p) => p.idx));
  for (let k = 0; k < dblProbes.length; k++) {
    const p = dblProbes[k];
    const exp = dblEngine.result[p.idx];
    const got = dblOut[k];
    record('双击定位·' + p.name + '（格' + (p.idx + 1) + '）',
      exp && got && got.text === exp.text && got.src === exp.sourceIndex && got.caret === got.src,
      'expect src=' + (exp ? exp.sourceIndex : 'null') + ' text=' + (exp ? JSON.stringify(exp.text) : 'null')
        + ' got src=' + got.src + ' caret=' + got.caret + ' text=' + JSON.stringify(got.text));
  }
  if (dblMergedIdx < 0 || dblSdIdx < 0) {
    record('双击定位·布置自检（合并格与指令格均已产生）', false,
      'mergedIdx=' + dblMergedIdx + ' sdIdx=' + dblSdIdx);
  } else {
    record('双击定位·布置自检（合并格与指令格均已产生）', true,
      'mergedIdx=' + dblMergedIdx + ' sdIdx=' + dblSdIdx + ' gridIndex=' + dblEngine.gridIndex);
  }

  // ---------- CSS 检查（先布置含 space-directive 与 merge-eol 的文本）----------
  const rSetup = await runCase('\u9732'.repeat(25) + '\u3002' + '\n+2+\u6d4b');
  const setupOk = await page.evaluate(() => {
    return {
      sd: document.querySelectorAll('#grid-container .space-directive').length,
      me: document.querySelectorAll('#grid-container .grid-item.merge-eol').length
    };
  });
  record('CSS 检查布置：标记格已存在', setupOk.sd === 2 && setupOk.me === 1,
    'space-directive=' + setupOk.sd + ' merge-eol=' + setupOk.me + ' count=' + rSetup.count);
  // .grid-item 有 background-color 0.15s 过渡，等待过渡完成再取计算样式
  await new Promise(r => setTimeout(r, 400));
  const css = await page.evaluate(() => {
    const sd = document.querySelector('.space-directive');
    const sdStyle = sd ? getComputedStyle(sd).backgroundImage + ' / ' + getComputedStyle(sd).backgroundColor : 'no-element';
    const me = document.querySelector('.grid-item.merge-eol');
    const meBg = me ? getComputedStyle(me).backgroundColor : 'no-element';
    const meImg = me ? getComputedStyle(me).backgroundImage : 'no-element';
    const meTitle = me ? (me.getAttribute('title') || '') : 'no-element';
    const normal = document.querySelector('#grid-container .grid-item:not(.space-directive):not(.merge-eol):not(.layout-space):not(.wide-symbol):not(.wide-second)');
    const normalBg = normal ? getComputedStyle(normal).backgroundColor : 'no-element';
    return { sdStyle, meBg, meImg, meTitle, normalBg };
  });
  record('F1 行末同格合并格无背景色差异（按用户 2026-10-13 真机反馈移除视觉区分）',
    css.meBg === css.normalBg && css.meBg === 'rgba(0, 0, 0, 0)' && css.meImg === 'none' && css.meTitle === '',
    'meBg=' + css.meBg + ' meImg=' + css.meImg + ' normalBg=' + css.normalBg + ' title=' + JSON.stringify(css.meTitle));
  record('缩进阴影 屏幕态纯色 rgba(198,40,40,0.05) 无斜纹',
    css.sdStyle.includes('rgba(198, 40, 40, 0.05)') && css.sdStyle.startsWith('none'),
    css.sdStyle);

  // ---------- 打印纯净 ----------
  await page.emulateMediaType('print');
  await new Promise(r => setTimeout(r, 400));
  const printBg = await page.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'no-element';
      return getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el).backgroundImage;
    };
    return { sd: bg('.space-directive'), me: bg('.grid-item.merge-eol'), any: bg('.grid-item') };
  });
  await page.emulateMediaType('screen');
  const printPass = printBg.sd.includes('rgba(0, 0, 0, 0)')
    && printBg.me.includes('rgba(0, 0, 0, 0)')
    && printBg.any.includes('rgba(0, 0, 0, 0)')
    && printBg.sd.includes('none') && printBg.me.includes('none') && printBg.any.includes('none');
  record('打印纯净 @media print 背景全透明', printPass, JSON.stringify(printBg));

  // ---------- J-Perf（#16 重写：完成口径 + #4 验收阈值与形状断言） ----------
  // t0 = distributeText 入口；完成 = markRenderComplete 连续两次 rAF 后（一次完整 layout+paint 已提交）。
  // 1 核沙箱绝对阈值按 TEST_PERF_SCALE 放宽（默认 3），机器无关的形状断言（T5000/T2000 ≤ 4）不放宽。
  const PERF_SCALE = Number(process.env.TEST_PERF_SCALE || '3');
  async function perfRun(nChars) {
    return page.evaluate(async (n) => {
      const waitDone = () => new Promise((resolve) => {
        const check = () => (window.__renderDoneGen !== 0 ? resolve() : requestAnimationFrame(check));
        requestAnimationFrame(check);
      });
      // 先复位到小网格（减格路径），保证被测渲染为「从 ~10 格全量铺开」而非增量
      document.getElementById('input-text').innerText = '申'.repeat(10);
      window.distributeText();
      await waitDone();
      // 全角 1:1（无禁则字符干扰），字数=格数
      document.getElementById('input-text').innerText = '申'.repeat(n);
      window.distributeText();
      await waitDone();
      return window.__renderEndTs - window.__renderStartTs;
    }, nChars);
  }
  await perfRun(50); // 预热：headless 首帧 rAF 可能长延迟（实测一次 ~5s），避免污染正式计时
  const perf2000 = await perfRun(2000);  // 2000 字（全量）
  const perf5000 = await perfRun(5000);  // 5000 字（全量，同样从复位态铺开）
  const ratio = perf5000 / perf2000;
  record('#16/#4 J-Perf 2000字完成口径 ≤ ' + (500 * PERF_SCALE) + 'ms（沙箱放宽 x' + PERF_SCALE + '，桌面阈值 500ms）',
    perf2000 <= 500 * PERF_SCALE, perf2000.toFixed(2) + 'ms');
  record('#16/#4 J-Perf 5000字完成口径 ≤ ' + (1500 * PERF_SCALE) + 'ms（沙箱放宽 x' + PERF_SCALE + '，桌面阈值 1500ms）',
    perf5000 <= 1500 * PERF_SCALE, perf5000.toFixed(2) + 'ms');
  record('#16/#4 J-Perf 形状断言 T(5000)/T(2000) ≤ 4（防二次方复发，机器无关）',
    ratio <= 4, ratio.toFixed(2) + '（' + perf5000.toFixed(0) + '/' + perf2000.toFixed(0) + '）');

  // #4 回归：代际失效——分帧兜底渲染中途修改文本，旧循环立即失效，最终格子与新文本一致
  const genRace = await page.evaluate(async () => {
    // 先复位到小网格（走减格路径），确保下一步「新增 >8000 格」真正触发分帧兜底
    document.getElementById('input-text').innerText = '甲'.repeat(30);
    window.distributeText();
    // 触发分帧兜底路径（新增 8100-50 > 8000 格）
    document.getElementById('input-text').innerText = '申'.repeat(8100);
    window.distributeText();
    // 立即改文本再渲染（旧分帧循环应失效）
    document.getElementById('input-text').innerText = '乙'.repeat(30);
    window.distributeText();
    await new Promise((resolve) => {
      const check = () => (window.__renderDoneGen !== 0 ? resolve() : requestAnimationFrame(check));
      requestAnimationFrame(check);
    });
    await new Promise(r => setTimeout(r, 700)); // 给被作废的旧 rAF 循环留两帧，确认不再写格子
    const all = Array.from(document.querySelectorAll('#grid-container .grid-item'));
    const texts = all.map(c => c.textContent);
    const ok30 = texts.length >= 30 && texts.slice(0, 30).every((t) => t === '乙');
    const noOther = !texts.some(t => t.includes('申') || t.includes('甲'));
    return { count: all.length, ok30, noOther };
  });
  record('#4 分帧兜底中途改文本：代际失效，最终格子与新文本一致',
    genRace.ok30 && genRace.noOther, 'count=' + genRace.count + ' ok30=' + genRace.ok30 + ' noOther=' + genRace.noOther);

  // #4 新增断言：增量渲染——改 1 字只动受影响格，其余格内容/属性逐项不变
  const incremental = await page.evaluate(() => {
    document.getElementById('input-text').innerText = '甲'.repeat(100);
    window.distributeText();
    const snap = () => Array.from(document.querySelectorAll('#grid-container .grid-item')).map(c =>
      ({ t: c.textContent, cls: c.className, si: c.getAttribute('data-source-index') }));
    const before = snap();
    document.getElementById('input-text').innerText = '甲'.repeat(50) + '乙' + '甲'.repeat(49);
    window.distributeText();
    const after = snap();
    let changed = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      const b = before[i] || {}; const a = after[i] || {};
      if (b.t !== a.t || b.cls !== a.cls || b.si !== a.si) { changed.push(i + 1); }
    }
    return { changed, countBefore: before.length, countAfter: after.length };
  });
  record('#4 增量渲染：改 1 字仅第 51 格变化，其余格快照零扰动',
    incremental.changed.length === 1 && incremental.changed[0] === 51
      && incremental.countBefore === incremental.countAfter,
    'changed=' + JSON.stringify(incremental.changed));

  // ---------- 既有功能 ----------
  const feats = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim());
    const has = (name) => btns.some(t => t.includes(name));
    return {
      undo: typeof window.undo === 'function',
      autoInputToggle: typeof window.toggleAutoInput === 'function',
      downloadText: typeof window.downloadText === 'function',
      importText: typeof window.importText === 'function',
      clearPlusN: typeof window.clearPlusN === 'function',
      clearNewLines: typeof window.clearNewLines === 'function',
      clearSpaces: typeof window.clearSpaces === 'function',
      clearInput: typeof window.clearInput === 'function',
      updateCountTarget: typeof window.updateCountTarget === 'function',
      resetTextarea: typeof window.resetTextarea === 'function',
      adjustTextarea: typeof window.adjustTextarea === 'function',
      adjustFontSize: typeof window.adjustFontSize === 'function',
      dblclickHandlerBound: !!document.getElementById('grid-container'),
      btnUndo: has('\u64a4\u9500'),
      btnPrint: has('\u6253\u5370'),
      btnExport: has('\u5bfc\u51fa'),
      btnImport: has('\u5bfc\u5165'),
      btnAutoInput: has('\u81ea\u52a8\u8f93\u5165')
    };
  });
  record('既有功能函数/按钮齐备（+N+/撤销/打印/导入导出/自动输入/清空系）',
    Object.values(feats).every(Boolean), JSON.stringify(feats));

  // ---------- localStorage 持久化（真实 oninput 路径：distributeTextWithDelay -> saveToLocalStorage）----------
  await page.evaluate(() => {
    const el = document.getElementById('input-text');
    el.innerText = '\u6301\u4e45\u5316\u56de\u5f52\u6d4b\u8bd5\u6587\u672c\u3002';
    // 触发真实 oninput 事件链（与用户输入同路径）
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.distributeTextWithDelay();
  });
  // 轮询等待保存完成（应用保存链为 80ms 延迟 + ResizeObserver 200ms 链，上限 3s）
  let savedOk = false;
  try {
    await page.waitForFunction(() =>
      (localStorage.getItem('savedText') || '').replace(/\s+/g, '') === '\u6301\u4e45\u5316\u56de\u5f52\u6d4b\u8bd5\u6587\u672c\u3002',
      { timeout: 3000, polling: 200 });
    savedOk = true;
  } catch (e) { savedOk = false; }
  record('localStorage 写入（oninput 路径保存）', savedOk, savedOk ? 'savedText 已更新' : '3s 内未保存');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('#grid-container .grid-item').length > 0, { timeout: 10000 });
  const persisted = await page.evaluate(() => {
    const raw = localStorage.getItem('savedText');
    const saved = (raw || '').replace(/\s+/g, '');
    const restored = document.getElementById('input-text').innerText;
    return { savedOk: saved === '\u6301\u4e45\u5316\u56de\u5f52\u6d4b\u8bd5\u6587\u672c\u3002', restoredOk: restored.trim().length > 0, rawLen: raw ? raw.length : -1, rawHead: raw ? raw.slice(0, 20) : 'null' };
  });
  record('localStorage 持久化恢复', persisted.savedOk && persisted.restoredOk,
    'reload 后输入区恢复="' + (persisted.restoredOk ? '持久化回归测试文本。' : 'EMPTY') + '" rawLen=' + persisted.rawLen);

  // ---------- #1 viewport meta / 移动端激活（20261014a 批1） ----------
  const viewportMeta = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return m ? m.content : null;
  });
  record('#1 viewport meta 存在且值正确', viewportMeta === 'width=device-width, initial-scale=1', String(viewportMeta));
  await page.setViewport({ width: 375, height: 800 });
  await new Promise(r => setTimeout(r, 300));
  const mobileCheck = await page.evaluate(() => {
    const hint = document.querySelector('.mobile-hint');
    const grid = document.getElementById('grid-container');
    return {
      hintDisplay: hint ? getComputedStyle(hint).display : 'no-element',
      overflowX: grid ? getComputedStyle(grid).overflowX : 'no-element'
    };
  });
  record('#1 375px 视口 mobile-hint 可见', mobileCheck.hintDisplay === 'block', 'display=' + mobileCheck.hintDisplay);
  record('#1 375px 视口 grid overflow-x auto（横向滚动激活）', mobileCheck.overflowX === 'auto', 'overflow-x=' + mobileCheck.overflowX);
  await page.setViewport({ width: 800, height: 600 });
  await new Promise(r => setTimeout(r, 500)); // 等 ResizeObserver 链沉淀，避免影响后续断言

  // ---------- #6 Ctrl+Z 接管 / #9 撤销落盘 / 栈底一次性提示（20261014a 批1） ----------
  await page.evaluate(() => {
    const el = document.getElementById('input-text');
    el.innerText = '你好';
    window.distributeText();
  });
  await new Promise(r => setTimeout(r, 600)); // 撤销节流 400ms
  await page.evaluate(() => {
    const el = document.getElementById('input-text');
    el.innerText = '你好\n+2+世界';
    window.distributeText();
  });
  await new Promise(r => setTimeout(r, 600));
  const undoStep1 = await page.evaluate(() => {
    const el = document.getElementById('input-text');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    return { text: el.innerText, saved: localStorage.getItem('savedText') };
  });
  record('#6 Ctrl+Z 接管：内容回到上一步', undoStep1.text === '你好', JSON.stringify(undoStep1.text));
  record('#9 撤销落盘：savedText 同步为撤销后内容', undoStep1.saved === '你好', JSON.stringify(undoStep1.saved));
  // 再撤销一步：回到载入时的初始快照（栈里此时仅剩 1 条）
  const undoStep2 = await page.evaluate(() => {
    const el = document.getElementById('input-text');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    return { text: el.innerText };
  });
  record('#6 Ctrl+Z 连续撤销到初始快照', undoStep2.text === '持久化回归测试文本。', JSON.stringify(undoStep2.text));
  const undoBottom1 = await page.evaluate(() => {
    const el = document.getElementById('input-text');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    const info = document.getElementById('info-message');
    return {
      text: el.innerText,
      shown: info.classList.contains('show'),
      msg: info.innerText,
      hinted: !!localStorage.getItem('hint:undoBottom')
    };
  });
  record('#6 栈底首次一次性 info 提示（hint:undoBottom 落键）',
    undoBottom1.text === '持久化回归测试文本。' && undoBottom1.shown && undoBottom1.hinted && undoBottom1.msg.includes('最早记录'),
    'text=' + JSON.stringify(undoBottom1.text) + ' shown=' + undoBottom1.shown + ' msg=' + JSON.stringify(undoBottom1.msg));
  const undoBottom2 = await page.evaluate(() => {
    const info = document.getElementById('info-message');
    info.classList.remove('show');
    const el = document.getElementById('input-text');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    return { shown: info.classList.contains('show') };
  });
  record('#6 栈底二次按键永久静默', undoBottom2.shown === false, 'shown=' + undoBottom2.shown);
  const undoImePass = await page.evaluate(() => {
    // IME 组字期（isComposing）Ctrl+Z 放行：不触发全局栈，内容不变
    const el = document.getElementById('input-text');
    const before = el.innerText;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true }));
    return { changed: el.innerText !== before };
  });
  record('#6 IME 组字期 Ctrl+Z 放行（内容不被全局栈撤销）', undoImePass.changed === false, 'changed=' + undoImePass.changed);

  // ---------- 批2（20261014b）：#13/#14 meta CSP、#17b 打印拦截、#17c 双击文案、#17d favicon、#18 复原复位字号 ----------
  const cspMeta = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return meta ? meta.content : '';
  });
  record('#13/#14 meta CSP 含 beacon script-src 域',
    cspMeta.includes("script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com"),
    cspMeta.slice(0, 120));
  record('#13/#14 meta CSP 含 beacon connect-src 域',
    cspMeta.includes("connect-src 'self' https://cloudflareinsights.com"), cspMeta.slice(0, 120));

  const staticText = await page.evaluate(() => ({
    guide: document.getElementById('guide-desc').innerText,
    mobile: document.querySelector('.mobile-hint').innerText
  }));
  record('#17c 桌面 guide 含双击静态文案', staticText.guide.includes('双击格子可定位到对应文字'),
    JSON.stringify(staticText.guide));
  record('#17c 移动端 mobile-hint 含长按静态文案',
    staticText.mobile.includes('双击或长按格子，可跳到对应文字位置'), JSON.stringify(staticText.mobile));

  const seoCheck = await page.evaluate(async () => {
    const desc = document.querySelector('meta[name="description"]');
    const icon = document.querySelector('link[rel="icon"]');
    let faviconOk = false;
    try {
      const res = await fetch('favicon.svg');
      faviconOk = res.ok && (await res.text()).includes('#c62828');
    } catch (e) { faviconOk = false; }
    return {
      desc: desc ? desc.content : '',
      iconHref: icon ? icon.getAttribute('href') : 'none',
      iconType: icon ? icon.getAttribute('type') : 'none',
      faviconOk
    };
  });
  record('#17d description meta 存在且含关键词', seoCheck.desc.includes('申论') && seoCheck.desc.includes('格子纸'),
    seoCheck.desc);
  record('#17d favicon.svg 同源引用且可访问', seoCheck.iconHref === 'favicon.svg' && seoCheck.iconType === 'image/svg+xml' && seoCheck.faviconOk,
    'href=' + seoCheck.iconHref + ' type=' + seoCheck.iconType + ' fetched=' + seoCheck.faviconOk);

  // #17b：空内容打印被 confirm 拦截（confirm 取消不打印、确定打印）；有内容不拦截
  const printCheck = await page.evaluate(() => {
    const el = document.getElementById('input-text');
    const log = { confirmMsg: null, printAfterCancel: null, printAfterOk: null, confirmWithContent: null };
    const origConfirm = window.confirm; const origPrint = window.print;
    window.confirm = (m) => { log.confirmMsg = m; return false; };
    window.print = () => {};
    try {
      // 场景 1：空内容 + confirm 取消
      el.innerText = ''; window.distributeText();
      window.printGrid();
      log.printAfterCancel = window.__printedProbe === true;
      // 场景 2：空内容 + confirm 确定 → 进入打印
      window.confirm = (m) => { log.confirmMsg2 = m; return true; };
      window.print = () => { window.__printedProbe = true; };
      window.printGrid();
      log.printAfterOk = window.__printedProbe === true;
      window.__printedProbe = false;
      // 场景 3：有内容 → 不弹 confirm 直接打印
      el.innerText = '内容排版测试'; window.distributeText();
      window.confirm = (m) => { log.confirmWithContent = m; return false; };
      window.printGrid();
      log.printWithContent = window.__printedProbe === true;
    } finally {
      window.confirm = origConfirm; window.print = origPrint;
    }
    log.confirmOk = !!log.confirmMsg && log.confirmMsg.includes('空白页');
    return log;
  });
  record('#17b 空内容打印被 confirm 拦截且文案正确', printCheck.confirmOk && printCheck.printAfterCancel === false,
    'msg=' + JSON.stringify(printCheck.confirmMsg) + ' printAfterCancel=' + printCheck.printAfterCancel);
  record('#17b 确认后进入打印', printCheck.printAfterOk === true, 'printAfterOk=' + printCheck.printAfterOk);
  record('#17b 有内容打印零拦截', printCheck.printWithContent === true && printCheck.confirmWithContent === null,
    'print=' + printCheck.printWithContent + ' confirm=' + JSON.stringify(printCheck.confirmWithContent));

  // #18：复原同时复位字号与尺寸（宽 ×2、字大 ×3 → 复原 → 全部回默认）
  const resetCheck = await page.evaluate(() => {
    const root = document.documentElement;
    const el = document.getElementById('input-text');
    const w0 = el.style.width; const h0 = el.style.height;
    window.adjustTextarea('wide'); window.adjustFontSize(1); window.adjustFontSize(1); window.adjustFontSize(1);
    const enlarged = parseFloat(getComputedStyle(root).getPropertyValue('--content-font-size'));
    const widened = el.style.width;
    window.resetTextarea();
    const reset = parseFloat(getComputedStyle(root).getPropertyValue('--content-font-size'));
    const resetW = el.style.width; const resetH = el.style.height;
    // 幂等：再复原一次无变化
    window.resetTextarea();
    const again = parseFloat(getComputedStyle(root).getPropertyValue('--content-font-size'));
    return { enlarged, widened, w0, reset, resetW, resetH, again, w0Changed: widened !== w0 };
  });
  record('#18 字大×3 后字号非默认', resetCheck.enlarged > 18, 'enlarged=' + resetCheck.enlarged);
  record('#18 复原后字号复位 18px', resetCheck.reset === 18, 'reset=' + resetCheck.reset);
  record('#18 复原幂等且尺寸复原', resetCheck.again === 18 && resetCheck.resetW === '40%' && resetCheck.resetH === '250px',
    'again=' + resetCheck.again + ' resetW=' + JSON.stringify(resetCheck.resetW) + ' resetH=' + JSON.stringify(resetCheck.resetH));


  // ---------- 批4（20261014d）：#8/#10 格位规则 + #11/#12/#15/emoji 输入边界 ----------

  // #8：你好+23+。→ 合并目标回真实内容格；双击合并格定位回「好」
  const b4v8 = await runCase('你好+23+。');
  record('#8 你好+23+。 格2=「好。」merge-eol、格3-25 指令空格、计数25',
    b4v8.cells[1].t === '好。' && b4v8.cells[1].cls.includes('merge-eol')
      && b4v8.cells.slice(2, 25).every(c => c.cls.includes('space-directive')) && b4v8.count === 25,
    'cell2="' + b4v8.cells[1].t + '" cls="' + b4v8.cells[1].cls + '" count=' + b4v8.count);
  const b4v8dbl = await page.evaluate(() => {
    const div = document.getElementById('input-text');
    const item = document.querySelectorAll('#grid-container .grid-item')[1];
    item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const sel = window.getSelection();
    let caret = -1;
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.selectNodeContents(div);
      pre.setEnd(range.startContainer, range.startOffset);
      caret = pre.toString().length + pre.cloneContents().querySelectorAll('br').length;
    }
    return { src: parseInt(item.dataset.sourceIndex, 10), caret };
  });
  record('#8 双击合并格「好。」→ caret=sourceIndex=1',
    b4v8dbl.src === 1 && b4v8dbl.caret === 1, 'src=' + b4v8dbl.src + ' caret=' + b4v8dbl.caret);

  // #10：25字+。！？→ 4 字符合并格 + 挤压缩放
  const b4v10 = await page.evaluate(() => {
    document.getElementById('input-text').innerText = '露'.repeat(25) + '。！？';
    window.distributeText();
    const items = document.querySelectorAll('#grid-container .grid-item');
    const squeezed = items[24];
    return {
      t: squeezed.textContent, cls: squeezed.className,
      fs: getComputedStyle(squeezed).fontSize, fn: getComputedStyle(items[0]).fontSize,
      sw: squeezed.scrollWidth, cw: squeezed.clientWidth
    };
  });
  record('#10 25字+。！？ 合并链4字符全并入格25（引擎语义锁定）',
    b4v10.t === '露。！？' && b4v10.cls.includes('merge-eol'),
    't="' + b4v10.t + '" cls="' + b4v10.cls + '"');
  record('#10 挤压格字号小于普通格且不溢出',
    parseFloat(b4v10.fs) < parseFloat(b4v10.fn) && b4v10.sw <= b4v10.cw + 2,
    'fs=' + b4v10.fs + ' normal=' + b4v10.fn + ' sw=' + b4v10.sw + '/' + b4v10.cw);

  // #11/#12/#3：粘贴边界（富文本拦截 + 归一化 + emoji 剥离）
  const b4paste = await page.evaluate(async () => {
    const div = document.getElementById('input-text');
    div.innerText = ''; window.distributeText(); div.focus();
    const range = document.createRange(); range.selectNodeContents(div); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const dt = new DataTransfer();
    dt.setData('text/plain', '申👍论\r\n好❤️啊\uFEFF');
    dt.setData('text/html', '<b>加粗</b><span style="color:red">样式</span>');
    div.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    const all = document.querySelectorAll('#grid-container .grid-item');
    const count = parseInt((document.getElementById('count-display').textContent.match(/(\d+)/) || [0, 0])[1], 10);
    return { text: div.innerText,
             rich: div.querySelectorAll('b, span:not(.directive)').length,
             count, cells: Array.from(all).slice(0, 30).map(c => c.textContent) };
  });
  record('#12 粘贴拦截：输入区无富文本 b/span', b4paste.rich === 0, 'rich=' + b4paste.rich);
  record('#11/#3 粘贴归一化：CR→LF、emoji/BOM 剥离',
    b4paste.text === '申论\n好啊', 'text=' + JSON.stringify(b4paste.text));
  record('#11/#3 粘贴归一化：计数27、行1=申论、行2首格26=好（换行补满当前行）',
    b4paste.count === 27 && b4paste.cells[0] === '申' && b4paste.cells[1] === '论'
      && b4paste.cells[24] === '' && b4paste.cells[25] === '好' && b4paste.cells[26] === '啊',
    'count=' + b4paste.count + ' c1=' + b4paste.cells[0] + ' c2=' + b4paste.cells[1]
      + ' c25=' + b4paste.cells[24] + ' c26=' + b4paste.cells[25] + ' c27=' + b4paste.cells[26]);

  // #3(终版) emoji 一致性：含 emoji 输入（经粘贴边界）与等价纯文本的计数/格位/双击定位完全一致
  const b4emoji = await page.evaluate(async () => {
    const div = document.getElementById('input-text');
    function caretIndex() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return -1;
      const range = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.selectNodeContents(div);
      pre.setEnd(range.startContainer, range.startOffset);
      return pre.toString().length + pre.cloneContents().querySelectorAll('br').length;
    }
    const mkSnap = () => {
      const items = document.querySelectorAll('#grid-container .grid-item');
      const count = parseInt((document.getElementById('count-display').textContent.match(/(\d+)/) || [0, 0])[1], 10);
      items[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return { count, caret: caretIndex(), cells: Array.from(items).slice(0, 4).map(c => c.textContent),
               src: parseInt(items[1].dataset.sourceIndex, 10) };
    };
    // A：经粘贴边界输入含 emoji 文本（ZWJ 家族 + BMP emoji + 变体选择符）
    div.innerText = ''; window.distributeText(); div.focus();
    const range = document.createRange(); range.selectNodeContents(div); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const dt = new DataTransfer();
    dt.setData('text/plain', '申👍论👨‍👩‍👧好❤️啊');
    div.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    const A = mkSnap();
    // B：等价纯文本直接写入
    div.innerText = '申论好啊'; window.distributeText();
    const B = mkSnap();
    return { A, B };
  });
  record('#3(终版) emoji 一致性：计数与格位与纯文本完全一致',
    b4emoji.A.count === b4emoji.B.count && b4emoji.A.count === 4
      && JSON.stringify(b4emoji.A.cells) === JSON.stringify(b4emoji.B.cells),
    'A=' + JSON.stringify(b4emoji.A) + ' B=' + JSON.stringify(b4emoji.B));
  record('#3(终版) emoji 一致性：双击定位 caret=sourceIndex 与纯文本相同',
    b4emoji.A.caret === b4emoji.B.caret && b4emoji.A.caret === 1 && b4emoji.A.src === 1,
    'caretA=' + b4emoji.A.caret + ' caretB=' + b4emoji.B.caret + ' src=' + b4emoji.A.src);

  // #20(2)：清理块收敛后四按钮行为快照不变
  const b4clear = await page.evaluate(() => {
    const div = document.getElementById('input-text');
    div.innerText = '甲\n乙 +2+ 丙'; window.distributeText();
    window.clearNewLines();
    const a1 = div.innerText;
    window.clearSpaces();
    const a2 = div.innerText;
    window.clearPlusN();
    const a3 = div.innerText;
    window.clearInput();
    const a4 = div.innerText;
    return { a1, a2, a3, a4 };
  });
  record('#20(2) 清理块收敛：清换行/清空格/清+N+/清空 行为快照不变',
    b4clear.a1 === '甲乙 +2+ 丙' && b4clear.a2 === '甲乙+2+丙' && b4clear.a3 === '甲乙丙' && b4clear.a4 === '',
    JSON.stringify(b4clear));

  // #20(6)：localStorage 不可用（新页遮蔽）→ 粘贴触发保存路径 → 一次性可见提示
  const page2 = await browser.newPage();
  await page2.evaluateOnNewDocument(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('denied', 'SecurityError'); },
      configurable: true
    });
  });
  await page2.goto(BASE, { waitUntil: 'networkidle0' });
  await page2.waitForFunction(() => document.querySelectorAll('#grid-container .grid-item').length > 0, { timeout: 10000 });
  const b4storage = await page2.evaluate(async () => {
    const div = document.getElementById('input-text');
    div.innerText = ''; window.distributeText(); div.focus();
    const range = document.createRange(); range.selectNodeContents(div); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const dt = new DataTransfer();
    dt.setData('text/plain', '测试存储提示');
    div.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));
    const el = document.getElementById('error-message');
    return { shown: el.classList.contains('show'), msg: el.innerText };
  });
  record('#20(6) localStorage 不可用时一次性可见提示',
    b4storage.shown && b4storage.msg.includes('本地存储不可用'),
    'shown=' + b4storage.shown + ' msg=' + JSON.stringify(b4storage.msg));
  await page2.close();

  // ---------- 批5（20261014e）：#7 触屏长按、#19 无障碍、#19b 导出提示 ----------
  // b4clear 的 clearInput() 走 80ms 延迟渲染路径，会把 main page 的格子清空；
  // 批5 断言依赖真实格子（role/样式/长按），先同步布置内容并渲染。
  await page.evaluate(() => {
    document.getElementById('input-text').innerText = '申论测试';
    window.distributeText();
  });
  const b5a11y = await page.evaluate(() => ({
    label: document.getElementById('grid-container').getAttribute('aria-label'),
    role: document.getElementById('grid-container').getAttribute('role'),
    cellRoles: Array.from(document.querySelectorAll('#grid-container .grid-item')).slice(0, 5)
      .map(c => c.getAttribute('role')),
    undoBtn: (() => { const b = document.querySelector('button[onclick="undo()"]');
      return { title: b ? b.getAttribute('title') : null, keys: b ? b.getAttribute('aria-keyshortcuts') : null }; })()
  }));
  record('#19 grid-container aria 改述 + 内容格 role=gridcell（空内容格 role 移除）',
    (b5a11y.label || '').includes('双击') && b5a11y.role === 'grid'
      && b5a11y.cellRoles.slice(0, 4).every(r => r === 'gridcell') && b5a11y.cellRoles[4] === null,
    'label=' + JSON.stringify(b5a11y.label) + ' roles=' + JSON.stringify(b5a11y.cellRoles));
  record('#19 撤销按钮 title 与 aria-keyshortcuts=Control+Z',
    (b5a11y.undoBtn.title || '').includes('Ctrl+Z') && b5a11y.undoBtn.keys === 'Control+Z',
    JSON.stringify(b5a11y.undoBtn));

  const b5css = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#grid-container .grid-item'));
    return { us: cs.userSelect, ta: cs.touchAction };
  });
  record('#7 格子 user-select:none 与 touch-action:manipulation',
    b5css.us === 'none' && b5css.ta === 'manipulation', 'userSelect=' + b5css.us + ' touchAction=' + b5css.ta);

  const b5press = await page.evaluate(async () => {
    document.getElementById('input-text').innerText = '申论测试';
    window.distributeText();
    const item = document.querySelectorAll('#grid-container .grid-item')[2];
    item.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: 50, clientY: 50 }));
    await new Promise((r) => setTimeout(r, 650));
    const div = document.getElementById('input-text');
    const sel = window.getSelection();
    let caret = -1;
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.selectNodeContents(div);
      pre.setEnd(range.startContainer, range.startOffset);
      caret = pre.toString().length;
    }
    document.getElementById('grid-container').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { caret, src: parseInt(item.dataset.sourceIndex, 10) };
  });
  record('#7 触屏长按 550ms 兜底定位：caret=sourceIndex=2',
    b5press.caret === b5press.src && b5press.src === 2, 'caret=' + b5press.caret + ' src=' + b5press.src);

  const b5export = await page.evaluate(async () => {
    localStorage.removeItem('hint:export');
    window.downloadText();
    const info = document.getElementById('info-message');
    const shown1 = info.classList.contains('show');
    const hintSet = !!localStorage.getItem('hint:export');
    await new Promise((r) => setTimeout(r, 5200));
    const hidden = !info.classList.contains('show');
    window.downloadText();
    const shown2 = info.classList.contains('show');
    return { shown1, hintSet, hidden, shown2 };
  });
  record('#19b 导出首次 info 提示：首见展示+hint 落库+5s 消失+再见静默',
    b5export.shown1 && b5export.hintSet && b5export.hidden && !b5export.shown2,
    JSON.stringify(b5export));

  // ---------- 页面无 JS 报错 ----------
  record('无页面 JS 运行错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' ; '));

  const failed = results.filter(r => !r.pass);
  console.log('\n==== ' + (results.length - failed.length) + '/' + results.length + ' passed ====');
  if (consoleErrors.length) console.log('console errors:', consoleErrors);
  await browser.close();
  server.close();
  process.exit(failed.length === 0 ? 0 : 1);
} catch (e) {
  console.error('BROWSER TEST ERROR:', e && e.stack || e);
  try { await browser.close(); } catch (_) {}
  server.close();
  process.exit(2);
}
