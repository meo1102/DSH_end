# WP3 开发记录 — 客户端渲染层

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | 开发方案 §6.5、§5.3 视觉与 a11y 规格、§10.2 的 U15–U17 |
| 时间 | 2026-10-26 16:25（Asia/Shanghai） |
| 状态 | 渲染层与单测完成；补遗 A1–A5 已补；**未接线真实 store、未重启、未在页面观察** |
| 测试结果 | WP3 初版 42/42；补遗后 S7/I18/U11/F6/D4 共 46/46；含 WP4 N10 的全量 56/56（见 WP4 报告） |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/client.js` | 590（WP3 初版；WP4 后 905） | 新增 `formatLine`/`titleOf`/`resolveNames`、`ToastHost`/`ToastCard`/错误边界/内联 CSS；`apply` 创建空 store 但**不 start()** |
| `task-complete-toast/test/format.test.js` | 134 | U15–U17 + `titleOf` + 模板兜底 |
| `task-complete-toast/test/smoke.test.js` | 205 | S4 增加纯函数断言；S5 从「返回 null」改为「可渲染」 |
| `task-complete-toast/test/harness.js` | 360 | 新增最小 React 测试运行时；factory 的 `require('react')` 桩 |
| `task-complete-toast/README.md` | 95 | 更新为 WP3 阶段、目录、测试命令与限制 |

未改动：`index.js`、`lib/*.js`、`package.json`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、profile、`app.asar`。

行数按 `[System.IO.File]::ReadAllLines().Length` 统计，不把末尾换行算成额外一行。

## 2. U15–U17 用例表

| 编号 | 输入 | 期望 | 断言点 |
|---|---|---|---|
| U15 | `formatLine(tZh, '插件', 'Toast 弹窗', '待执行')`、`formatLine(tEn, 'Plugins', 'Toast popup', 'Idle')` | 中英文严格匹配 `{workspace}[{session}] · {status}` | `插件[Toast 弹窗] · 待执行`、`Plugins[Toast popup] · Idle`；并用 §2.1 的正则复核 |
| U16 | 工作区/会话缺失：`undefined`、`''`、`'   '` | 落到 `fallbackWorkspace` / `fallbackSession` | 中文 `未分组[未命名会话] · 待执行`；英文 `Ungrouped[Untitled session] · Idle`；`resolveNames(null,null,id)` 返回两个 `undefined` |
| U16b | 工作区快照为 `byId`、数组、仅 path；会话仅有/无 title | 名称解析正确，缺字段返回 `undefined` | `title` 优先、`path` 取末段、`sessionIds` 匹配、数组快照可用 |
| U17 | 400 个字符的工作区/会话名 | 返回完整文本，不截断 | 输出包含完整 400 字；不含 `…`；长度 > 400 |
| 附加 | `titleOf` 六种 outcome；`t` 返回模板占位符/恒等函数 | 标题映射与格式化兜底 | completed/error/stopped/interrupted/blocked、未知→completed；`{workspace}` 等占位符可替换 |

## 3. 视觉规格与 §5.3 逐项对照

| 规格 | 落地 | 状态 |
|---|---|---|
| 容器 `position:fixed; bottom:24px; flex column; gap:8px; pointer-events:none` | `TOAST_CSS` `.dtt-container` | ✅ |
| `bottom-right` → `right:24px`；`bottom-left` → `left:24px` | `data-position` 属性 + CSS | ✅ |
| 卡片 `width:360px; max-width:calc(100vw - 48px); padding:12px 14px; radius:12px; pointer-events:auto` | `.dtt-card` | ✅ |
| 背景/描边 `--dsw-alias-bg-overlay` / `--dsw-alias-border-l1` | 同上 | ✅ |
| 标题 `13px/1.45/600` + `--dsw-alias-label-primary` | `.dtt-title` | ✅ |
| 明细 `12px/1.4/400` + `--dsw-alias-label-secondary` | `.dtt-line` | ✅ |
| 状态色 success / error | `completed` → `--dsw-alias-state-success-primary`；`error` → `--dsw-alias-state-error-primary` | ✅（其余 outcome 用默认明细色） |
| 两行；`showTitle:false` 只留明细 | `ToastCard` 条件渲染 | ✅ |
| 单行 `nowrap + ellipsis`；完整文本进 `title`/`aria-label` | CSS + 元素属性 | ✅ |
| 进入 `translateY(6px)→0` + 淡入 160ms | `@keyframes dtt-in` | ✅ |
| 退出 120ms | 关闭按钮先加 `dtt-card-out`，120ms 后 `dismiss` | ✅（Esc/外部 dismiss 立即移除，见限制） |
| `prefers-reduced-motion` 只保留透明度 | `@media (prefers-reduced-motion: reduce)` | ✅ |
| 容器 `role=status`、`aria-live=polite` | `ToastHost` 容器属性 | ✅ |
| `aria-atomic=false` | 同上（§9.4） | ✅ |
| 关闭按钮有可访问名称 | `aria-label=t('actionClose')`，可见 `×` | ✅ |
| Esc 关闭 | `window` keydown effect；关队列最新 `items[last]`；ADR-010 裁定，§6.5 改为「最新一条（视觉最下）」 | ✅ |
| 每卡错误边界 | `ToastErrorBoundary extends React.Component`，失败返回 `null` 并 `console.error` | ✅ |
| 自动消失 `durationMs` | `createDismissTimer` + `ToastCard` effect，默认 5000ms | ✅ |
| 悬停/聚焦/页面隐藏暂停，恢复剩余时间 | `pauseFor('hover'/'focus'/'hidden')` / `resumeFor` 驱动可注入计时器 | ✅（纯计时器已测，真实 DOM/visibility 未验） |
| 成功/失败图标 20px 圆底 | `dtt-icon-success` / `dtt-icon-error` + `✓`/`!` | ✅ |
| 卡片阴影 | `0 10px 30px rgba(0,0,0,.18)`（§5.3 明文） | ✅ |
| 关闭按钮 20×20 命中区 | `width:20px; height:20px; padding:0` | ✅ |
| Esc 关闭 | 关闭队列最新 `items[last]`；ADR-010 裁定，§6.5 改为「最新一条（视觉最下）」 | ✅ |

> 视觉尺寸、字号、token 均按 §5.3 写入；未在真实页面观察主题、缩放、窄窗与深浅色。

## 4. A11y 清单

- [x] 容器 `role="status"`、`aria-live="polite"`、`aria-atomic="false"`
- [x] 关闭按钮原生 `<button type="button">`，`aria-label` 可访问名称
- [x] 卡片不抢焦点；关闭按钮可 Tab 到达
- [x] Esc 关闭队列最新一条（视觉“最上”口径见 §10）
- [x] 长文本单行省略；完整文本进入 `title` 与 `aria-label`
- [x] 只用 `--dsw-alias-*` token
- [x] `prefers-reduced-motion` 分支存在
- [ ] 实际对比度、125%/150% 缩放、480px 窄窗、深浅色未在页面验证
- [ ] 屏幕阅读器实际播报未验证（live region 结构已按规格）

## 5. 测试变更

### 5.1 S5（契约推进，非放宽）

- WP2：`registration.component()` 必须返回 `null`。
- WP3：`apply` 注册 `BoundToastHost`；S5 断言：
  - 注册项仍为 `{name:'shell.overlay', id:'task-complete-toast', order:100}`；
  - 组件是函数，传空 store 可渲染；
  - 传 1 条 item 时可渲染容器/卡片：`role=status`、`aria-live=polite`、`data-position=bottom-right`、内联 `<style>` 含 `--dsw-alias-bg-overlay`、`prefers-reduced-motion` 与阴影、20px 成功图标、两行文本与关闭按钮 `aria-label`。
- 理由：WP3 的交付物是渲染层，S5 必须从「空占位」推进到「可渲染」；这不是放宽断言，而是替换旧契约。

### 5.2 S4

S4 增加对 `formatLine`/`titleOf`/`resolveNames` 的函数断言；`__test__` 键仍被严格检查，不改变 WP2 的放宽范围。

## 6. 测试命令与原始统计

工作目录：`D:\DSH\DSH_end\插件\开发\task-complete-toast`

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js
```

```text
✔ U15 formatLine：中英文严格匹配 {workspace}[{session}] · {status} (1.2024ms)
✔ U16 缺工作区/会话名落回退文案 (0.6327ms)
✔ U16b resolveNames：byId/数组/path 末段/会话 title (0.1942ms)
✔ U17 超长名称返回完整文本，不截断（截断交给 CSS） (0.162ms)
✔ titleOf：§7.5 映射与未知 outcome 回 completed (0.1266ms)
✔ formatLine：模板占位符与缺省 t 的兜底 (0.0982ms)
✔ I01 turn/end(completed) 写入后 GET → 200 且字段/头齐全 (0.7152ms)
✔ I02 未知会话 GET → 404 unknown-session (0.1523ms)
✔ I03 sessionId 缺失/空/超长/控制字符 → 400；非 GET → 405 (0.2228ms)
✔ I04 error 与 max-tokens 分别映射 error / interrupted (0.2197ms)
✔ I05 aborted 的 5 种 cause 与 forked 映射正确 (0.4158ms)
✔ I06 index-inject 默认投影只有 enabled/bridge/routePath (0.1492ms)
✔ I06b enabled:false 只注册注入行，bridge 投影为 off (0.0913ms)
✔ I07 TTL 过期后 GET → 404 且表项被清除 (0.1046ms)
✔ I08 表满 257 条淘汰最旧，容量保持 256 (0.2181ms)
✔ I09 Config：undefined/空对象得到全套默认值 (0.0831ms)
✔ I10 Config：数值/路径越界被拒，边界值通过 (0.2234ms)
✔ I11 Config：类型错误被拒（含 enum） (0.1525ms)
✔ I12 Config：未知键忽略且不进入归一化结果 (0.1173ms)
✔ I13 parsePatch 支持 config 缩进映射 (0.7114ms)
✔ I14 dispose 后监听与路由全部移除，注入行不再产出 (0.1984ms)
✔ I15 exposeReason:false 只回 sessionId/outcome/at (0.1251ms)
✔ I16 自定义 routePath/routeKind 透传并生效 (0.149ms)
✔ I17 blocked 与 interrupted 映射 (0.1227ms)
✔ S1 清单：名称、版本、私有、ESM 与四个导出齐全 (0.3058ms)
✔ S2 清单：dsh.bundle.patch 与 dsh.client(web/immediately/空 inject) (0.0768ms)
✔ S3 patch：insert 恰好一行宿主 entry 且 id/name 正确 (0.3309ms)
✔ S4 客户端：factory 返回 inject/apply，并暴露 __test__（ADR-007） (0.6635ms)
✔ S5 客户端：apply 不抛错，注册一项，组件为函数且可渲染 (1.1445ms)
✔ S6 资源：locale 只含 meta，icon 为合法且不超 256 KiB 的 SVG (0.4782ms)
✔ S7 宿主：导出 apply/inject 与 Standard Schema Config，调用不抛错 (0.3284ms)
✔ U01 phase=pending 的首个 status(false) 只记基线，不弹 (0.7322ms)
✔ U02 status(true) → 2s → status(false)，250ms 后入队 (0.1252ms)
✔ U03 运行 800ms 后结束被 minRunMs 抑制 (0.083ms)
✔ U04 观察窗内回弹 status(true) 取消，不入队 (0.1268ms)
✔ U05 pendingSubmissions 非空时抑制 (0.1261ms)
✔ U06 同会话两次完成间隔 2s，冷却合并只留一条 (0.1215ms)
✔ U07 4 条同时有效时最多 3 条，最旧被移除 (0.1752ms)
✔ U08 一分钟内 10 次完成，第 7 次起抑制 (0.1872ms)
✔ U09 会话不在 byId 时抑制 (0.0767ms)
✔ U10 byId 行带 subagent 标记时抑制（V-2 未证实） (0.0771ms)
✔ U11 reset 清空状态/队列/计时器并重新基线 (0.1338ms)
ℹ tests 42
ℹ suites 0
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 33.2469
EXITCODE=0
START=2026-10-26 16:25:20 +08:00
END=2026-10-26 16:25:20 +08:00
```

| 套件 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| S（smoke） | 7 | 0 | 0 |
| I（integration） | 18 | 0 | 0 |
| U（store） | 11 | 0 | 0 |
| F（format） | 6 | 0 | 0 |
| 初版合计 | **42** | **0** | **0** |

> 补遗新增 D01–D04 后为 46/46；含 WP4 N01–N10 的全量 56/56 与最新原始输出见 `WP4-开发记录.md`。

## 7. 测试桩说明

- `test/harness.js` 新增 `createFakeReact()`：只实现 `createElement`、`Component`、`useState`、`useRef`、`useEffect`、`useSyncExternalStore` 等本组件用到的符号，让 `ToastHost` 能在无 DOM 的 Node 测试里执行。
- 它**不 mock 被测逻辑**：名称解析、格式、标题映射仍调用真实实现；也不替代真实 React 的调度与 DOM 渲染。
- `loadClientModule` 的 `require` 桩只放行 `'react'`，其他模块仍抛错；factory 仍保持单文件、无打包依赖。

## 8. 未覆盖与风险

| 项 | 说明 |
|---|---|
| 真实 React/DOM 渲染 | 未在页面验证；`useSyncExternalStore` 的真实订阅、卸载、错误边界行为未观察 |
| 主题 token 真实值 | 当前只用 §5.3 列出的 6 个 token；主题实际值、深浅色未验证 |
| 名称快照 | `useWorkspaces`/`useSessions` 的真实形状（V-3）未证实；已兼容数组/byId/path/sessionIds |
| 状态文案 | 第二行固定 `statusIdle`；真实会话状态在 WP5/WP6 接入 |
| locale | `t` 默认恒等函数，页面会显示 key；字典注册 WP6 |
| 自动消失 | 已实现 `durationMs`；真实 DOM/React 计时未验 |
| 悬停/聚焦暂停 | 计时器逻辑已实现并单测；真实鼠标/焦点事件未验 |
| Esc 退出动画 | Esc 直接 `dismiss`，无 120ms 退出；关闭按钮有 |
| Esc 语义 | ADR-010：关闭队列最新；§6.5 已改为「最新一条（视觉最下）」 |
| 关闭按钮退出动画 | 依赖 `window.setTimeout`，未在真实页面/减少动效下观察 |
| 错误边界 | 代码存在，但未在真实 React 中制造抛错验证 |
| 关闭按钮焦点/对比度/缩放 | 未做页面级验证 |
| `ToastHost` 的 `props.store` 覆盖 | 为 S5 测试保留；真实 slot props 不提供 store，走 apply 的空实例 |

## 9. 下一步

1. **WP4 通知与补弹**：复用 store 队列；不要改变判定顺序。
2. **WP5 结果桥**：把 `outcome` 从 `pending` 替换为解析结果，并接真实状态文案。
3. **WP6 真实接线**：`apply` 用真实 env 创建并 `start()` store；注册 locale 字典、读取 ADR-009 配置；补 `useWorkspaces`/`useSessions` 的真实快照。
4. 页面验证：主题、深浅色、125%/150%、480px 窄窗、关闭/ESC、`prefers-reduced-motion`、错误边界与 live region。
5. 按 ADR-010 保持 Esc 关闭队列最新；§6.5 已改为「最新一条（视觉最下）」，无需反转渲染。

## 10. WP3 补遗（A1–A5）

| # | 补遗 | 落地 | 证据 |
|---|---|---|---|
| A1 | 自动消失 `durationMs`；悬停/聚焦暂停，离开按剩余时间恢复；计时器可注入 | `createDismissTimer(env, duration, onExpire)`，`ToastCard` 用 `timers`/`durationMs` props，`pauseFor('hover'|'focus')` / `resumeFor` | D01 到期、D02 暂停/恢复剩余、D03 dispose、D04 start 前无操作 |
| A2 | 成功/失败图标 20px 圆底 + 对勾/感叹号 | `dtt-icon-success`/`dtt-icon-error`，背景用 state token，字号 13/700 | S5 断言 20px 图标结构、class 与 `✓` |
| A3 | 卡片阴影 `0 10px 30px rgba(0,0,0,.18)` | `.dtt-card { box-shadow: ... }`（§5.3 明文 rgba，无字面色） | S5 断言 CSS 含阴影 |
| A4 | 关闭按钮 20×20 命中区 | `.dtt-close { width:20px; height:20px; padding:0; }` | S5 断言 class；尺寸在 CSS 中 |
| A5 | Esc 关闭视觉最上/队列最新 | 改为 `items[items.length - 1]` | ADR-010 已裁定 |

**A5 裁定（ADR-010）**：ADR-010 已确认按「队列最新」实现；§6.5 措辞改为「最新一条（视觉最下）」。无需反转渲染顺序，代码保持不变。

补遗测试命令（完整 56 条）见 `WP4-开发记录.md`；本节新增 D01–D04，全部使用假计时器，无 sleep。

## 11. 声明

渲染层代码与单测完成；**未启动真实 store、未重启、未在页面观察**。本记录不包含可用性结论。
