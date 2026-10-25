# DSH「任务完成」桌面右下角提示插件 — 设计方案

| 项目 | 内容 |
|---|---|
| 文档版本 | v0.3（按 2026-10-25 第二次确认修订） |
| 日期 | 2026-10-25 |
| 目标环境 | DeepSeek Harness Desktop `0.2.1-rc.3`，Web GUI `http://127.0.0.1:55406` |
| 约束 | **只设计方案，不开发、不安装、不修改现有 profile** |
| 完成判定 | **Agent 空闲**（running → idle）即视为任务完成 |
| 提示文案 | **默认两行**：标题 + `<工作区名>[<会话窗口名>] · <Agent状态>`；例 `插件[提示弹窗] · 待执行` |
| 语言 | **跟随系统 / DSH 当前语言**（内置 zh、en；其他语言回退 en） |
| 最小化 | **必须仍能提示**：应用内浮层不可见时，改由系统通知在 Windows 右下角提示 |
| 推荐形态 | 客户端 UI 插件：`shell.overlay` 浮层 + Web Notification 系统通知 |
| 精确增强 | 可选宿主 `session/event` → `turn/end` 事件桥，用于区分失败/停止（不参与完成判定） |

**v0.2 → v0.3 变更记录**

- 确认文案使用**默认两行**格式（标题 + 明细），不再把单行作为默认。
- 语言改为**跟随系统**：恢复 `ctx.locale` 的 zh/en 字典，撤销 v0.2 的「仅中文」，提示随 DSH 当前语言切换；`locale/*.json` 仍只做插件元数据。

**v0.1 → v0.2 变更记录**

- 文案改为**仅中文**（v0.3 已撤销，改为跟随系统），新增格式 `<工作区名>[<会话窗口名>] · <Agent状态>`；默认「标题 + 明细」两行，`showTitle: false` 可输出严格单行。
- 明确「任务完成」以 **Agent 空闲**为准，不以 Goal 完成或后台 job 结束为准。
- 系统通知从「可选增强」提升为**最小化必达通道**，并补充权限拒绝后的恢复补弹。
- 新增工作区名/会话窗口名解析与回退文案。
- 移除运行时 `ctx.locale` 依赖；`locale/*.json` 仅保留插件元数据。

---

## 0. 一页速览

**一句话方案**：做一个持久化 UI 插件包 `@local/task-complete-toast`。它监听客户端已有的 `api-session/status`，在 Agent 从 running 变为空闲时判定任务完成，在 `shell.overlay` 的右下角显示提示卡：

```
任务完成
插件[提示弹窗] · 待执行
```

第一行是完成标题，第二行严格遵循新格式 `<工作区名>[<会话窗口名>] · <Agent状态>`。窗口最小化或页面不可见时，同一内容改由系统通知弹出，保证最小化后仍能收到提示。

**六个关键结论**

1. **不需要改 DSH 源码，也不需要 Electron 主进程**。运行状态、工作区名、会话名、打开会话、主题都在客户端插件可触及的范围内。
2. **不要复用 `workspace.toast`**：它的 key 域被所有者固定为 11 个 `ToastKind`，新增 key 会替换现有通知；`shell.overlay` 才是官方给 toast stack 预留的增量座位。
3. **`shell.overlay` 是 click-through 的**，提示卡必须显式 `pointer-events: auto`。
4. **完成判定只看 Agent 是否空闲**，不看 Goal 是否完成、也不等后台 job 结束；这是本次确认的明确口径。
5. **最小化提示是硬需求**：应用内浮层在最小化时不可见，必须依赖系统通知；系统通知被拒绝时，退化为「恢复窗口后补弹」。
6. **文案跟随系统**：注册 `ctx.locale` 的 `zh` / `en` 字典，跟随 DSH 当前语言（默认取系统/浏览器语言，设置可覆盖）；其他语言回退英文。

**不做什么**：不改 `app.asar`、不加 Electron IPC、不装 BurntToast/PowerShell 弹窗、不写会话日志、不在 `document.body` 挂 DOM、不轮询 `agent/status`、不新增 zh/en 之外的语言包。

---

## 1. 需求与验收

### 1.1 功能需求

| 编号 | 需求 | 说明 |
|---|---|---|
| F1 | 完成判定 | 同一会话 `running` 由 `true` 变为 `false`，经观察窗确认后视为完成 |
| F2 | 文案格式 | `工作区名[会话窗口名] · Agent状态`，如 `插件[提示弹窗] · 待执行` |
| F3 | 完成标题 | 成功显示「任务完成」；失败/停止显示对应标题（v1.1 精确，v1 尽力） |
| F4 | 位置 | 应用窗口右下角 24 px 安全边距；最小化时由系统通知落在屏幕右下角 |
| F5 | 自动消失 | 默认 5 s 淡出；悬停暂停；可手动关闭 |
| F6 | 可回溯 | 点击提示卡/系统通知可聚焦窗口并打开对应会话 |
| F7 | 多会话 | 依次完成时队列展示，最多同时 3 条 |
| F8 | 不误报 | 页面加载/重连不误报；短任务、状态抖动不重复弹 |
| F9 | 最小化仍提示 | 最小化或页面不可见时，系统通知必须触发（权限允许时） |
| F10 | 语言跟随系统 | 文案随 DSH 当前语言切换（内置 zh/en；系统语言非 zh/en 时回退 en） |

### 1.2 非功能要求

| 维度 | 要求 |
|---|---|
| 时延 | Agent 空闲到提示出现，P95 ≤ 800 ms（v1）/ ≤ 500 ms（v1.1） |
| 资源 | 事件驱动，零轮询；100 次完成不出现可观测内存增长 |
| 兼容 | 明/暗主题、125%/150% 缩放、窗口窄至 480 px 不溢出 |
| 无障碍 | `role="status"`、`aria-live="polite"`、关闭按钮有可访问名称、支持 `prefers-reduced-motion` |
| 卸载 | 禁用/卸载后浮层、计时器、通知监听全部移除 |

### 1.3 非目标（本期不做）

- 托盘气泡、任务栏闪烁、声音提示。
- 应用完全退出后的通知（页面已销毁；需宿主进程方案，见 §3 方案 C）。
- 按会话静音、免打扰时段、通知历史中心。
- 新增 zh/en 之外的语言包（其他系统语言回退英文即可）。
- 等待 Goal 完成或后台 job 结束后再提示。

### 1.4 「任务完成」的定义（已确认）

- **判定口径**：一次 **Agent running 区间**结束，即 `running: true → false`，且经过 250 ms 观察窗仍未重新 running，即视为完成。
- **不以 Goal 完成为准**：goal 还在 active、但 Agent 已空闲，也提示；反之 goal 完成但 Agent 仍 running，不提示。
- **不等后台 job**：主 Agent 空闲即提示，即使还有后台 job 在跑。这是本次确认的口径；如需等待 job，另行扩展。
- **Agent 状态文案**：完成瞬间 Agent 已空闲，本方案采用「待执行」表示空闲、等待下一条指令。示例中的 `待执行` 即此状态。
- 一次输入到彻底空闲之间可能包含多个 turn；以 running 区间为单位更贴近用户感知。

---

## 2. 现状勘察（设计依据）

### 2.1 运行形态

- 桌面端是 Electron 应用：`resources/app.asar/package.json` 的包名为 `@deepseek-ai/dsh-desktop`，`lib/main.js` 从 `electron` 引入 `BrowserWindow`、`Notification` 等。
- 页面由本机 Host 的 Web 服务提供（当前 `http://127.0.0.1:55406`），插件运行在**浏览器渲染进程**。
- 应用内浮层 = 页面固定定位元素；系统通知 = 页面调用 Web Notification。两者都不需要 Electron 主进程。

### 2.2 插件机制

- 持久化插件是 workspace 中的 bundle：`package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`，`cordis.patch.yml` 插入一行 Loader entry。
- 客户端半区是 `window.__ModuleLoader__.load({ id, factory(require) {...} })` 模块，`factory` 返回 `{ inject, apply(ctx) }`；React 由浏览器模块表提供。
- UI 通过 `ctx.slots.inject(ownerKey, () => ctx.slots.register({ name, id, order }, Component))` 注册；注册绑定 Context，插件卸载即回收。

### 2.3 渲染位置（关键）

`shell.overlay` 的官方目录描述（`Slots.listSubTree` 实测）明确写着：

> Frame-wide floating layer, above every column and outside their scroll containers. Deliberately generic and unowned by any feature: a badge, a **toast stack** or a status pill all belong here... The layer itself is **click-through** — entries opt back into pointer events.

- 类型：`list`，root scope；注册参数 `id`（必填）、`order`、`label`。
- 现居住者共 11 个，其中 `session-log-upload-toast`、`workspace.row-toast`、`plugin-manager.refresh-toast`、`schedule.delete-toast` 都是 toast 类条目，说明这是既有实践。
- 标准 props 含 `useSessions`、`useSessionStatus`、`useWorkspaces`、`useSessionRetainInfo`、`useRemoteAccess`、`useWorkspaceAccess` 等；会话与工作区数据都是官方暴露给浮层的能力。

**反例**：同层的 `workspace.toast` 是 keyed 槽，键域固定为 `{archived, archivedNotOpenable, createFailed, ... unpinFailed}`，标注「already taken」。新增 key 会替换已有通知，不复用。

### 2.4 完成信号

**客户端可直接用的信号**

- 宿主事件 `'api-session/status'(sessionId, running)`：某个 Agent 的运行状态变化。
- 客户端 `dsh-client-ui-session/lib/client.js` 已经这样消费：

```js
ctx.remote.$on("api-session/status", (sessionId, running) => {
  this.observeRunning(sessionId, running)
})
```

  它维护 `running` / `pendingInteraction` / `completionUnread`；`completionUnread` 只在非主视图会话完成时置位（`!this.isMain(sessionId)`），证明「完成提醒」已有语义基础。
- 列表基线：`ctx.sessions.list.byId[id].running` 在连接/重连时提供初始状态，避免把「加载时本来就空闲」误判为「刚刚完成」。
- 会话快照：`ctx.sessions.binding(id)?.session.getSnapshot()` 提供 `pendingSubmissions`、`lastAgentError`、`openState` 等；`binding` 只借用已存在的 generation。

**精确结果信号（只用于区分失败/停止，不改变触发时机）**

- 宿主 `'session/event'(session, event)` 的 `turn/end` 携带 `{ turn, reason }`：

| reason.kind | 含义 | 本文用途 |
|---|---|---|
| `completed` | 正常完成 | 标题 `titleCompleted` |
| `error` | LLM 失败（附 `LlmFailure`） | 标题 `titleError` |
| `max-tokens` | 达到输出上限 | 标题 `titleInterrupted` |
| `blocked` | 被策略/归档拦截 | 标题 `titleBlocked` |
| `aborted` | 取消；`reason.reason.kind` 为 `user` / `parent` / `hook` / `disposed` / `legacy` | 用户取消不提示或标题 `titleStopped` |
| `interrupted` | 被中断 | 标题 `titleInterrupted` |
| `forked` | 分叉收尾 | 不提示 |

- 上表是翻译 key；中文/英文实际文案见 §5.7，随系统语言切换。
- 对已 retain 的会话（通常是当前打开的会话），无需宿主代码也能从 `SessionBinding.eventSource` 回溯最后一条 `turn/end`，用于区分完成/取消/失败；未 retain 的后台会话仍需要 v1.1 事件桥。

### 2.5 工作区名与会话窗口名

- **工作区**：客户端 `workspaces` 服务的 `WorkspaceView` 明确包含 `workspaceId`、`path`、`title`、`sessionIds`、`createdAt`、`updatedAt`。`shell.overlay` 的标准 prop `useWorkspaces` 暴露 `WorkspaceSnapshot`，可按 `sessionIds` 反查某会话所属工作区的 `title`。
- **会话窗口名**：即会话标题。`sessions.list` 的列表行携带标题（DSH 自身对无标题行显示「未命名」）；用 `sessions.list.byId[id].title` 读取。
- **回退**：找不到工作区时显示 `fallbackWorkspace`（未分组 / Ungrouped）；找不到会话标题时显示 `fallbackSession`（未命名会话 / Untitled session）。
- **语言跟随系统**：不硬编码中文。注册 `ctx.locale` 的 `zh` / `en` 字典，组件订阅 `ctx.locale` 的语言变化后重渲染；DSH 默认按系统/浏览器语言选择，用户在设置里切换语言时提示同步切换。系统语言不在 zh/en 时回退英文。
- **为什么跟随 DSH 语言而不是直接读 `navigator.language`**：DSH 的语言选择可能来自用户设置，直接读浏览器语言会与其他界面文案不一致；跟随 `ctx.locale` 才能保证「系统默认、设置可覆盖」。

### 2.6 主题

`Theme.listTokens` 可用：`--dsw-alias-bg-overlay`、`--dsw-alias-border-l1`、`--dsw-alias-label-primary`、`--dsw-alias-label-secondary`、`--dsw-alias-state-success-primary`、`--dsw-alias-state-error-primary`、`--dsw-alias-brand-primary`。容器与控件只用 token，不写死明暗色。

### 2.7 最小化与系统通知

- 页面位于 Electron 渲染进程时，最小化会使 `document.visibilityState` 变为 `hidden`、`document.hasFocus()` 变为 false；此时应用内浮层不可见。
- Web Notification 在 Electron 中通常映射为 Windows 原生 toast；普通浏览器打开 `http://127.0.0.1` 属于安全上下文，可用但需授权。
- 因此：**最小化提示由系统通知承担**；若权限被拒绝，只能等窗口恢复后再补弹，这一点必须在验收中写清楚。
- 主进程 `lib/main.js` 虽 import 了 `Notification`，但没有证据表明它对插件暴露 IPC；本方案不依赖它。

---

## 3. 方案选型

### 3.1 候选对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 客户端浮层** | 客户端插件注册 `shell.overlay`，CSS 固定在窗口右下角 | 零宿主改动、主题一致、可点击、可测试 | 最小化/被遮挡时看不见；页面关闭即无 | ✅ v1 主体 |
| **B. 系统通知** | 页面不可见时发 Web Notification | 真正落在 Windows 右下角；最小化也能提示 | 需权限；样式不可完全自定义；Electron/浏览器差异 | ✅ **v1 必需通道** |
| C. 宿主 PowerShell/WinRT toast | 宿主插件监听 `turn/end`，`pwsh` 调 WinRT 弹 toast | 页面关闭也能提示；不依赖浏览器权限 | 每条起进程，慢且可能被拦；归属应用常显示 PowerShell；无主题/无回跳 | ⚠️ 仅当要求「关窗也提示」时评估 |
| D. Electron 主进程原生通知 | 改 `app.asar` + IPC | 最原生、可设 AUMID/图标 | **不是插件**，升级即丢；违反约束 | ❌ 否决 |
| E. 复用 `workspace.toast` | 向现有 toast 槽注册新 key | 视觉一致 | key 域固定，语义是替换；与工作区耦合 | ❌ 否决 |

### 3.2 推荐组合

**v1 = A + B**：A 负责窗口可见时的右下角浮层；B 负责最小化/页面不可见时的系统通知。B 不是可选项，而是 F9 的实现通道。

**v1.1 = 可选宿主事件桥**：宿主监听 `turn/end`，把「完成/失败/停止」的精确结果推给页面，用于把标题从「任务完成」纠正为「任务失败/任务已停止」。**它不参与完成判定**——判定仍以 Agent 空闲为准。

---

## 4. 总体架构

### 4.1 组件图

```
┌────────────────────────────── DSH Desktop (Electron) ──────────────────────────────┐
│                                                                                    │
│  Host 进程（Node）                              Renderer（Web GUI 页面）             │
│  ┌───────────────────────────┐                 ┌─────────────────────────────────┐  │
│  │ AgentLoop                 │                 │ @local/task-complete-toast      │  │
│  │  └ agent/status           │                 │  ├ TaskCompleteStore            │  │
│  │      └ api-session/status │──Remote event──▶│  │   ├ seed(list)               │  │
│  │                           │                 │  │   ├ onStatus(id, running)     │  │
│  │ [v1.1] session/event      │                 │  │   └ settle / dedupe / queue   │  │
│  │  └ turn/end.reason        │──SSE/HTTP──────▶│  ├ ToastHost (shell.overlay)    │  │
│  │                           │   (v1.1)        │  │   ├ 名称解析(工作区/会话)     │  │
│  └───────────────────────────┘                 │  │   ├ ToastCard × N            │  │
│                                                │  │   └ SystemNotifier           │  │
│                                                │  └ locale 字典 (zh/en)          │  │
│                                                └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 数据流

**v1（主链路）**

1. Agent 开始/结束 → Host 发出 `api-session/status(sessionId, running)`。
2. 客户端 `ctx.remote.$on(...)` 收到；Store 以会话 id 维护 `{running, startedAt}`。
3. `true → false` 后进入 250 ms 观察窗；期间重新 `true` 或出现待发送消息则取消。
4. 观察窗结束 → 生成 `ToastItem{sessionId, outcome, at}` → 入队。
5. 渲染层用 `useSessions` / `useWorkspaces` 解析会话名、工作区名，拼出 `工作区[会话] · 待执行`。
6. 页面可见 → 显示浮层；页面隐藏（最小化）→ 发系统通知（同一文案）。

**v1.1（精确结果）**

1. Host 插件 `ctx.on('session/event', ...)` 过滤 `turn/end`。
2. 按 `reason.kind` 映射为 `completed | error | stopped | ignored`。
3. 通过同源 SSE 广播 `{sessionId, outcome, at}`。
4. 客户端收到后修正队列中同会话条目的 `outcome`，或标记「已有权威结果」，抑制 v1 的猜测。
5. SSE 断开/未就绪时自动回落 v1。

### 4.3 职责边界

| 组件 | 负责 | 不负责 |
|---|---|---|
| TaskCompleteStore | 状态机、去重、节流、队列、可见性策略 | 名称解析、渲染 |
| ToastHost | 注册 `shell.overlay`、名称解析、系统通知 effect | 判定业务语义 |
| ToastCard | 文案格式、动画、可访问性、点击/关闭 | 状态判定 |
| SystemNotifier | 权限检测、系统通知、点击聚焦、失败补弹 | 决定「是否算完成」 |
| Host bridge（v1.1） | 权威 `turn/end` 结果 | 触发时机、UI |

---

## 5. 详细设计

### 5.1 完成判定与状态机

每个会话维护状态：

```
unknown ──seed(list)──▶ idle / running
running ──status(false)──▶ settling(250ms)
settling ──status(true)──▶ running        （任务继续，取消提示）
settling ──超时──▶ decide() ──▶ emit / suppress ──▶ idle
```

`decide()` 规则（按顺序短路）：

| # | 条件 | 动作 | 理由 |
|---|---|---|---|
| 1 | 状态来自 seed 基线、从未观察到 `running=true` | 只记录，不提示 | 防止页面加载/重连误报 |
| 2 | 会话不在 `sessions.list.byId` 中 | 忽略 | 过滤已移除/不可见会话 |
| 3 | 列表行带子代理标记（字段以实际 `SessionListRow` 为准） | 忽略 | 子代理完成不代表用户任务完成 |
| 4 | 观察窗内 `running` 又变 `true` | 取消 | Agent 继续执行（排队输入/后续 turn） |
| 5 | `binding(id)?.session.getSnapshot().pendingSubmissions.length > 0` | 取消 | 有排队消息，马上还会跑 |
| 6 | `now - startedAt < minRunMs`（默认 1500 ms） | 忽略 | 快速问答不打扰 |
| 7 | 同会话冷却期内（默认 3000 ms） | 合并/忽略 | 状态抖动去重 |
| 8 | 其他 | `outcome = 'completed'`，入队 | 正常路径 |

**边界说明**

- **完成判定只看 Agent 空闲**：Goal 是否 active、后台 job 是否仍在跑，都不影响触发。这是本次确认口径。
- **用户主动取消**：对未 retain 的后台会话，v1 无法区分，会显示「任务完成」；v1.1 用 `turn/end.reason.kind === 'aborted'` + `reason.reason.kind === 'user'` 精确抑制。
- **当前打开会话的取消（v1 可做）**：`SessionBinding` 暴露 `eventSource`（`ObservableSnapshot<SessionEventWindow>`），settle 时可回溯最后一条 `turn/end`：

```js
const win = ctx.sessions.binding(id)?.eventSource?.getSnapshot()
const last = [...(win?.entries ?? [])].reverse()
  .find((e) => e.type === 'event' && e.event.type === 'turn/end')?.event
const reason = last?.data.reason
if (reason?.kind === 'aborted' && reason.reason?.kind === 'user') return  // 用户取消，不提示
```

- **后台会话失败**：未 retain 的会话没有 `binding`，读不到 `lastAgentError`；v1 可能误标为「任务完成」，v1.1 覆盖所有会话。
- **多轮/排队输入**：running 区间覆盖连续输入；观察窗 + `pendingSubmissions` 是第二道保险。
- **子代理**：默认不提示子代理完成。
- **失败/停止标题**：v1 尽力（当前会话可从 `eventSource`/`lastAgentError` 判断）；v1.1 精确。

### 5.2 去重、节流与多会话

- **去重键**：`sessionId`；同会话在 `cooldownMs` 内只保留最新一条。
- **队列**：最多 `maxVisible = 3`；超限移除最旧（带退出动画）。
- **排序**：按完成时间升序，视觉上从下往上堆叠（最新在最下）。
- **风暴保护**：全局 `maxPerMinute = 6`；超出可合并为一条汇总卡（v1.1 可选）。
- **多标签页**：同一 profile 的两个 GUI 标签都会收到状态事件；v1 用 `BroadcastChannel('dsh-task-complete-toast')` 去重，抢到租约的页面负责弹窗与系统通知。

### 5.3 提示卡文案与视觉

**默认两行（已确认）**

中文：

```
窗口右下角（安全边距 24px）
┌──────────────────────────────────────────────┐
│  ✓   任务完成                             ×  │
│      插件[提示弹窗] · 待执行                  │
└──────────────────────────────────────────────┘
```

英文（系统/DSH 语言为 English 时）：

```
┌──────────────────────────────────────────────┐
│  ✓   Task completed                       ×  │
│      Plugins[Toast popup] · Idle             │
└──────────────────────────────────────────────┘
```

- 第一行：完成标题（`titleCompleted` / `titleError` / `titleStopped`）。
- 第二行：严格遵循新格式 `<工作区名>[<会话窗口名>] · <Agent状态>`，由 `format` 模板渲染。
- 两行都走 `ctx.locale`，语言切换时整卡即时更新。
- `showTitle: false` 可以只保留第二行（保留为可选项，默认不启用）。

**格式细则**

| 片段 | 取值 | 回退（zh / en） |
|---|---|---|
| 工作区名 | `WorkspaceView.title`（按 `sessionIds` 反查；空时取 `path` 最后一段） | 未分组 / Ungrouped |
| 会话窗口名 | `sessions.list.byId[id].title`（字段名以实际列表行类型为准） | 未命名会话 / Untitled session |
| 分隔 | 固定 `[` `]` 与 ` · `（前后各一个空格） | — |
| Agent 状态 | 见下表；完成瞬间为空闲态 | 待执行 / Idle |

**Agent 状态文案**

| 状态 | 中文 | 英文 |
|---|---|---|
| Agent 空闲、等待下一条指令 | `待执行` | `Idle` |
| Agent 正在运行 | `执行中` | `Running` |
| 等待用户回答 | `等待回答` | `Awaiting answer` |
| 等待审批 | `等待审批` | `Awaiting approval` |

**长文本**

- 工作区名、会话名超长时用省略号；整行 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`。中英文都按实际渲染宽度截断，不写死字符数。
- `title` 属性与 `aria-label` 保留完整文本，方便悬停/读屏获取。

**尺寸与样式**

| 项 | 规格 |
|---|---|
| 容器 | `position: fixed; right: 24px; bottom: 24px; display:flex; flex-direction:column; gap:8px; pointer-events:none` |
| 卡片 | `width: 360px; max-width: calc(100vw - 48px)`；`padding: 12px 14px`；`border-radius: 12px`；`pointer-events:auto` |
| 背景 | `var(--dsw-alias-bg-overlay)`；`border: 1px solid var(--dsw-alias-border-l1)` |
| 阴影 | `0 10px 30px rgba(0,0,0,.18)`（如主题提供阴影 token 则优先用 token） |
| 标题 | `13px/1.45`，`600`，`var(--dsw-alias-label-primary)` |
| 明细 | `12px/1.4`，`400`，`var(--dsw-alias-label-secondary)` |
| 成功图标 | 20 px 圆底 + 对勾，`var(--dsw-alias-state-success-primary)` |
| 失败图标 | 20 px 圆底 + 感叹号，`var(--dsw-alias-state-error-primary)` |
| 关闭按钮 | 20×20 透明按钮，悬停 `var(--dsw-alias-bg-layer-2)` |
| 动效 | 进入 `translateY(6px)→0` + `opacity 0→1`，160 ms；退出 120 ms；`prefers-reduced-motion` 只保留透明度 |

> 位置说明：应用内浮层只能相对**窗口**定位；窗口最大化时恰好落在屏幕右下角。窗口未最大化或最小化时，真正的屏幕右下角由系统通知承担。`shell.overlay` 位于所有列之上、滚动容器之外，浮层不会随对话滚动。

### 5.4 交互

| 操作 | 行为 |
|---|---|
| 点击卡片/「查看」（View） | `window.focus()`；`ctx.uiWorkspace.openSession(sessionId)`；关闭该条 |
| 点击「×」/Esc | 关闭该条，不打开会话 |
| 悬停/聚焦 | 暂停自动消失计时，离开后恢复剩余时间 |
| 页面恢复可见 | 若有「通知未送达」的排队条目，补弹一条并清空 |
| 拖拽/右键 | 不支持 |

### 5.5 系统通知（最小化必达）

**触发条件**

```text
systemNotification === 'always'
  或 (systemNotification === 'auto'
      且 (document.visibilityState !== 'visible' || document.hidden || !document.hasFocus()))
```

- `auto` 覆盖「最小化、切到其他应用、页面在后台标签」三种场景。
- 最小化时应用内浮层不可见，系统通知是唯一可见通道。

**内容**

```js
const n = new Notification(t('titleCompleted'), {
  body: '插件[提示弹窗] · 待执行',   // 当前语言的明细行，与浮层第二行完全一致
  tag: `dsh-task-${sessionId}`,      // 同会话只保留最新
  renotify: false,
  silent: false,
})
n.onclick = () => { window.focus(); ctx.uiWorkspace.openSession(sessionId); n.close() }
```

上例为中文；英文界面下标题为 `Task completed`，正文为 `Plugins[Toast popup] · Idle`。标题和正文都用 `t()` 生成，与浮层保持同一语言。

**权限与降级**

| 权限 | 行为 |
|---|---|
| `granted` | 直接发送；发送成功则不再补弹应用内浮层 |
| `default` | Electron 通常默认允许；普通浏览器在设置/首次使用引导中由用户手势申请。页面隐藏时不申请（会被静默拦截） |
| `denied` | 不发送；把该条标记为 `deferred`，窗口恢复可见时补弹应用内浮层 |

**送达与补弹**

- 发送成功：标记 `delivered`，从可见浮层队列移除；窗口恢复后不重复弹。
- 发送失败/`denied`：标记 `deferred`，放入独立于自动消失计时的补弹队列；恢复可见时补弹一条。
- 页面隐藏期间不启动/暂停自动消失计时，避免补弹条目在用户看到前就过期。

**最小化判定**

- 主信号：`document.visibilityState === 'hidden' || document.hidden`。
- 辅助：`!document.hasFocus()`（切到其他应用但窗口仍可见时也发通知，避免用户错过）。
- 监听 `visibilitychange`、`focus`、`blur`、`pagehide`；恢复可见时清理 `deferred` 队列。

**已知限制**

- 系统通知的样式、图标、应用名由 OS/Electron 决定，无法用主题 token 控制。
- Windows 专注助手、系统通知关闭、企业策略可能吞通知；这属于 OS 行为。
- 应用完全退出（renderer 销毁）后无法提示；需要方案 C，另行评估。

### 5.6 配置

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 总开关 |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | 浮层位置 |
| `maxVisible` | number | `3` | 同屏最多条数（1–5） |
| `durationMs` | number | `5000` | 自动消失时间 |
| `minRunMs` | number | `1500` | 短于该时长不提示 |
| `coalesceMs` | number | `250` | 状态稳定观察窗 |
| `cooldownMs` | number | `3000` | 同会话去重窗口 |
| `showTitle` | boolean | `true` | 是否显示第一行标题（任务完成 / Task completed）；`false` 时只保留明细行 |
| `systemNotification` | `'auto' \| 'always' \| 'never'` | `'auto'` | 最小化场景建议保持 `auto`/`always` |
| `suppressWhenFocused` | boolean | `false` | `true` 时窗口聚焦不弹浮层 |
| `maxPerMinute` | number | `6` | 风暴保护 |

**下发方式**

- **v1**：`client.js` 顶部 `DEFAULTS` 常量；改配置需改文件/重装。
- **v1.1**：宿主 `apply(ctx, config)` 读取行配置，经 `webserver/index-inject` 推入 `{ kind: 'global', name: '__DSH_TASK_COMPLETE_TOAST__', value: config }`；客户端启动读取，缺失用默认值。配置变更下次页面加载生效。

### 5.7 多语言文案（跟随系统）

运行时注册 DSH 语言服务的中英文字典：

```js
const NS = 'taskCompleteToast'
ctx.effect(
  () => ctx.locale.register(NS, { zh, en }),
  'task-complete-toast: dictionaries',
)
```

| key | 中文 | 英文 |
|---|---|---|
| `titleCompleted` | 任务完成 | Task completed |
| `titleError` | 任务失败 | Task failed |
| `titleStopped` | 任务已停止 | Task stopped |
| `titleInterrupted` | 任务已中断 | Task interrupted |
| `titleBlocked` | 任务被阻止 | Task blocked |
| `statusIdle` | 待执行 | Idle |
| `statusRunning` | 执行中 | Running |
| `statusAwaitingAnswer` | 等待回答 | Awaiting answer |
| `statusAwaitingApproval` | 等待审批 | Awaiting approval |
| `fallbackWorkspace` | 未分组 | Ungrouped |
| `fallbackSession` | 未命名会话 | Untitled session |
| `actionView` | 查看 | View |
| `actionClose` | 关闭提示 | Dismiss |
| `format` | `{workspace}[{session}] · {status}` | `{workspace}[{session}] · {status}` |

- **跟随系统的方式**：组件订阅 `ctx.locale` 的语言变化，用 `ctx.locale.bind(NS)` 取翻译函数；DSH 默认按系统/浏览器语言选择，用户在设置里切换语言时提示即时更新。
- **回退**：DSH 内置 zh/en；系统语言为其他语言时，locale 链回退到英文。
- **不在组件里写死文案**：所有可见文本（标题、状态、回退名、按钮）都走 `t(key)`。
- 插件元数据仍放在 `locale/zh.json`、`locale/en.json` 的 `meta.title` / `meta.description`，与运行时字典分开。
- 日期/时长如需显示，也走 `Intl.DateTimeFormat` 或 `t` 的占位符，不手写「分/秒」。

### 5.8 插件包结构与清单

```
task-complete-toast/
├─ package.json
├─ cordis.patch.yml
├─ index.js            # 宿主半区：v1 空实现；v1.1 turn/end + SSE
├─ client.js           # 客户端半区：store + overlay + 名称解析 + 系统通知
├─ locale/
│  ├─ zh.json          # 插件元数据（中文）
│  └─ en.json          # 插件元数据（英文）
├─ icon.svg
└─ README.md
```

**package.json（示意）**

```json
{
  "name": "@local/task-complete-toast",
  "version": "0.3.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["index.js", "client.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-ui-session",
        "@deepseek-ai/dsh-client-ui-workspace"
      ]
    }
  }
}
```

**cordis.patch.yml（示意）**

```yaml
- insert:
    - id: task-complete-toast
      name: '@local/task-complete-toast'
```

**client.js 骨架（示意，非交付代码）**

```js
window.__ModuleLoader__.load({
  id: '@local/task-complete-toast',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useSyncExternalStore } = React

    const NS = 'taskCompleteToast'
    const zh = {
      titleCompleted: '任务完成', titleError: '任务失败', titleStopped: '任务已停止',
      titleInterrupted: '任务已中断', titleBlocked: '任务被阻止',
      statusIdle: '待执行', statusRunning: '执行中',
      statusAwaitingAnswer: '等待回答', statusAwaitingApproval: '等待审批',
      fallbackWorkspace: '未分组', fallbackSession: '未命名会话',
      actionView: '查看', actionClose: '关闭提示',
      format: '{workspace}[{session}] · {status}',
    }
    const en = {
      titleCompleted: 'Task completed', titleError: 'Task failed', titleStopped: 'Task stopped',
      titleInterrupted: 'Task interrupted', titleBlocked: 'Task blocked',
      statusIdle: 'Idle', statusRunning: 'Running',
      statusAwaitingAnswer: 'Awaiting answer', statusAwaitingApproval: 'Awaiting approval',
      fallbackWorkspace: 'Ungrouped', fallbackSession: 'Untitled session',
      actionView: 'View', actionClose: 'Dismiss',
      format: '{workspace}[{session}] · {status}',
    }
    const DEFAULTS = { /* §5.6 */ }

    function createStore(ctx, config) {
      const sessions = new Map()   // id -> { running, startedAt, lastToastAt }
      let toasts = []
      const listeners = new Set()
      const timers = new Map()
      const publish = () => listeners.forEach((fn) => fn())

      const seed = () => {
        const list = ctx.sessions.list.getSnapshot()
        for (const id of list.ids) {
          const row = list.byId[id]
          if (!row || row.subagent) continue
          if (!sessions.has(id)) sessions.set(id, { running: !!row.running, startedAt: Date.now(), baseline: true })
        }
      }

      const settle = (id) => {
        const s = sessions.get(id)
        if (!s) return
        const snap = ctx.sessions.binding(id)?.session.getSnapshot()
        if (snap?.pendingSubmissions?.length) return
        if (Date.now() - s.startedAt < config.minRunMs) return
        if (Date.now() - (s.lastToastAt ?? 0) < config.cooldownMs) return
        s.lastToastAt = Date.now()

        // 尽力区分当前会话的取消/失败；未 retain 的会话交给 v1.1
        const win = ctx.sessions.binding(id)?.eventSource?.getSnapshot()
        const last = [...(win?.entries ?? [])].reverse()
          .find((e) => e.type === 'event' && e.event.type === 'turn/end')?.event
        if (last?.data.reason?.kind === 'aborted' && last.data.reason.reason?.kind === 'user') return
        const outcome = last?.data.reason?.kind === 'error' ? 'error' : 'completed'

        toasts = [...toasts, { id, outcome, at: Date.now() }].slice(-config.maxVisible)
        publish()
      }

      const onStatus = (id, running) => {
        const known = sessions.get(id)
        if (!known) { sessions.set(id, { running, startedAt: Date.now(), baseline: true }); return }
        if (running) {
          clearTimeout(timers.get(id)); timers.delete(id)
          known.running = true
          return
        }
        if (!known.running) return
        known.running = false
        timers.set(id, setTimeout(() => { timers.delete(id); settle(id) }, config.coalesceMs))
      }

      const start = () => {
        seed()
        const offStatus = ctx.remote.$on('api-session/status', onStatus)
        const offList = ctx.sessions.list.subscribe(seed)
        const offReset = ctx.on('connection/reset', () => { sessions.clear(); toasts = []; seed() })
        return () => {
          offStatus(); offList(); offReset()
          for (const t of timers.values()) clearTimeout(t)
          timers.clear()
        }
      }

      return { start, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
               get: () => toasts, dismiss: (id) => { toasts = toasts.filter((t) => t.id !== id); publish() } }
    }

    // 名称解析：按 useSessions / useWorkspaces 的实际 selector 签名取整个 snapshot
    function workspaceTitle(workspaces, sessionId) {
      for (const w of Object.values(workspaces.byId ?? {})) {
        if (w.sessionIds?.includes(sessionId)) {
          return w.title || w.path?.split(/[\\/]/).pop() || ''
        }
      }
      return ''
    }

    function createToastHost(store, ctx, config) {
      return function ToastHost(props) {
        const { useSessions, useWorkspaces } = props
        // 订阅语言切换，切换后整卡重渲染
        useSyncExternalStore(
          (fn) => ctx.locale.subscribe(fn),
          () => ctx.locale.getSnapshot(),
        )
        const t = ctx.locale.bind(NS)
        const TEXT = {
          completed: t('titleCompleted'), error: t('titleError'), stopped: t('titleStopped'),
          idle: t('statusIdle'),
          fallbackWorkspace: t('fallbackWorkspace'), fallbackSession: t('fallbackSession'),
          format: (w, s, st) => t('format', { workspace: w, session: s, status: st }),
        }
        const sessionsSnap = useSessions()
        const workspacesSnap = useWorkspaces()
        const toasts = useSyncExternalStore(store.subscribe, store.get)
        const notified = React.useRef(new Set())

        const lineOf = (item) => TEXT.format(
          workspaceTitle(workspacesSnap, item.id) || TEXT.fallbackWorkspace,
          sessionsSnap.byId?.[item.id]?.title || TEXT.fallbackSession,
          TEXT.idle,
        )
        const titleOf = (item) => item.outcome === 'completed' ? TEXT.completed
          : item.outcome === 'stopped' ? TEXT.stopped : TEXT.error

        // 最小化/页面不可见：系统通知与浮层使用同一文案
        useEffect(() => {
          if (config.systemNotification === 'never') return
          const hidden = document.visibilityState !== 'visible' || document.hidden || !document.hasFocus()
          if (!hidden) return
          for (const t of toasts) {
            if (notified.current.has(t.id)) continue
            notified.current.add(t.id)
            if (typeof Notification === 'undefined' || Notification.permission === 'denied') continue
            try {
              // Electron 下 permission 常为 default 但仍可发送；浏览器可能拒绝，失败则走 deferred
              const n = new Notification(titleOf(t), {
                body: lineOf(t), tag: `dsh-task-${t.id}`, renotify: false,
              })
              n.onclick = () => { window.focus(); ctx.uiWorkspace.openSession(t.id); n.close() }
            } catch { /* 标记 deferred，恢复可见时补弹，见 §5.5 */ }
          }
        }, [toasts, sessionsSnap, workspacesSnap])

        return h('div', { className: 'dsh-tct-root' }, toasts.map((item) => h(ToastCard, {
          key: item.id,
          title: titleOf(item),
          line: lineOf(item),
          viewLabel: t('actionView'),
          closeLabel: t('actionClose'),
          onClose: () => store.dismiss(item.id),
          onOpen: () => { window.focus(); ctx.uiWorkspace.openSession(item.id); store.dismiss(item.id) },
        })))
      }
    }

    return {
      inject: ['slots', 'sessions', 'locale', 'remote', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-complete-toast: dictionaries')
        const store = createStore(ctx, DEFAULTS)
        ctx.effect(() => store.start(), 'task-complete-toast: status')
        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: 'task-complete-toast', order: 100 },
          createToastHost(store, ctx, DEFAULTS),
        ))
      },
    }
  },
})
```

> 说明：`ToastCard`、`workspaceTitle` 的 snapshot 形状、样式注入、`BroadcastChannel` 去重、deferred 队列需在实现时补齐。`useSessions` / `useWorkspaces` 是否接受无参调用以实际 `PropsRuntime<'shell.overlay'>` 类型为准；若必须传 selector，传 `(s) => s`。系统通知已按上面的 `useEffect` 发送，确保与浮层使用同一份已解析文案。

### 5.9 生命周期、资源与性能

- **一个** `$on` 订阅、**一个** list 订阅、**一个** connection/reset 订阅；全部在 `ctx.effect` 清理函数中释放。
- 每个会话最多一个 settle 计时器；`dismiss`、`connection/reset`、插件卸载时清空。
- 不轮询 `agent/status`；v1 不订阅 `session/event`。
- 名称解析只在渲染层做一次快照映射；不遍历全部会话日志。
- 语言字典用 `ctx.effect` 注册、卸载自动移除；组件用 `useSyncExternalStore` 订阅语言切换，卸载自动退订。
- 页面隐藏时保留 WebSocket 订阅（仍能收到状态）；系统通知由渲染层 effect 发送，不依赖动画帧。
- `deferred` 补弹队列独立于可见 toast 队列，避免隐藏期间被自动消失清掉。
- 卸载时设置 `disposed` 标志，忽略仍挂起的权限回调；关闭所有 `Notification`（可选）。
- 100 次完成压测下监听器数量恒定；`BroadcastChannel` 单例复用。

### 5.10 安全与隐私

- 插件不访问文件系统、不发网络请求（v1）；v1.1 的 SSE 只读本机同源。
- 不写会话日志、不修改 Agent 行为、不注册工具。
- 系统通知只含工作区名、会话标题、状态文案；**不含模型输出、路径、工具参数**。
- 点击「查看 / View」走官方 `uiWorkspace.openSession`，不自行拼路由。
- 不在宿主侧执行 shell；方案 C 若启用需单独安全评审。

### 5.11 v1.1 精确结果桥（可选）

**目的**：只修正标题（完成/失败/停止），不改变「Agent 空闲即完成」的触发时机。

**宿主半区**

```js
export const inject = ['webServer']

export function apply(ctx) {
  const clients = new Set()

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/plugins/task-complete/events',
    handler(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
    },
  }), 'task-complete-toast: sse route')

  const broadcast = (payload) => {
    const line = `data: ${JSON.stringify(payload)}\n\n`
    for (const res of clients) res.write(line)
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const r = event.data.reason
    if (r.kind === 'completed') broadcast({ sessionId: session.id, outcome: 'completed' })
    else if (r.kind === 'error' || r.kind === 'max-tokens' || r.kind === 'blocked') {
      broadcast({ sessionId: session.id, outcome: 'error', reason: r.kind })
    } else if (r.kind === 'aborted' && r.reason?.kind !== 'user') {
      broadcast({ sessionId: session.id, outcome: 'stopped' })
    }
  }), 'task-complete-toast: turn/end')
}
```

**客户端**：`new EventSource('/plugins/task-complete/events')`；收到后按 `sessionId` 修正队列中同会话条目的 `outcome`（标题），不改完成判定。

**必须先验证**

1. **鉴权**：同源 SSE 是否能带上 DSH 连接凭据。若页面使用 URL 一次性令牌而非 Cookie，`EventSource` 可能 401；此时改 `fetch` + `ReadableStream` 手动带 token，或退回 v1。
2. **路由命名空间**：`/plugins/...` 是否与 fallback/静态资源冲突；用 `kind: 'prefix'` 或独立前缀，开发环境验证 404/401。

---

## 6. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| v1 把「用户取消」误判为完成 | 中 | 中 | 当前会话用 `eventSource` 区分；后台会话用 v1.1 |
| v1 把「后台会话报错」误判为完成 | 中 | 中 | v1.1 宿主 `turn/end`；v1 仅对可借用 binding 的会话判断 |
| 最小化时系统通知被拒绝/被吞 | 中 | 高 | 恢复窗口后补弹；设置页引导授权；Electron 默认授权需实测 |
| Electron toast 归属应用名不正确 | 低 | 低 | 实测 AUMID；不行只保留应用内浮层 |
| 工作区名/会话名取不到 | 中 | 低 | 回退「未分组」「未命名会话」；hover 显示完整文本 |
| 工作区/会话重名或过长 | 中 | 低 | 省略号 + `title` 属性；格式不拆行 |
| 两行文案被误认为「不是要求格式」 | 中 | 低 | `showTitle: false` 可输出严格单行；默认两行兼顾「任务完成」 |
| 系统语言非 zh/en 时回退英文 | 确定 | 低 | DSH 内置 zh/en；回退是预期行为，文档写明 |
| 用户设置语言覆盖系统语言 | 中 | 低 | 跟随 DSH 当前语言而非直接读 `navigator.language` |
| `ctx.remote.$on` 未来变动 | 低 | 高 | 封装 `StatusSource`；备选 `useSessionStatus`；锁版本回归 |
| 两个 GUI 标签同时弹 | 中 | 低 | `BroadcastChannel` 去重 |
| 子代理会话噪音 | 高 | 低 | 按子代理标记过滤 |
| 页面关闭后无提示 | 高 | 中 | 明确限制；需要时评估方案 C |
| 插槽组件抛错导致 overlay 空白 | 低 | 中 | 错误边界；渲染层纯函数 |
| 主题 token 改名 | 低 | 低 | 只用 `--dsw-alias-*`，降级为继承色 |

---

## 7. 测试与验收清单

| 编号 | 场景 | 期望 |
|---|---|---|
| T1 | 安装后刷新页面 | `shell.overlay` 出现 occupant `task-complete-toast`；不弹提示 |
| T2 | 5 s 任务后切到其他应用 | 完成后 ≤ 800 ms 在窗口右下角出现两行提示；5 s 后消失 |
| T3 | 文案格式 | 中文下明细行严格为 `工作区[会话] · 待执行`，示例 `插件[提示弹窗] · 待执行`；英文下为 `Workspace[Session] · Idle` |
| T4 | `showTitle: false` | 只剩明细行，且与 F2 完全一致 |
| T5 | 工作区/会话名缺失 | 显示当前语言的 `未分组`/`Ungrouped`、`未命名会话`/`Untitled session`，不出现 `undefined`/空括号 |
| T6 | 超长工作区/会话名 | 省略号截断，hover 可看全，不换行、不撑破卡片 |
| T7 | 点击提示卡 | 聚焦窗口并打开对应会话 |
| T8 | 快速问答（< 1.5 s） | 不提示 |
| T9 | 同会话连续完成（间隔 2 s） | 冷却合并，不连弹 |
| T10 | 两个会话 1 s 内先后完成 | 两条堆叠，最多 3 条 |
| T11 | 运行中重启 Host / 刷新页面 | 重连不误报；正在跑的任务结束后正常提示 |
| T12 | 用户 Stop 取消（v1 当前会话 / v1.1） | 当前会话不提示；后台会话 v1.1 不提示 |
| T13 | **最小化后完成** | 系统通知出现在 Windows 右下角，内容与浮层明细一致；点击回到会话 |
| T14 | 最小化且通知权限 denied | 不崩溃；恢复窗口后补弹应用内提示 |
| T15 | 深色/浅色、125%/150% 缩放、480 px 窄窗 | 样式正确、不溢出 |
| T16 | 减少动态效果 | 无位移，仅淡入淡出 |
| T17 | 界面语言切换为 English | 标题变 `Task completed`，明细变 `Plugins[Toast popup] · Idle` |
| T18 | 系统语言为 zh/en 之外 | 回退英文，不出现空白或 key |
| T19 | 禁用插件 | 浮层消失、无计时器、无控制台报错 |
| T20 | 100 次完成压测 | 内存/监听器稳定，无泄漏 |

**量化验收**

- 完成 → 提示 P95 ≤ 500 ms（v1.1）/ 800 ms（v1）。
- 最小化场景（权限 granted）通知到达率 100%（受 OS 专注助手影响需单独记录）。
- 文案格式检查：明细行 100% 匹配 `^.+\[.+\] · (待执行|执行中|等待回答|等待审批|Idle|Running|Awaiting answer|Awaiting approval)$`。
- 插件包体积 < 50 KB（不含图标），无新增运行时依赖。

---

## 8. 实施计划（获得批准后再开发）

| 阶段 | 内容 | 预估 |
|---|---|---|
| M1 | 客户端骨架 + `shell.overlay` 卡片 + zh/en locale 字典 | 0.5 人日 |
| M2 | 状态机 + 队列 + 去重 + 工作区/会话名称解析 | 0.5–1 人日 |
| M3 | 系统通知 + 最小化/恢复补弹 + T13/T14 实测 | 0.5–1 人日 |
| M4（可选） | v1.1 宿主 `turn/end` + SSE + 鉴权验证 | 1–2 人日 |
| M5（可选） | 通知权限引导/设置项 | 0.5 人日 |

安装方式（未来）：`plugin_manager install_bundle` 指向该 workspace 包目录；本次不执行。

---

## 9. 待确认问题

1. **「跟随系统」的口径**：本文实现为跟随 **DSH 当前语言**（默认取系统/浏览器语言，用户在设置中的选择优先）。若要求忽略 DSH 设置、固定跟随 OS 语言，请指出。
2. **失败/取消是否必须区分？** v1 只对当前打开会话较可靠；后台会话需要 v1.1，工期 +1–2 天。
3. **「会话窗口名」确认**：本文取会话标题（`sessions.list` 的 title）；如果你指的是其他窗口标题，请指出。
4. **多标签页**是否要求严格不重复？默认 `BroadcastChannel` 尽力去重。
5. **后台 job 仍在跑时也提示**是否符合预期？当前按「Agent 空闲」口径会提示；如需等待 job，另加条件。

---

## 附录 A：关键 API 速查（均经本机 inspection/源码核对）

| 能力 | API | 备注 |
|---|---|---|
| 浮层插槽 | `ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name, id, order }, C))` | list/root，click-through |
| 运行状态事件 | `ctx.remote.$on('api-session/status', (id, running) => {})` | ui-session 同款 |
| 会话列表 | `ctx.sessions.list.getSnapshot()` → `{ ids, byId, phase }`；`subscribe(fn)` | `byId[id].running`/`title` |
| 会话快照 | `ctx.sessions.binding(id)?.session.getSnapshot()` | `pendingSubmissions`、`lastAgentError` |
| 会话事件窗口 | `ctx.sessions.binding(id)?.eventSource?.getSnapshot()` | 回溯 `turn/end.reason` |
| 工作区 | `useWorkspaces` → `WorkspaceView{ workspaceId, title, sessionIds }` | 按 `sessionIds` 反查 |
| 打开会话 | `ctx.uiWorkspace.openSession(sessionId)` | 点击回跳 |
| 重连事件 | `ctx.on('connection/reset', fn)` | 重置基线 |
| 主题 | `var(--dsw-alias-bg-overlay)` 等 | 见 §2.6 |
| 语言 | `ctx.locale.register(ns, { zh, en })`；`ctx.locale.bind(ns)`；`ctx.locale.subscribe/getSnapshot` | 跟随 DSH 当前语言 |
| 系统通知 | `new Notification(title, { body, tag, ... })` | 权限见 §5.5 |
| 宿主结果桥（v1.1） | `ctx.on('session/event', ...)` → `turn/end.reason` | 只修标题 |
| 宿主 HTTP 路由 | `ctx.webServer.register({ kind, path, handler })` | 返回 disposer |
| 客户端模块 | `window.__ModuleLoader__.load({ id, factory(require) {...} })` | React 由模块表提供 |

## 附录 B：证据索引

| 结论 | 证据 |
|---|---|
| 桌面端是 Electron | `resources/app.asar/package.json`（`@deepseek-ai/dsh-desktop`）；`lib/main.js` import `BrowserWindow/Notification` |
| `shell.overlay` 是 toast 正式座位且 click-through | `cordis_inspect_query` Client `Slots.listSubTree(root: "shell.overlay")` |
| `workspace.toast` 键域固定 | 同查询 `keyDomain` + `replaceRisk: shadows-shipped-ui` |
| 客户端消费 `api-session/status` | `@deepseek-ai/dsh-client-ui-session/lib/client.js` |
| `WorkspaceView` 字段 | Client `Service.listService(workspaces)` referencedTypes |
| `turn/end` 原因枚举 | Host `Event.listEvents(session/event)` |
| 主题 token | Client `Theme.listTokens` |
| 语言 API 与回退 | `@deepseek-ai/dsh-client-locale/README.md`：`register(ns,{zh,en})`、`bind(ns)`、回退链 |
| 插件清单/安装格式 | `cordis-plugin-development` 模板与 `references/host-plugin.md` |

---

**结论**：v1 在「只做插件、不改 DSH」的约束下可落地：`shell.overlay` 负责窗口内右下角的两行提示，`api-session/status` 负责「Agent 空闲即完成」，名称解析负责新格式，Web Notification 负责最小化场景，`ctx.locale` 的 zh/en 字典负责跟随系统语言。v1.1 只用于把「任务完成」标题纠正为失败/停止，不改变触发口径。
