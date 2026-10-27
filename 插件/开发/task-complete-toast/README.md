# @local/task-complete-toast

> **P0 环境状态（2026-10-26 21:10）**：已在 `desktop` profile 安装并启用，`shell.overlay` 的 `task-complete-toast` 为 `active: true`；Config 目录中为 `unsupported`。以 [`../../P0-接手基线与环境对齐.md`](../../P0-接手基线与环境对齐.md) 为准；P1 裁决见 [`../../P1-设计裁决与验收基线.md`](../../P1-设计裁决与验收基线.md)，P2-B 实现见 [`../../P2-B-实现报告.md`](../../P2-B-实现报告.md)。

DSH「任务完成」提示插件 `1.1.0` 的开发中包。客户端半区已完整落地：**WP1 宿主、WP2 Store、WP3 渲染、WP4 通知、WP5 结果桥、WP6a 真实接线、WP6b 通知接线 + D1–D4 + 点击回跳/开关/名称行**；P2 代码开发完成（R2 + ADR-013 + R1b-D1 两版修复），自动化 **128/128** + 语法检查 6/6；真机 V13/V21/V28 未验证，当前 GUI 页面需刷新后才加载新行为。

## 用途

为后续版本提供宿主结果记录、客户端 Store、浮层渲染、结果桥、真实数据接线与系统通知；R2 多标签与 ADR-013 离场计时已实现；R1b-D1（遮挡无通知）第二版修复，自动化 128/128；真机 V13/V21/V28 待验证。界面已在真实页面弹出过一次（两行/悬停），其余未逐条观察。

## 当前阶段：P2 代码完成（R2 + ADR-013 + R1b-D1，128/128）

包含：

- 包清单 `package.json`（`dsh.bundle.patch` + `dsh.client`，导出 `.`、`./client`、`./locale/*.json`、`./icon`）
- `cordis.patch.yml`：只 `insert` 一行宿主 entry
- 宿主 `index.js`：`inject: ['webServer']`、`Config`（零依赖 Standard Schema）、有界结果表、`GET` 结果路由、`webserver/index-inject` 配置行；全部由 `ctx.effect` 持有
- `lib/config.js`：配置默认值/范围校验、`buildClientConfig` 投影
- `lib/outcome-table.js`：按 `sessionId` 覆盖写、容量上限、读时惰性 TTL
- `lib/classify.js`：`turn/end` 原因到 `outcome/reasonKind/cancelCause` 的映射
- `lib/host.js`：`sessionId` 校验、JSON 响应、路由处理器、事件到表项的转换
- 客户端 `client.js`：`window.__ModuleLoader__.load` + `inject: ['slots', 'locale', 'sessions', 'remote', 'uiWorkspace']`，向 `shell.overlay` 注册 `ToastHost`（`id: 'task-complete-toast'`, `order: 100`）
- 客户端 Store（内联在 `client.js`，经 `__test__` 暴露）：基线、运行/观察窗状态、回弹取消、`pendingSubmissions`、`minRunMs`、`cooldownMs`、`maxPerMinute`、`maxVisible`、`suppressWhenFocused`、`requeue`、`reset`；Item 为 `{key, sessionId, at, outcome}`，outcome 由 resolver 写入
- 渲染层：`ToastHost` 订阅 store 与 locale，渲染固定定位容器 + 两行卡片 + 内联 `<style>`；含自动消失（ADR-013 已实现：移入/焦点取消，移出/失焦后重新完整 5 s；刷新页面后生效）、成功/失败图标、阴影、20×20 关闭命中区、每卡错误边界、Esc（队列最新）、`role=status`/`aria-live=polite`、单行省略 + `title`/`aria-label`、点击卡片回跳并 dismiss、关闭按钮阻止冒泡
- 纯函数：`formatLine` / `titleOf` / `resolveNames` / `createDismissTimer` / `createNotifier`，经 `__test__` 暴露
- 通知：权限（granted/denied/default）、可见性触发、deferred 补弹（先 requeue 浮层再重试）、点击 focus+openSession+close、`issued` 随关闭清理、`dispose`；已接 apply
- 结果桥：`createResolver`（绑定快路径、路由慢路径、200 ms 预算 + AbortController、404/超时/网络错/非法 JSON → `completed`/`fallback`、`bridge:'off'` 不拉取），内联 `classify` 与 `lib/classify.js` 一致；已接 store 判定
- 真实接线（WP6a/6b）：`apply` 读取 `__DSH_TASK_COMPLETE_TOAST__`（逐字段类型校验）、注册 zh/en 运行时字典并订阅 locale 快照、用 `ctx.sessions` / `ctx.remote` / `window` 构造真实 env、`store.start()`、`connection/reset` 清空；settling 起点并发解析，回弹/卸载/降级时 abort；通知正文与浮层第二行经共享文案表同源
- `locale/zh.json`、`locale/en.json`：仅 `meta.title` / `meta.description`（运行时文案在 `client.js`）
- `icon.svg`：自制图标
- `test/`：`node:test` 冒烟 / 集成 / Store / 格式化 / 计时 / 通知 / 结果桥 / 接线 / 呈现测试（不随包发布）

当前代码已完成：R2 多标签认领、ADR-013 离场计时；尚未真机验证：V21/V28、R1b 全量手测、R3 安装/禁用/移除取证。

## 装后可见现象（预期）

- 界面是否出现浮层取决于真实会话状态：已 `store.start()` 并订阅 `api-session/status`，但没有在页面观察过。
- 若队列有 item，会渲染固定定位的两行卡片；`showTitle:false` 只留明细行；点击卡片回跳会话，关闭按钮只关闭。
- 页面隐藏时 `auto` 会尝试系统通知（`default` 权限也先尝试构造）；恢复可见时补弹浮层并重试通知。
- `suppressWhenFocused:true` 且窗口聚焦时，该次完成既不进浮层也不发通知。
- 宿主注册一条 `GET /dsh-task-complete/outcome?sessionId=<id>` 路由；命中时返回 `{sessionId, outcome, reasonKind, cancelCause, at, seq}`。
- 每次 index 渲染会追加一行 `{kind:'global', name:'__DSH_TASK_COMPLETE_TOAST__', value:{enabled, bridge, routePath}}`。
- 宿主 `enabled:false` 时只保留注入行；客户端 `enabled:false` 时完全不启动（无 store/overlay/通知）。

> 以上为设计预期；宿主 JS 改动需要重启宿主后生效，尚未在重启后的页面上验证。

## 目录

```text
task-complete-toast/
├─ package.json
├─ cordis.patch.yml
├─ index.js
├─ client.js
├─ lib/
│  ├─ config.js
│  ├─ outcome-table.js
│  ├─ classify.js
│  └─ host.js
├─ locale/
│  ├─ zh.json
│  └─ en.json
├─ icon.svg
├─ README.md
└─ test/
   ├─ harness.js
   ├─ smoke.test.js
   ├─ integration.test.js
   ├─ store.test.js
   ├─ format.test.js
   ├─ dismiss.test.js
   ├─ notifier.test.js
   ├─ resolver.test.js
   ├─ wiring.test.js
   └─ presentation.test.js
```

## 本地测试

在本包目录执行：

```powershell
node --test
```

若在 DSH 的受限沙箱内运行，Node 默认的按文件子进程隔离会因管道限制报 `spawn EPERM`（退出码 1）。此时改用单进程模式：

```powershell
node --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js
```

测试用 `node:vm` 捕获客户端 factory，用伪宿主 `ctx`/`req`/`res` 覆盖路由与事件装配；不 mock 被测业务逻辑。

## 已知限制

- 宿主改动尚未重启验证；当前已安装（`desktop` profile），替换包需重启；未在重启后的页面逐项复验。
- 渲染层仅在真实页面观察过两行与悬停；主题 token、窄窗、缩放、深浅色、真实 React 渲染、ADR-013 计时与自动消失仍为未逐项验证。
- R2 多标签认领已实现（ADR-011）：真机 V21 双标签未验；若 `window.BroadcastChannel` 不可用则按单标签恒胜。
- ADR-013 已实现：V28 真机悬停/移出未验；`:hover` 初始判断与 React `focus/blur` 的 `relatedTarget` 无 DOM 级单测。
- 当前 GUI 页面需再次刷新以加载 R1b-D1 第二版修复；刷新前仍是旧客户端。
- R1b-D1 第二版：前台标志 + 后台微任务 decide；遮挡下仍可能受 blur 未触发/事件冻结影响，V13 待复测。
- 文案已改为 zh/en 运行时字典并跟随 `ctx.locale`；语言切换的真实重渲染未在页面观察。
- 状态行固定「待执行」（`statusIdle`）：P1 裁决 v1.1 按设计固定（完成瞬间 Agent 空闲），动态状态留 v1.2；不列为缺陷。
- 点击系统通知只会 `openSession` 打开会话，**不会激活/置前 Electron 窗口**（Electron + Windows AUMID 限制；V07 线上记录）。
- `Notification.permission` 在 Electron 实测恒为 `granted`；`denied → deferred` 路径仅由单测覆盖，真机 V14 挂账。
- 真实路由、真实 `fetch`、200 ms 预算与外部取消只在单测夹具下验证，未在页面请求真实路由。
- Esc 按 WP3 补遗关闭“队列最新”一条；当前渲染顺序仍按 §6.5“最新在下”，因此像素最上是最旧，两者在旧文案中存在冲突（见报告）。
- 通知已接 apply，但真实 OS 通知、权限弹窗、Electron 的 `default` 权限行为、点击回跳与 `onclose` 均未在页面观察。
- 名称解析依赖插槽 props 的 `useWorkspaces` / `useSessions`；真机已证实 `useWorkspaces` 的 selector 必填（现传模块级 `IDENTITY`），`useSessions` 同时兼容两种签名；快照形状仍待页面验证。
- 真机首次验收曾因 `useWorkspaces()` 无参调用崩溃；已改为 `useWorkspaces(IDENTITY)` / `useSessions(IDENTITY)`，并在插槽组件外层加宿主级错误边界；修复后尚未刷新复验。
- 真机第二次验收发现真实 `window` 没有 `now`；`createDismissTimer` / `ToastHost` / `createStore` 已统一给 `now`/计时器做可调用回落与 `this` 绑定，待第三次刷新复验。
- 点击卡片回跳调用 `ctx.uiWorkspace.openSession(id)`；真实会话/窗口行为未验证。
- `suppressWhenFocused` 用 `document.hasFocus()` 判断；真实失焦/聚焦切换未在页面观察。
- 客户端 Store 已接真实 `api-session/status` / `connection/reset`（单测夹具验证），真实事件流未在页面观察。
- 子代理过滤是尽力探测（`subagent` / `isSubagent` / `origin` / `kind` / `header.origin`）；V-2 未证实，拿不到标记就不过滤。
- `Config` 是手写 Standard Schema（ADR-008）；Config 目录为 `unsupported`，P1 接受为已知限制；仅 `enabled`/`bridge`/`routePath` 可经 patch（ADR-009），其余为客户端默认值；V27 验证。
- `client.js` 的 `inject` 为 `['slots', 'locale', 'sessions', 'remote', 'uiWorkspace']`（C05 五项齐）。
