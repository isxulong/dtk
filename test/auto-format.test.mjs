/**
 * auto-format.test.mjs —— 一键排版流水线验收用例（node:test）
 * 运行：node --test test/auto-format.test.mjs
 * 锁定两条不变量：零内容丢失（剥离空白与指令后可见字符逐字节一致）、幂等。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoFormatText, scoreTitle, titlePadFor } from '../js/auto-format.js';
import { DEFAULT_TEXT } from '../js/default-text.js';

const BODY = '时代的浪潮奔涌向前，每一朵浪花都承载着无数奋斗者的梦想与汗水。站在新的历史节点上，我们既是见证者，更是参与者。';
const BODY2 = '奋斗是青春最亮丽的底色。古往今来，无数先辈以奋斗诠释生命的价值，在攻坚克难中彰显青年担当。';

/** 不变量比对：剥离全部空白（含全角/NBSP）与 +N+ 指令后的可见字符序列 */
function visibleChars(t) {
  return t.replace(/\+\d+\+/g, '').replace(/[\s\u3000\u00A0]/g, '');
}
function assertNoContentLoss(before, after) {
  assert.equal(visibleChars(after), visibleChars(before), '可见字符序列必须逐字节一致');
}

// ---------- S1 行级空白清理 ----------

test('S1 行尾空白（半角/全角/NBSP）删除', () => {
  const { text, stats } = autoFormatText('第一段正文。 　\u00A0\n' + BODY);
  assert.ok(!/[ \u3000\u00A0]\n/.test(text), '行尾不得残留空白');
  assertNoContentLoss('第一段正文。 　\u00A0\n' + BODY, text);
});

test('S1 行首全角空格缩进（　　）转 +2+ 指令', () => {
  const { text, stats } = autoFormatText('\u3000\u3000' + BODY);
  assert.ok(text.startsWith('+2+'), '行首全角缩进应转为 +2+');
  assert.equal(stats.indent, 1);
});

test('S1 行内：CJK 之间空格删除（广大 青年 → 广大青年）', () => {
  const { text, stats } = autoFormatText('广大 青年' + '要' + BODY.slice(0, 40) + '\n' + BODY2);
  assert.ok(text.includes('广大青年'), 'CJK 之间空格应删除');
  assert.equal(stats.spaces, 1);
});

test('S1 行内：数字与中文之间空格删除（2026 年 → 2026年）', () => {
  const { text } = autoFormatText('到 2026 年实现目标，任务艰巨而光荣，需要我们共同努力奋斗。');
  assert.ok(text.includes('2026年'), text);
  assert.ok(!text.includes(' 年'), '数字与中文之间不留空格');
});

test('S1 行内：两侧均 ASCII 的空格保留（GB/T 15834、iOS 16 不动）', () => {
  const input = '按照 GB/T 15834 标准和 iOS 16 规范执行，这是一项长期而艰巨的系统工程任务。';
  const { text } = autoFormatText(input);
  assert.ok(text.includes('GB/T 15834'), 'ASCII 内部空格必须保留');
  assert.ok(text.includes('iOS 16'), 'ASCII 内部空格必须保留');
  assert.ok(!text.includes('和 iOS'), '中英之间空格应删除');
});

test('S1 行内：ASCII 间多个连续空格折叠为单个（hello  world → hello world）', () => {
  const { text, stats } = autoFormatText('使用 hello  world 一词的语境需要审查，这句话本身足够长可以成为一个段落。');
  assert.ok(text.includes('hello world'), 'ASCII 间空白折叠为单空格');
  assert.ok(!text.includes('  '), '不得残留连续空格');
  assert.equal(stats.spaces, 3, '「使用 hello」删 + 「hello  world」折叠 + 「world 一词」删');
});

test('S1 行内：全角空格按同口径删除（壮丽篇章， 让 / 甲　乙）', () => {
  const { text } = autoFormatText('壮丽篇章， 让青春绽放，这是一段足够长的正文段落用来通过测试。\n甲\u3000乙是一段正文，同样需要足够长度来构成第二个段落进行验证。');
  assert.ok(text.includes('篇章，让'), '全角标点旁空格删除');
  assert.ok(text.includes('甲\u3000乙') === false, '行内全角空格删除');
  assert.ok(text.includes('甲乙'), '行内全角空格删除后字符合并');
});

// ---------- S2 段落结构整理 ----------

test('S2 连续空行折叠为单换行、文末空白行去除', () => {
  const input = BODY + '\n\n\n' + BODY2 + '\n\n';
  const { text, stats } = autoFormatText(input);
  assert.ok(!text.includes('\n\n'), '不得残留连续换行');
  assert.ok(!text.endsWith('\n'), '文末空白行去除');
  assert.equal(stats.blankLines, 4, '3 个段间空行 + 文末 2 个空行中的折叠计数');
  assertNoContentLoss(input, text);
});

test('S2 文首空白行同样去除', () => {
  const { text } = autoFormatText('\n\n' + BODY);
  assert.ok(text.startsWith('+2+'), '文首空白行去除后首段直接补指令');
});

// ---------- S3 +N+ 注入 ----------

test('S3 段首无指令的正文段统一补 +2+', () => {
  const { text, stats } = autoFormatText(BODY + '\n' + BODY2);
  const lines = text.split('\n');
  assert.ok(lines.every((l) => l.startsWith('+2+')), '每段段首都应有 +2+');
  assert.equal(stats.indent, 2);
  assert.equal(stats.title, 'uncertain', '首段带句读长文不得判为标题');
});

test('S3 段首已有 +N+ 的段不动（含 N≠2 的用户自定义布局）', () => {
  const input = '+5+手排标题\n+2+' + BODY;
  const { text, stats } = autoFormatText(input);
  assert.equal(text, input, '已有指令的段落零改动');
  assert.equal(stats.indent, 0);
  assert.equal(stats.title, 'none');
});

test('S3 段中部 +N+ 不动（表内留空等合法指令）', () => {
  const input = BODY.slice(0, 30) + '+3+' + BODY.slice(30) + '\n' + BODY2;
  const { text } = autoFormatText(input);
  assert.ok(text.includes('+3+'), '段中部指令保留');
});

// ---------- S4 标题判定 ----------

test('S4 干净短首行判为标题并按公式居中（以奋斗之姿 赴时代之约 → +7+）', () => {
  const input = '以奋斗之姿 赴时代之约\n' + BODY;
  const { text, stats } = autoFormatText(input);
  assert.ok(text.startsWith('+7+以奋斗之姿 赴时代之约'), '有效 11 格 → ⌊(25−11)/2⌋=7');
  assert.equal(stats.title, 'detected');
  assert.equal(stats.titlePad, 7);
  assert.ok(stats.titleScore >= stats.titleThreshold, '置信度：分数达到阈值');
});

test('S4 标题行内空格豁免清理（词间节奏空格保留）', () => {
  const input = '以奋斗之姿 赴时代之约\n' + BODY;
  const { text, stats } = autoFormatText(input);
  assert.ok(text.includes('以奋斗之姿 赴时代之约'), '标题内部空格不删');
  assert.equal(stats.spaces, 0);
});

test('S4 标题居中格数 clamp 到 [2,10]', () => {
  assert.equal(titlePadFor(11), 7);
  assert.equal(titlePadFor(4), 10, '⌊(25−4)/2⌋=10，不越上限');
  assert.equal(titlePadFor(2), 10, 'clamp 上限 10');
  assert.equal(titlePadFor(20), 2, '⌊(25−20)/2⌋=2');
  assert.equal(titlePadFor(21), 2, 'clamp 下限 2');
});

test('S4 对抗：枚举小标题开头（一、加强党的建设）不得判为标题', () => {
  const input = '一、加强党的建设\n' + BODY;
  const { text, stats } = autoFormatText(input);
  assert.ok(text.startsWith('+2+'), '枚举头回落 +2+');
  assert.equal(stats.title, 'uncertain');
});

test('S4 对抗：对仗段首句（带逗号句号）不得判为标题', () => {
  const input = '民惟邦本，本固邦宁。\n' + BODY;
  const { stats } = autoFormatText(input);
  assert.equal(stats.title, 'uncertain');
});

test('S4 对抗：伪标题带句号不得判为标题', () => {
  const input = '我们要坚持改革。\n' + BODY;
  const { stats } = autoFormatText(input);
  assert.equal(stats.title, 'uncertain');
});

test('S4 对抗：31 字长标题漏判回落 +2+（宁漏判不误判的可接受代价）', () => {
  const longTitle = '以高质量发展统揽全局奋力谱写中国式现代化建设新篇章'; // 25 字
  const input = longTitle + '\n' + BODY;
  const { text, stats } = autoFormatText(input);
  assert.equal(stats.title, 'uncertain');
  assert.ok(text.startsWith('+2+'));
});

test('S4 对抗：首段引语名句开头（带引号逗号）不得判为标题', () => {
  const input = '"自信人生二百年，会当水击三千里。"\n' + BODY;
  const { stats } = autoFormatText(input);
  assert.equal(stats.title, 'uncertain');
});

test('S4 单段文本（无第 2 段）不得判为标题', () => {
  const { stats, text } = autoFormatText('乡村振兴');
  assert.equal(stats.title, 'uncertain');
  assert.equal(text, '+2+乡村振兴');
});

test('S4 首段已有 +N+ 指令：跳过判定（尊重用户显式布局）', () => {
  const r = scoreTitle('+6+以奋斗之姿 赴时代之约', [BODY], false);
  assert.equal(r.verdict, 'none');
});

// ---------- 不变量与基准 ----------

test('基准：预设范文零改动（不破坏已排好文本的契约）', () => {
  const { text, stats } = autoFormatText(DEFAULT_TEXT);
  assert.equal(text, DEFAULT_TEXT, 'autoFormatText(DEFAULT_TEXT) 必须逐字节等于 DEFAULT_TEXT');
  assert.equal(stats.indent, 0);
  assert.equal(stats.spaces, 0);
  assert.equal(stats.blankLines, 0);
});

test('幂等：脏文本二次执行输出逐字节不变', () => {
  const dirty = '以奋斗之姿 赴时代之约  \n\n\u3000\u3000时代的 浪潮奔涌向前， 每一朵浪花都 承载着梦想。站在新的 历史节点上，我们既是 见证者，更是参与者与建设者。\n\n\n' +
    '按照 GB/T 15834 标准和 iOS 16 规范执行，到 2026 年实现目标，这是一项长期而艰巨的系统工程任务。\n\n';
  const once = autoFormatText(dirty);
  const twice = autoFormatText(once.text);
  assert.equal(twice.text, once.text, '二次执行输出必须逐字节不变');
});

test('幂等：预设范文剥离指令后重排，再排不变', () => {
  const stripped = DEFAULT_TEXT.replace(/\+\d+\+/g, '');
  const once = autoFormatText(stripped);
  const twice = autoFormatText(once.text);
  assert.equal(twice.text, once.text);
});

test('零内容丢失：混合脏样本处理前后可见字符逐字节一致', () => {
  const samples = [
    '广大 青年要坚定 理想信念，在 2026 年的 春天里书写 壮丽篇章， 让青春绽放光芒。',
    '\u3000\u3000按照 GB/T 15834 标准和 iOS 16 规范执行。\n\n\n第二段正文 内容，带有 若干杂 空格。\n\n',
    '以奋斗之姿 赴时代之约\n' + BODY,
    '一、加强党的建设\n' + BODY + '\n\n\n',
    'hello  world 与中文 混排的 极端 sample 文本，需要足够的长度来构成一个完整的正文段落。'
  ];
  for (const s of samples) {
    const { text } = autoFormatText(s);
    assertNoContentLoss(s, text);
  }
});

test('空输入与纯空白输入安全返回', () => {
  assert.equal(autoFormatText('').text, '');
  assert.equal(autoFormatText('   \n\u3000\u3000\n  ').text, '', '纯空白折叠为空');
  const { stats } = autoFormatText('');
  assert.equal(stats.title, 'none');
});

test('CRLF 与 Tab 经归一化前置处理', () => {
  const { text } = autoFormatText(BODY.slice(0, 30) + '\r\n' + BODY2);
  assert.ok(!text.includes('\r'), 'CR 不得残留');
});

test('stats 分类计数齐全且正确', () => {
  const input = '标题两个字\n\n\u3000\u3000广大 青年' + BODY.slice(0, 40) + '\n' + BODY2 + '\n\n';
  const { stats } = autoFormatText(input);
  assert.equal(stats.title, 'detected', '「标题两个字」无句读 5 字应判中');
  assert.equal(stats.titlePad, 10, '⌊(25−5)/2⌋=10');
  assert.equal(stats.indent, 2, '两个正文段补 +2+');
  assert.equal(stats.spaces, 1, '一处 CJK 间空格');
  assert.equal(stats.blankLines, 3, '段间 1 + 文末 2');
  assert.equal(typeof stats.titleScore, 'number');
  assert.equal(stats.titleMaxScore, 13);
  assert.equal(stats.titleThreshold, 10);
});


// ---------- 口径#5：PDF 句中硬换行只检测提示、不做合并 ----------

test('hardBreaks：PDF 拆行样本检出，行内容不合并', () => {
  const pdf = '时代的浪潮奔涌向前，每一朵浪花都承载着无数奋斗者的\n梦想与汗水，站在新的历史节点上继续前行。\n奋斗是青春最亮丽的底色，古往今来无数先辈\n以奋斗诠释生命的价值。';
  const { text, stats } = autoFormatText(pdf);
  assert.equal(stats.hardBreaks, 2, '第 1、3 行行尾无终止符，各计 1 处');
  assert.ok(text.split('\n').length >= 4, '拆行不做合并，行数保持');
  assertNoContentLoss(pdf, text);
});

test('hardBreaks：DEFAULT_TEXT 各段均以终止符收尾，检出 0 处', () => {
  assert.equal(autoFormatText(DEFAULT_TEXT).stats.hardBreaks, 0);
});

test('hardBreaks：判为标题的首行豁免，仅统计正文拆行', () => {
  const { stats } = autoFormatText('以奋斗之姿 赴时代之约\n\n时代的浪潮奔涌向前，每一朵浪花\n都承载着梦想。');
  assert.equal(stats.title, 'detected');
  assert.equal(stats.hardBreaks, 1, '标题行不计；正文第 1 段拆行计 1 处');
});
