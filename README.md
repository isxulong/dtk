# 在线答题卡 - 申论格子纸
这是一个用于模拟申论考试答题卡（格子纸）的在线工具，帮助用户在写作时进行字数统计和格式预览，特别适合备考申论考试的用户。

## 功能特点

- **实时预览**：在文本框中输入内容，实时在格子纸中显示
- **特殊格式支持**：
  - `+N+` 表示空N个格子（例如：`+5+` 表示空5格，上限500格；`+N+` 不隐含换行，仅空N格）
  - 回车键：自动换行并空2格
  - 空格键：空1格
  - Tab键：空2格
- **字数统计**：实时统计格子纸中实际占用格子数（含指令空格、行末合并格与排版空位），并标注统计口径与申论规则说明
- **字数目标设定**：可设定目标字数，超出目标时自动提醒
- **文本操作**：
  - 清除所有换行符
  - 清除所有空格
  - 清除所有`+N+`指令
  - 清空文本框
  - 撤销操作（最多10步；快速连续输入时，400ms内的变化会合并为一个撤销点）
- **一键排版**：一键规范文本格式——中英文/数字与中文的邻接空格按规则清理（`GB/T 15834`、`iOS 16` 等组合保留），首行自动识别为标题时居中留空（判不中时按普通段落处理并提示），疑似句中换行检测并提示（不自动合并）；全程同步无弹窗无延时，结果可一次 Ctrl+Z 精确撤销
- **自动输入模式**：开启/关闭实时预览
- **下载文本**：将当前文本框内容下载为TXT文件
- **导入文本**：从TXT文件导入（上限100000字符，超限自动截断并提示）
- **双击定位**：双击格子自动定位到对应输入位置
- **打印功能**：打印格子纸内容（自动隐藏无关元素），A4 适配、25列完整显示、多页内容自动分页，无横向/纵向滚动条；打印态所有标记类背景（淡底/缩进阴影等）强制置空，保证卷面纯净
- **长文本性能**：采用增量渲染与分帧渲染，实测（1 核沙箱，20261014e）：2000 字完成口径约 60ms、5000 字约 125ms，T(5000)/T(2000)≈2（线性）
- **安全加固**：XSS 防注入（纯文本写入，innerHTML 不接触用户内容）、导入长度限制、中文输入法兼容、本地存储异常降级
- **自适应布局**：支持在移动设备上使用（窄屏下提供横向滚动与提示）

## 申论占格规则（当前实现）

1. 标点默认独占一格；仅当落点恰为行首（上一行25格已满）时，才与上一行末字同格（行末合并，考试允许；按用户 2026-10-13 真机反馈移除视觉区分，格子不再有淡黄底色与提示，类名仅保留给测试/逻辑引用）。
2. 叠用标点（？！/？？/！！/？？？等组合）作为整体独占一格；仅行首落点并入上一行末字格。
3. 行首禁则：闭合类标点（。），、；：？！）》〉"』」等不出现在行首，行首落点并入上一行末字格或整组下移。
4. 行末禁则：开放类标点（《〈"'『「等）不出现在行末，行末无格时先留排版空位、整体移至下一行。
5. 破折号——与省略号……占两格且不断开，行末放不下时留排版空位整体下移。
6. 半角数字/字母两两并格（如"AB"占一格），半角点号不挤格、随数字字母口径；"1."这类序数保持并格。
7. 直引号：先按全文配对结果确定性分类开/闭；非平衡文本按上下文推断并给出可见提示（不静默）。
8. `+N+` 指令：空N格，不隐含换行。

## 项目结构（ESM 模块化，零构建）

```
index.html                 页面与交互逻辑（UI 层）
js/engine.js               排版引擎：占格计算、宽符号、禁则、合并（纯逻辑，可被 Node import）
js/punctuation-rules.js    规则表：字符集、直引号配对分类（纯逻辑，可被 Node import）
js/default-text.js         预设范文文本（含「一、」「二、」「三、」新行+2格缩进）
js/text-normalize.js       输入边界清洗：BOM/零宽/控制符/emoji 剥离（纯逻辑，可被 Node import）
js/auto-format.js          一键排版：五阶段清理流水线、标题评分与居中留空、句中换行检测（纯逻辑，可被 Node import）
test/engine.test.mjs       node:test 引擎测试套件（52 项，覆盖 J01-J13 验收用例）
test/auto-format.test.mjs  node:test 一键排版测试套件（32 项，含零丢失/幂等不变量）
test/version-sync.test.mjs node:test 版本同步与发版纪律门禁（4 项断言：全仓 ?v= 唯一且==version、modulepreload≡import 集合、HTML 范文副本===DEFAULT_TEXT、_headers 缓存纪律）
test/browser.test.mjs      浏览器端 E2E 测试（Puppeteer，内置静态服务，99 项检查，含双击定位多位置回归、F1 无视觉差异断言与白屏优化四项行为锁）
scripts/bump.mjs           版本号一键替换脚本（npm run bump -- <新版本号>，全仓 12 处 ?v= + js 头部版本注释 + package.json 一次替换）
```

- `index.html` 通过 `<script type="module">` 原生加载，仍是零构建静态托管。
- ⚠️ **不能直接双击 file:// 打开**：ES 模块受同源限制，file:// 下会静默失效；请通过 http/https 访问（如 `python3 -m http.server` 或任意静态托管）。
- js 引用带版本 query（如 `./js/engine.js?v=<版本号>`）防缓存错位：全仓**单一版本号**（12 处引用：index.html 9 处 + js/ 内 3 处），由 `npm run bump`（scripts/bump.mjs）一键批量替换，`npm run test:version-sync` 机器校验全仓 `?v=` 取值唯一且等于 package.json version。**禁止手工单改一处**。

## 测试

```bash
# 引擎单测（Node 18+）
node --test test/engine.test.mjs

# 一键排版单测（Node 18+）
node --test test/auto-format.test.mjs

# 版本同步与发版纪律门禁（Node 18+，零依赖）
node --test test/version-sync.test.mjs

# 浏览器 E2E（需系统安装 Chromium；脚本自带静态服务，无需额外依赖）
node test/browser.test.mjs

# 或一次跑全量（与 CI 同口径）
npm test
```

## 发版纪律（20261015a 起为硬性纪律，机器断言锁定）

1. **全局单版本号**：全仓 `?v=` 共 12 处（index.html 9 + js/ 3），必须等于 package.json version；只能经 `npm run bump`（scripts/bump.mjs）批量替换，**禁止手工单改一处**。`test/version-sync.test.mjs` ①② 与 `test/engine.test.mjs` #20(3) 双重锁定。
2. **js/ 历史文件永不删除、永不改名**：每个历史 `?v=` 的模块都可能被旧 HTML 引用（immutable 缓存最长一年），删除即对旧访客造成永久 404。
3. **回滚 = 前滚**：immutable 缓存不可撤销，线上回滚必须发新版本号（把引用指回旧模块内容），不得试图"撤销缓存"。
4. **HTML 永不加缓存**：`_headers` 的 `/*` 块永远不得出现 Cache-Control；immutable 只允许出现在 `/js/*` 块。HTML 一旦强缓存，用户拿到旧 HTML + 旧 js，新旧混血最长一年不可自愈。`test/version-sync.test.mjs` ④ 锁定。
5. **范文双源编辑义务**：346 字范文有两份逐字一致的副本——`index.html` 内 #input-text 的字面静态文本（服务 JS 就绪前可见）与 `js/default-text.js` 的 DEFAULT_TEXT。**改一处必须同步另一处**；HTML 副本源码内各行禁止缩进空格、首行紧跟开标签、末行紧贴 `</div>`；文本含 `<` `>` `&` 时须做实体转义（测试按反转义归一后逐字比对）。`test/version-sync.test.mjs` ③ 锁定。

## 已登记待办（P2，后续批次）

- 数字占格三档开关（默认两位一格：数字/字母并格档、全独占档、原样档）
- D9 间隔号「·」占格规则细化
- D10 省略号连用（……+……）占格处理
- F2 错误标点波浪线标注（走查19 已消除 span 嵌套隐患，为其前置）
- 复原默认文本时同步复位字号并持久化该偏好
- CSP 收紧（当前为宽松策略，待静态托管侧确认后启用严格 CSP）
- textContent-only 写入纪律固化为 lint/审查规则
- localStorage 不可用时给出可见提示（当前为 console.warn 静默降级）
- 光标竞态与初始快照进一步加固（渲染代际号已加固，输入光标路径待专项）

## 技术细节

- 纯前端实现（HTML/CSS/JavaScript），ESM 模块化、零构建、零外部依赖
- 使用CSS Grid布局实现格子纸（25列单规格）
- 计算与渲染分离、增量DOM更新与分帧渲染，保证长文本下的输入与粘贴性能
- 渲染代际号（renderGeneration）机制：任何一次重新分布都会使旧分帧渲染循环立即失效，避免竞态写格
- 使用localStorage保存用户输入（刷新页面后内容不丢失），存储异常时自动降级不影响使用
- 响应式设计，适配移动设备

## 在线体验

[点击这里体验在线答题卡](https://dtk.isxl.cn)


## 20261014 修复登记（20 条缺陷修复 · 修订后终版范围）

- 版本推进：20261013a → 20261014a/b/c/d/e（五批落地，每批全量测试后递进）
- **批1（a）**：#1 viewport meta；#2 全角括号禁则（U+FF08/09、FF5B/5D、FF5F/60 补入避头/避尾集）；#6 Ctrl+Z 接管（IME 组字期放行、栈底静默+首次提示）；#9 撤销落盘；#20(5) 英文撇号降噪
- **批2（b）**：#13+#14 `_headers` 响应头与 meta CSP（beacon 双域白名单：script-src static.cloudflareinsights.com、connect-src cloudflareinsights.com，实测所得）；#17b 空内容打印 confirm 拦截；#17c 双击定位静态说明文案（桌面 .guide / 移动端 .mobile-hint）；#17d favicon.svg + description meta；#18 复原同时复位字号
- **批3（c）**：#16 性能断言口径（t0=distributeText 入口，完成时刻=内容写入后连续两次 rAF）；#4 大文本渲染 O(N)（≤8000 格 DocumentFragment 一次性挂载；>8000 分帧兜底每帧 2000 格）。实测定位到真瓶颈为 syncUpdateGridRange 逐格 innerText 读写强制 layout 回流（O(N²)，修复前 2000 字 ~5s、5000 字 ~34s），改 textContent 后 2000 字 ~60ms、5000 字 ~125ms、比值 ≈2
- **批4（d）**：#8 findPrevContentCell 跳过指令空格（点号并入真实内容字格）；#10 合并链挤格：字号按每字符 1.1/len em 等比缩小并钉住普通格宽高（1.1em 会随字号联动缩小导致缩字追不上溢出），保证 4+ 字符合并格 scrollWidth 不溢出；新增 js/text-normalize.js：#11 BOM/零宽/CR/Tab→+2+/控制符、#12 富文本粘贴拦截、#15 导入 400KB 字节预检 + `+N+` 超限 warning + 截断不再被成功提示顶掉；#20(2) 清理块收敛为 transformInputText；#20(6) 存储不可用一次性可见提示
  - **emoji 条目按终版改口径**：不做码点化重构，统一输入边界过滤（normalizeInputText 同链剥离 U+1F000+ 表情区、ZWJ 序列、变体选择符、键帽封闭符与 BMP emoji 呈现区；保留全部 CJK、标点、数字字母与 `+N+` 指令语法；过滤后静默处理）。坐标系与引擎主循环零改动，含 emoji 输入剥离后格位/计数/双击定位与纯文本完全一致（有断言锁定）
- **批5（e）**：#7 触屏（grid-item `touch-action: manipulation` + `user-select:none`；touch/pen 长按 550ms 兜底定位、10px 移动容差、vibrate 10ms）；#19 无障碍（grid-container aria-label 改述、有内容格 `role=gridcell`、撤销按钮 `aria-keyshortcuts="Control+Z"`）；#19b 导出首次 info 提示（hint:export 单次永久静默、打印态隐藏）；#5 E2E 可移植（裸包名 import 回退链 + PUPPETEER_EXECUTABLE_PATH + which 探测链 + package.json + GitHub Actions CI）
- **撤销项（#17a 打印行间隙）：不修。** 用户实机打印件已验证完美，`@media print` 的 grid 样式保持原样、一律不碰。
- 测试基线：批5 后 52 引擎单测 + 84 E2E 断言全绿（每批全量回归零红）。

## 20261014f 新增：一键排版

- 新增 `js/auto-format.js`（纯逻辑模块）：五阶段清理流水线（ASCII 邻接空格规则，纯中文/中英混排/数字分场景，`GB/T 15834`、`iOS 16` 等组合原样保留；标题行豁免词间空格）+ 9 特征标题评分判定（宁漏判不误判，判不中回落 +2+ 并提示可双击首行格子修改）+ 疑似句中换行检测（只提示不自动合并、内容零丢失）
- 标题判定命中时按 ⌊(25−字数)/2⌋ 居中留空（clamp[2,10]），与范文标题口径一致
- UI：「一键排版」按钮置于清除族首位，空/纯空白输入禁用，busy 态 try/finally 复位；全程同步执行，无预览、无等待弹窗、无人造延时
- 撤销：一次 Ctrl+Z 精确回到排版前；零改动时提示「排版已规范，本次无需调整」且不产生撤销栈垃圾
- 不变量有单测锁定：剥离空白与 `+N+` 指令后可见字符序列逐字节一致（零丢失）；`autoFormatText` 幂等且以预设范文为不动点
- 版本推进：20261014e → 20261014f；测试基线：52 引擎单测 + 32 排版单测 + 88 E2E 断言，合计 172 条全绿（独立质检重跑一致）


## 20261015a 白屏优化（四项同批 + 缓存策略 + 发版纪律）

背景：线上真网环境下页面偶发长时间白屏（蓝方实测取证），终裁定位三类根因——ESM 串行瀑布、window.onload 门控首屏渲染、模块静态加载失败无任何兜底。本批四项必须同批发布（两两硬耦合），不可拆单。

- **①拆 onload 锁**：初始化从 `window.onload` 迁入内联 module script 求值路径（模块执行完即初始化，不等 favicon/beacon 等尾部资源）。P0 规避：保留 try/catch 包裹 init（失败必须 `showError` 可见，不静默白屏）；`Object.assign(window,…)` 前移到 init 调用之前（隐私模式 localStorage 被禁时按钮不得全死）；双 rAF 至少保留一层（无头/隐藏态 innerText 语义可能退化为 textContent，换行丢失）。
- **②modulepreload×5**：head 内为 5 个模块加 `<link rel="modulepreload">`，href 与对应 import specifier（含 `?v=`）逐字符一致——module map 按 URL 含 query 寻址，差一个字符同一模块抓两遍、preload 白做；punctuation-rules.js 的 preload 复制 engine.js 内部那条 URL。老浏览器静默忽略，等价现状瀑布。
- **③范文落 HTML + init 三态**：346 字范文以字面静态文本写入 #input-text（`white-space: pre-wrap` 原生渲染换行，不用 `<br>`），JS 就绪前用户即可见、可编辑。init 按三态裁决：**就绪前用户输入**（当前 innerText 与范文逐字不一致且非空）→ 保留、照常渲染、入撤销栈、触发保存链（防静默丢字底线，优先级最高，历史存档不覆盖本会话输入）；非空存档 → 恢复 + normalizeInputText 清洗；无存档或存档空串 → 范文。双源一致性由 test/version-sync.test.mjs ③ 机器断言。
- **④模块挂起看门狗**：独立内联**经典脚本**（非 module）放 head——静态 import 失败时整个 module script 不求值，写在模块里的兜底根本不会执行。阈值 10 秒（慢而正常的加载可达 5s+，过短误报）；提示非阻断、可关闭；重试只允许 `location.reload()`（重新初始化会挂双份监听器，一次粘贴翻倍）；就绪标志 `window.__dtkReady` 设在模块体末尾（Object.assign 与 init 之后），一到即自愈移除横幅；横幅 class 已入打印隐藏清单，打印态零污染。
- **⑤_headers 缓存策略**：新增 `/js/*` 规则 `Cache-Control: public, max-age=31536000, immutable`；`/*` 块永远不出现 Cache-Control（HTML 强缓存 = 发版后旧 HTML 配旧 js，一年不可自愈）。规则叠加以逗号拼接，`/js/*` 块只加 Cache-Control 不重复其他头。
- **⑥测试门禁**：新增 `test/version-sync.test.mjs`（node:test 零依赖，进 npm test 与 CI 两个 job）四断言：全仓 `?v=` 唯一且 == version（12 处）；modulepreload href 集合 ≡ import URL 集合；HTML 范文副本 === DEFAULT_TEXT；_headers 缓存纪律。`test/engine.test.mjs` #20(3) 同步改造（4→9 处 + package.json 对齐）。E2E 补 11 项：存档三态（含清空→刷新→范文回归）、格子出现早于 load 事件（MutationObserver 计时 + 可控挂起资源，禁实现内部计时）、就绪前输入保留（扣住模块制造就绪前窗口）、看门狗横幅出现/reload/可关闭。
- 版本推进：20261014f → 20261015a（12 处 `?v=` 机器同步）；打印相关 CSS 与 f5593f5 逐字节一致（唯一差异为隐藏清单按设计新增 `.module-timeout`）；测试基线：52 引擎单测 + 32 排版单测 + 4 version-sync 单测 + 99 E2E 断言，合计 187 条全绿。骨架屏本轮未做。
