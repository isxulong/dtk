#!/usr/bin/env node
/**
 * bump.mjs —— 全仓版本号一键替换（scripts/bump.mjs）
 * 用法：node scripts/bump.mjs <新版本号>   （或 npm run bump -- <新版本号>）
 *
 * 白屏优化配套纪律（20261015a 起）：全仓单一版本号，共 12 处 `?v=` 引用
 * （index.html 9 处：5 条 modulepreload + 4 条 import；js/ 内 3 处：
 * engine.js 1 处 + auto-format.js 2 处）。本脚本一次替换全部，test/version-sync.test.mjs ①
 * 机器校验「全仓 ?v= 取值唯一且 == package.json version」。
 *
 * 覆盖范围：
 *   1. index.html 与 js/*.js 中所有 `?v=<旧版本号>` → `?v=<新版本号>`
 *      （预期恰好 12 处，≠12 时告警——多/少都说明引用结构被人手工改动过，
 *        需人工核对后再提交）
 *   2. js/*.js 头部注释 `版本：<旧版本号>` → `版本：<新版本号>`
 *   3. package.json 的 version 字段
 *
 * 注意：README 与测试文件中的版本无关占位写法（`?v=<版本号>`）不在替换范围。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_COUNT = 12; // index.html 9 + js/ 3；与 version-sync 测试口径一致

const newVersion = process.argv[2];
if (!newVersion || !/^[0-9]{8}[a-z]$/.test(newVersion)) {
  console.error('用法: node scripts/bump.mjs <新版本号>（格式如 20261015a）');
  process.exit(1);
}

const pkgPath = join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
if (oldVersion === newVersion) {
  console.error(`新版本号 ${newVersion} 与当前版本号相同，无需 bump。`);
  process.exit(1);
}

const targets = [join(ROOT, 'index.html')];
for (const name of readdirSync(join(ROOT, 'js'))) {
  if (name.endsWith('.js')) { targets.push(join(ROOT, 'js', name)); }
}

let total = 0;
const perFile = [];
for (const file of targets) {
  const src = readFileSync(file, 'utf8');
  const needle = `?v=${oldVersion}`;
  const count = src.split(needle).length - 1;
  if (count > 0) {
    const versionCommentCount = src.split(`版本：${oldVersion}`).length - 1;
    let out = src.split(needle).join(`?v=${newVersion}`);
    out = out.split(`版本：${oldVersion}`).join(`版本：${newVersion}`);
    writeFileSync(file, out);
    perFile.push(`${file}: ?v= ×${count}, 版本注释 ×${versionCommentCount}`);
    total += count;
  } else {
    perFile.push(`${file}: 0 处（仅 ?v= 引用计数；版本注释见下）`);
    const versionCommentCount = src.split(`版本：${oldVersion}`).length - 1;
    if (versionCommentCount > 0) {
      const out = src.split(`版本：${oldVersion}`).join(`版本：${newVersion}`);
      writeFileSync(file, out);
      perFile[perFile.length - 1] += `, 版本注释 ×${versionCommentCount}`;
    }
  }
}

pkg.version = newVersion;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`bump ${oldVersion} → ${newVersion}`);
for (const line of perFile) { console.log(`  ${line}`); }
console.log(`package.json: version → ${newVersion}`);
if (total !== EXPECTED_COUNT) {
  console.warn(`⚠️ 全仓 ?v= 替换共 ${total} 处，预期 ${EXPECTED_COUNT} 处——引用结构可能有手工改动，请核对 test/version-sync.test.mjs 的断言口径后再提交。`);
}
console.log(`完成。请运行 npm test 验证 version-sync 断言全绿后再提交。`);
