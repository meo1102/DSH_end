# 设计

> 约束：[`human/direction.md`](../../human/direction.md)（继承宪章 v1.0）。本文描述 **v1.2.0 发布行为（G1/G2/G3）**；**§16 是 `grow-2` 的 G4 增量（未发布）**。已知未测项见 [`验收报告 §14`](../evidence/acceptance-report-v1.2.0.md)。

本文是插件的**行为与实现契约**。改动行为前先改本文，再改代码。

## 1. 目标与非目标

**目标**：Agent 从运行变为空闲时，在 DSH 窗口右下角提示完成；窗口不可见或被遮挡时改用 Windows 系统通知；结果能区分完成/失败/中断/停止；支持 zh/en。

**非目标（当前发布契约之外）**：应用完全退出后的通知；托盘/声音；通知历史中心；动态状态行；配置面板；G3 的任意 CSS/主题引擎。G2/G3 契约见 §14/§15；已知未测项见验收报告 §14。

## 2. 完成判定

- 输入：`api-session/status(sessionId, running)`。
- `running: true → false` 后进入 **250 ms 观察窗**；窗内回弹为 `true`、或会话出现待发送消息（`pendingSubmissions`）→ 取消。
- 窗结束进入判定；判定只看 **Agent 空闲**，不看 Goal、不等后台 job。
- 基线：页面加载时列表 `phase = 'pending'` 的会话，首个 `running:false` 只记录、不提示，防止重连误报。

## 3. 判定规则（顺序短路）

| # | 条件 | 动作 |
|---|---|---|
| 1 | 从未观察到 `running=true` | 抑制 |
| 2 | 会话不在列表 `byId` | 抑制 |
| 3 | 行标记为子代理 | 抑制（尽力探测） |
| 4 | 观察窗内回弹 | 取消 |
| 5 | `pendingSubmissions.length > 0` | 抑制 |
| 6 | 运行时长 < `minRunMs`（1500 ms） | 抑制 |
| 7 | 同会话距上次提示 < `cooldownMs`（3000 ms） | 抑制 |
| 8 | 本分钟已提示 ≥ `maxPerMinute`（6） | 抑制 |
| 9 | 其他 | 入队 |

`suppressWhenFocused:true` 且窗口聚焦时，在第 9 条前额外抑制（浮层与通知都不发）。

## 4. 结果解析（结果桥）

宿主在 `session/event` 收到 `turn/end` 时记录 `{sessionId, outcome, reasonKind, cancelCause, at, seq}`（有界表：容量 `ringSize`，读时 TTL）。

客户端在观察窗起点**并发**发起解析，`since = 本轮 startedAt`：

1. **快路径**：读 `binding.eventSource` 的最后一条 `turn/end`，要求 `time >= since - 100 ms`；命中即返回。
2. **慢路径**：`GET {routePath}?sessionId=<id>`，要求响应 `at >= since - 100 ms`；200 ms 预算，每 40 ms 重试，超时/取消即 abort。
3. 预算耗尽仍无新鲜结果 → `completed`（宁可提示，不静默丢失）。
4. 结果语义：`ignored` / `suppressed` → 丢弃；其余写入 `Item.outcome` 并决定标题。

> 实测：本环境 binding 窗口可能陈旧，**宿主路由是实际生效来源**；快路径仅作兜底。

## 5. 宿主接口

`GET {routePath}?sessionId=<id>`

| 场景 | 状态 | 响应 |
|---|---|---|
| 命中 | 200 | `{sessionId, outcome, reasonKind, cancelCause, at, seq}`（`exposeReason:false` 时只留前三项与 `at`） |
| 非法/缺失 id | 400 | `{error:'invalid-session-id'}` |
| 未记录/过期 | 404 | `{error:'unknown-session'}` |
| 非 GET | 405 | `{error:'method-not-allowed'}` + `allow: GET` |

统一响应头：`content-type: application/json; charset=utf-8`、`cache-control: no-store`、`x-content-type-options: nosniff`。

`turn/end` 映射：

| reason | outcome | 是否提示 |
|---|---|---|
| `completed` | `completed` | 是 |
| `error` | `error` | 是 |
| `max-tokens` / `interrupted` | `interrupted` | 是 |
| `blocked` | `blocked` | 是 |
| `aborted` + `user` | `suppressed` | 否 |
| `aborted` + `parent/hook/disposed/legacy` | `stopped` | 是 |
| `forked` | `ignored` | 否 |

## 6. 配置下发

宿主 `Config` 经 `webserver/index-inject` 追加一行：

```text
{ kind: 'global', name: '__DSH_TASK_COMPLETE_TOAST__', value: {
  enabled, bridge: 'auto'|'off', routePath, awaiting,
  position, theme, size, durationMs, showTitle
} }
```

客户端只读这九项（ADR-009 由 ADR-019/020 扩展），其余字段用内置默认值；缺失/坏值按字段回退，不报错。

## 7. 渲染

- 位置：`shell.overlay`（frame-wide、click-through），容器 `position: fixed`，按 `data-position` 贴四角之一，距边 24 px，卡片 `pointer-events: auto`。
- 两行：标题 + `<工作区>[<会话>] · <状态>`；`showTitle:false` 只留明细（G2 提醒始终有标题）。
- 名称：工区取 `useWorkspaces` 快照的 `items[].title`（空则 `path` 末段）；会话取列表行 `displayTitle`（空则 `title`）；都缺时回退「未分组 / 未命名会话」。
- 长文本：单行省略，完整文本进 `title` 与 `aria-label`。
- 样式默认只用 `--dsw-alias-*` token；G3 显式 light/dark 额外使用 `--dsw-static-*` 做作用域调色板；阴影 `0 10px 30px rgba(0,0,0,.18)`。
- 动效：进入 160 ms、退出 120 ms；`prefers-reduced-motion` 只保留淡入淡出。

## 8. 计时（ADR-013）

出现起 `durationMs`；移入/焦点进入取消；移出/失焦**重新完整计时**；每次移出都重新起算；点击关闭/点击卡片/Esc 立即关闭。

## 9. 通知

- 触发：`always`，或 `auto` 且页面不可见/被遮挡/失焦。
- 权限：`denied` → 进 `deferred`；`default` 也**先尝试发送**（构造失败才 deferred）；`granted` 直接发。
- 内容：标题 + 与浮层第二行**逐字一致**的正文（共享文案表）；`tag = dsh-task-<hash16(item.key)>`（25 字符，避开 Windows 34 字符上限）；`renotify:false`。
- 点击：`window.focus()` → `openSession(id)` → `close()`。**平台限制（已接受）**：窗口最小化时 Electron 渲染进程的 `focus()` 不能还原窗口；需要宿主 `BrowserWindow.restore()/show()`，客户端半区够不到，因此不承诺“拉起/还原”。应用内浮层点击不受此限。
- 恢复可见：`deferred` 先重新入队浮层（新 key、重开计时），再重试通知，且只补一次。

## 10. 多标签（ADR-011 / ADR-015）

- 频道 `dsh-task-complete-toast/v1`，消息 `{v, type:'claim', sessionId, tabId, at}`。
- `tabId` 页面加载生成一次；同一 `sessionId` 在 80 ms 窗内收到的 claim 中，`tabId` 字典序最小者胜。
- 判定时若 claim 未决，**等待窗口结束**再判定（≤80 ms）；仍 pending 才按胜出降级；`lost` → 不入队、不通知。
- 无 `BroadcastChannel` → 恒胜。

## 11. 无障碍与主题

`role="status"`、`aria-live="polite"`、`aria-atomic="false"`；关闭按钮有可访问名称；Esc 关闭队列最新一条；深色/浅色跟随主题 token；缩放与窄窗不溢出。

## 12. 安全与隐私

- 路由只回枚举与时间戳，不含标题、路径、模型输出。
- 同源之外零网络；不写 localStorage/IndexedDB；不读其他插件 DOM。
- 日志只保留两处渲染失败 `console.error`，不含用户内容。

## 13. 性能预算

250 ms 观察窗 + ≤200 ms 解析（与认领窗并行）+ 渲染 ≈ **P95 ≤ 500 ms**；常驻监听：1 个状态订阅、1 个 G2 sessionStatus 订阅、1 个列表订阅、1 条路由；无轮询。

## 14. G2 授权/确认提醒（v1.2.0）

**信号**：客户端 `ctx.uiSession.sessionStatus` 的 `Map<SessionId, {running, pendingInteraction}>`。只读 `pendingInteraction` 的公开字段：

- `key`（必填，episode 唯一）
- `kind`：`approval` / `question` / `plan-review`
- `review`：存在则视为已完成问题的只读回看卡，**不提醒**（只查存在性，不读内容）

**不做**：不监听/拦截 `approval/request` 或 `user-questions/request` waterfall；不调用 `next()`；不回答、不批准、不拒绝；不读 `questions`、`toolName`、`reason`、`displayReason`。

**行为**：

1. 新的 pending `key` → 入独立提醒队列；每个 key 只入队一次。若该会话已进入（`retainedBy.mainView > 0`），卡片标记 `hidden`（不渲染遮挡卡片）；**若此时页面不可见/被遮挡，仍发系统通知**（2026-11-05 修复，W16）。
2. 提醒卡不设定时自动消失；**进入该会话、pending 解决、用户关闭**时收起。进入会话时同时关闭对应系统通知。
3. 页面不可见/被遮挡时，同时发系统通知；同一 key 的系统通知在 pending 消失或进入会话时关闭。`hidden` 条目保留到 pending 消失，用于关闭系统通知。
4. `pendingInteraction` 从状态快照消失（解决/取消/会话移除）→ 自动移除提醒并关闭系统通知。
5. 用户关闭提醒 → 本轮 pending 内不再补弹；pending 消失后抑制清除，同 key 再来可重新提醒。
6. `connection/reset` → 清空提醒队列并关闭对应系统通知；下一份状态快照重新评估。
7. 提醒卡排在完成卡之前；Esc 优先关闭最新的完成卡，没有完成卡时关闭最新提醒。

**限制**：

- 多标签：浮层由各标签各自渲染（本标签自己的 UI，不算跨标签重复）；系统通知复用 G1 的 BroadcastChannel 认领，同一 pending 只让一个标签发；认领基础设施失败时 fail-open，可能重复但不静默丢失。
- 提醒队列最多 3 条，超出时保留最新；完成队列的 `maxVisible` 不影响它。
- 可用 `notify.awaiting:false` 单独关闭 G2（不订阅 `pendingInteraction`）；总开关 `enabled:false` 仍可关闭全部。
- 未知 kind、缺 `key`、缺 `agent` 映射一律跳过，不猜。

**验收**：自动化覆盖队列增删、dismiss 抑制、kind 映射、畸形快照、review 跳过、deferred 不 requeue、**会话内 + 页面隐藏仍发系统通知（W16/W17）**；真机 2026-11-05 通过：授权弹窗 → 最小化 → Windows 通知出现 → 拒绝后消失（E2，无截图）。

## 15. G3 弹窗样式自定义（v1.2.0）

宿主 `Config.appearance`：

| 字段 | 默认 | 允许值 | 说明 |
|---|---|---|---|
| `position` | `bottom-right` | `top-left` / `top-right` / `bottom-left` / `bottom-right` | 四角；容器 `data-position` |
| `theme` | `system` | `system` / `light` / `dark` | `system` 跟随 DSH；显式值只作用于弹窗 |
| `size` | `standard` | `compact` / `standard` | 卡片宽度/内边距/字号 |
| `durationMs` | `5000` | 2000–15000 | **只影响完成卡**；G2 提醒不受影响 |
| `showTitle` | `true` | boolean | 完成卡标题；G2 提醒始终显示标题 |

**下发**：`buildClientConfig` 把 `appearance` 扁平投影为 `position/theme/size/durationMs/showTitle`；客户端 `CONFIG_GUARDS` 再按枚举/范围校验，坏值整字段忽略。宿主 `Config` 是单一真源（ADR-006/009）。

**主题**：`system` 继续使用 `--dsw-alias-*`；`light`/`dark` 通过容器 `data-theme` + DSH `--dsw-static-*` token 构造**作用域**调色板（不改全局主题、不调用 `theme.setTheme`、不写死颜色）。`color-scheme` 同步设置，保证滚动条/表单控件与弹窗一致。

**位置/尺寸**：容器 `data-position` 控制四角（top/bottom + left/right）；`data-size="compact"` 把宽度压到 300px、缩小内边距与字号。窄窗仍受 `max-width: calc(100vw - 48px)` 保护。

**非目标**：任意 CSS/HTML 注入、全局主题切换、配置面板、动画曲线自定义。设置面板需另行过门禁。

**验收**：宿主配置默认/枚举/范围/未知键；投影值；客户端坏值回落；容器属性四角/主题/尺寸；真机需重启宿主（host 半区改动）+ 刷新客户端，逐一目视四角/明暗/尺寸/时长/标题开关。

## 16. G4 外观设置与实时预览（grow-2，未发布）

**目标**：在不开放任意 CSS 的前提下，让人类在插件设置页调整字号、卡片宽度、背景色、文字色，并即时预览；字体固定跟随系统/DSH 正文字体。

### 16.1 配置字段（`Config.appearance` 增量）

| 字段 | 默认 | 允许值 | 说明 |
|---|---|---|---|
| `fontSize` | `12` | 12–18 整数 | 明细行字号；标题 = +1；compact 下明细 = −1 |
| `cardWidth` | `null` | `null` 或 280–480 整数 | `null` 跟随 `size` 预设（compact 300 / standard 360）；**最小宽度随字号联动** `max(280, fontSize×18)` |
| `backgroundColor` | `null` | `null` 或 `#RRGGBB` | `null` 跟随主题 token；自定义色与 `textColor` 同时存在时对比度必须 ≥4.5:1 |
| `textColor` | `null` | `null` 或 `#RRGGBB` | 同上；同时作用于标题、明细、关闭按钮 |
| 字体 | 不可配 | — | `font-family: inherit`；跟随系统/DSH 正文，设置页只读展示 |

- 校验：越界/非法格式/未知键拒绝；`cardWidth < max(280, fontSize×18)` 拒绝（手写 patch 同样生效）；颜色对比度不足拒绝保存。
- 兼容：`position/theme/size/durationMs/showTitle` 语义不变；新字段缺省即当前观感。

### 16.2 设置页

- 注册：`settings.plugins.tab`，`id: task-complete-toast`，`order: 100`，`label` 用本地化 thunk。
- 控件：字体只读行；字号滑杆 12–18；卡片宽度滑杆（下限随字号联动）；背景/文字颜色选择器 + “跟随主题”；恢复默认/应用；状态提示。
- 预览：设置页内复用正式卡片样式（`.dtt-preview` 取消 fixed/动画），改动即刷新。
- 文案：zh/en 双语文案在 `client.js` 的 locale 字典；新增键纳入 W02 测试。

### 16.3 持久化（A 方案）

- 客户端 `POST /dsh-task-complete/settings`，body 为白名单补丁。
- 宿主 `index.js` 用 `ctx.get('configEditor')` 找到 entry，`edit(entry, change)` 深度合并 `appearance`，由 Loader 校验/持久化并应用。
- 保存成功：客户端运行时 `appearanceStore` 立即更新（toast 即时换样式）；刷新/重启后从 Config 读取。
- 保存失败：可见错误，不静默；`configEditor` 不可用时提示，不写 localStorage。

### 16.4 安全与边界

- 颜色只接受 `#RRGGBB`，字号/宽度只接受整数范围；**不拼接任意 CSS**。
- 字体不可选，避免任意字体/字体注入。
- 对比度守卫：自定义背景+文字色同时存在时 <4.5:1 拒绝；单色时由真机/预览复核。
- 不做：主题市场、字体上传、任意 CSS/脚本、外部资源、localStorage。

### 16.5 验收（grow-2）

- 单测：配置边界、联动、颜色格式/对比度、补丁白名单、A 方案 `configEditor.edit` 合并、设置页渲染。
- 真机：设置页可打开；12/18 px、280/480 px、联动、颜色/对比度、保存后刷新仍生效；截图。
- **未真机前不得声明“设置可用”**；E2 目视不得写成 E1。
