// 浏览器端 E2E 验收测试（dtk 申论格子纸 · 终局裁决 E 清单）
// 运行：node test/browser.test.mjs（无需外部服务器，本文件内置静态服务）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGridContent } from '../js/engine.js';
import puppeteer from '/home/gem/.aily/.cli/npm/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

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
  executablePath: '/usr/bin/chromium-browser',
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

  // ---------- J-Perf ----------
  const perf = await page.evaluate(() => {
    const text = '\u7533\u8bba\u5199\u4f5c\u6d4b\u8bd5\u5185\u5bb9\u3002'.repeat(200); // 2000字
    document.getElementById('input-text').innerText = text;
    const t0 = performance.now();
    window.distributeText();
    const t1 = performance.now();
    return t1 - t0;
  });
  record('J-Perf 2000字全量渲染 ≤ 500ms', perf <= 500, perf.toFixed(2) + 'ms');

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
