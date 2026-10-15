/**
 * version-sync.test.mjs —— 版本同步与发版纪律机器门禁（node:test，零依赖）
 *
 * 白屏优化⑤/⑥（20261015a）配套：_headers 给 js/ 开了一年 immutable 强缓存后，
 * 「漏 bump / 手工单改一处 / HTML 被强缓存」都变成最长一年不可自愈的事故，
 * 以下纪律全部机器断言，进 npm test 与 CI 两个 job：
 *
 *  ① 全仓 ?v= 取值唯一且 == package.json version（index.html + js/*.js 共 12 处）
 *  ② index.html 的 modulepreload href 集合 ≡ 全仓 import URL 集合
 *    （href 与 specifier 必须逐字符一致——module map 按 URL 含 query 寻址，
 *      差一个字符 = 同一模块抓两遍，preload 白做）
 *  ③ HTML 内置范文副本（实体反转义归一后）=== js/default-text.js 的 DEFAULT_TEXT
 *  ④ _headers：/* 块无 Cache-Control；immutable 只出现在 /js/* 块
 *
 * 注意口径：README / 测试文件中的版本无关占位写法（`?v=<版本号>`）不计入 ①，
 * ① 只扫 index.html 与 js/*.js 中的带值 `?v=<版本号>`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TEXT } from '../js/default-text.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const EXPECTED_V_REFS = 12; // index.html 9（5 preload + 4 import）+ js/ 3（engine 1 + auto-format 2）

function readRoot(rel) { return readFileSync(join(ROOT, rel), 'utf8'); }

// ① 全仓 ?v= 取值唯一且 == package.json version
test('① 全仓 ?v= 取值唯一且等于 package.json version（12 处）', () => {
  const files = ['index.html'];
  for (const name of readdirSync(join(ROOT, 'js'))) {
    if (name.endsWith('.js')) { files.push(join('js', name)); }
  }
  const values = new Set();
  let count = 0;
  for (const rel of files) {
    for (const m of readRoot(rel).matchAll(/\?v=([0-9]{8}[a-z])/g)) {
      values.add(m[1]);
      count++;
    }
  }
  assert.equal(values.size, 1, `全仓 ?v= 取值必须唯一，实际取值: ${[...values].join(', ')}`);
  assert.equal([...values][0], pkg.version, `全仓 ?v= 必须等于 package.json version（${pkg.version}）`);
  assert.equal(count, EXPECTED_V_REFS, `全仓 ?v= 引用数必须为 ${EXPECTED_V_REFS}（index.html 9 + js/ 3），实际 ${count}`);
});

// ② modulepreload href 集合 ≡ import URL 集合
test('② modulepreload href 集合 === import URL 集合', () => {
  const html = readRoot('index.html');
  const preloads = new Set();
  for (const m of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) {
    // ./js/x.js?v=… → js/x.js?v=…（去掉 ./ 前缀，与 js/ 内相对引用归一到同一路径口径）
    assert.ok(m[1].startsWith('./js/'), `modulepreload href 应指向 js/ 模块: ${m[1]}`);
    preloads.add(m[1].slice(2));
  }
  const imports = new Set();
  for (const m of html.matchAll(/from\s+'(\.\/js\/[^']+)'/g)) { imports.add(m[1].slice(2)); }
  const engineSrc = readRoot('js/engine.js');
  for (const m of engineSrc.matchAll(/from\s+'(\.\/[^']+)'/g)) {
    // engine.js 位于 js/ 内，./punctuation-rules.js?v=… → js/punctuation-rules.js?v=…
    imports.add(`js/${m[1].slice(2)}`);
  }
  assert.equal(preloads.size, 5, `modulepreload 应恰好 5 条，实际 ${preloads.size}`);
  assert.equal(imports.size, 5, `import URL 应恰好 5 个（index.html 4 + engine.js 1），实际 ${imports.size}`);
  assert.deepEqual([...preloads].sort(), [...imports].sort(),
    'modulepreload href 与 import URL 集合必须完全一致（href 与 specifier 逐字符相同，否则同一模块按 module map 双重下载，preload 白做）');
});

// ③ HTML 范文副本（实体反转义归一后）=== DEFAULT_TEXT
test('③ HTML 内置范文副本 === js/default-text.js 的 DEFAULT_TEXT', () => {
  const html = readRoot('index.html');
  const m = html.match(/<div id="input-text"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(m, 'index.html 中应存在 #input-text 范文副本');
  const unescape = (s) => s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // &amp; 必须最后反转义，避免二次反转义
  const htmlCopy = unescape(m[1]);
  assert.equal(htmlCopy, DEFAULT_TEXT,
    'HTML 范文副本与 DEFAULT_TEXT 必须逐字一致（双源编辑义务：改一处必须同步另一处；'
    + 'HTML 源码内该副本各行禁止缩进空格、首行紧跟开标签、末行紧贴 </div>）');
});

// ④ _headers：/* 块无 Cache-Control；immutable 只出现在 /js/* 块
test('④ _headers 缓存纪律：/* 无 Cache-Control，immutable 仅在 /js/*', () => {
  const lines = readRoot('_headers').split(/\r?\n/);
  const blocks = []; // { path, headers: [line, …] }
  for (const raw of lines) {
    if (raw.startsWith('#') || raw.trim() === '') { continue; }
    if (/^\s/.test(raw)) {
      assert.ok(blocks.length > 0, `_headers 首个非注释行必须是路径（如 /*），却遇到: ${raw}`);
      blocks[blocks.length - 1].headers.push(raw.trim());
    } else {
      blocks.push({ path: raw.trim(), headers: [] });
    }
  }
  const catchAll = blocks.find((b) => b.path === '/*');
  assert.ok(catchAll, '_headers 应存在 /* 块');
  for (const h of catchAll.headers) {
    assert.ok(!/^Cache-Control\b/i.test(h), `/* 块永远不得出现 Cache-Control（HTML 强缓存 = 发版后旧 HTML 配旧 js，最长一年不可自愈），实际: ${h}`);
  }
  const jsBlocks = blocks.filter((b) => b.path === '/js/*');
  assert.equal(jsBlocks.length, 1, '_headers 应恰好存在一个 /js/* 块');
  for (const b of blocks) {
    for (const h of b.headers) {
      if (/immutable/i.test(h)) {
        assert.equal(b.path, '/js/*', `immutable 只允许出现在 /js/* 块，实际出现在 ${b.path}`);
      }
    }
  }
  const cc = jsBlocks[0].headers.filter((h) => /^Cache-Control\b/i.test(h));
  assert.equal(cc.length, 1, '/js/* 块应恰好一条 Cache-Control');
  assert.match(cc[0], /^Cache-Control:\s*public,\s*max-age=31536000,\s*immutable$/i);
});
