# P2-R1b 缺陷：窗口被遮挡时无系统通知

| 项目 | 值 |
|---|---|
| 编号 | R1b-D1 |
| 日期 | 2026-10-26 23:50（Asia/Shanghai） |
| 级别 | **P1**（F9：最小化/后台提示必达） |
| 状态 | **第二版修复完成（128/128）；V13 真机待复测** |
| 关联 | V13、F9、P2-B 风险“通知依赖渲染后触发” |

## 现象

- DSH 窗口被其他窗口挡在后面（未最小化）时，任务完成：
  - Windows 通知中心**没有**记录；
  - 切回 DSH 前台后，应用内卡片存在。
- DSH 可见但未聚焦时，任务完成：**系统通知出现**。
- `Notification.permission = granted`；控制台 `new Notification('测试')` 可正常显示。

## 结论

不是权限或系统通知能力问题，而是**窗口被遮挡时插件没有发出通知**。

## 根因假设

当前通知由 `ToastHost` 渲染后的 `onRendered → notifyItems → notifier.notify` 触发，文案共享表也只在渲染时填充。窗口被其他窗口遮挡时，Chromium/Electron 的遮挡/后台节流可能暂停或延后 React 渲染：

- 遮挡期间没有渲染 → 没有 `onRendered` → 不发通知；
- 切回前台后才渲染，此时 `isPageVisible()` 为 true → `notify` 按 `auto` skip。

可见但未聚焦时页面仍渲染，所以通知正常；这与“遮挡时无通知、前台卡片存在”一致。

## 必须修复的行为

1. 窗口被遮挡/失焦时，任务完成必须发系统通知（权限 granted），不依赖 React 是否渲染。
2. 通知文案仍遵循 `工作区[会话] · 状态`，与浮层第二行一致；不得只在渲染后才可用。
3. 切回前台渲染后不得重复通知同一条。
4. 可见且聚焦时仍只显示浮层（`auto` 语义不变）。
5. 新增回归测试：模拟“未渲染但入队”仍触发通知；渲染后不重复。

## 修复方向（供开发代理选择，改动需评审）

- 在 store 入队/判定后直接触发 notifier，而不是等 `ToastHost` 渲染；
- 文案解析改为渲染无关的 resolver（`ctx.sessions.list` + 工作区快照/客户端服务），或在入队时缓存可用名称；
- 若名称暂不可得，宁可先发“未分组/未命名会话”的通知，也不能不发；渲染后不得重复；
- 保留 `tag` 去重，确保遮挡期通知与前台浮层不重复。

## 修复后复测（2026-10-26 23:50）

用户实测：完全被其他窗口遮挡时，**仍无系统通知**；切回前台**卡片存在**；控制台另有一条资源 404。

404 已定位为 `dsh-app://app/api/changes.summary?sessionId=...&seq=...`，是 DSH 内部的 changes summary 接口，不是 `task-complete-toast` 的路由，与本缺陷无直接关系；不要把它当作通知失败原因。

说明“入队即发”修复没有覆盖真实遮挡路径。剩余两个高概率原因：

1. **通知被可见性判断 skip**：遮挡时 Electron 仍上报 `visibilityState=visible` 且 `hasFocus=true`，`notifier.notify` 的 `auto` 分支不发送。
2. **入队本身被节流/冻结**：完成判定依赖 250 ms `setTimeout`；遮挡页面计时器被 Chromium 节流或冻结，`decide`/`onEnqueued` 直到前台才运行，此时页面可见又被 skip。可见未聚焦能发、遮挡不能发，与此一致。

需要一次带时间戳的诊断区分：`running:false`、`decide`、`onEnqueued`、`notify` 是否在遮挡期间执行，以及当时的 `visibilityState`/`hasFocus`/`document.hidden`。

## 第二版修复（2026-10-26 23:50）

- **前台标志**：新增 `createForegroundTracker`，用 `window.focus/blur` 维护前台标志；notifier 的可见性判断不再只信 `document.hasFocus()`。
- **后台不等 250 ms timer**：`running:false` 且不在前台时，用 `queueMicrotask` 调度 `decide`；前台保留 250 ms 合并。
- **标题不倒退**：后台 `decide` 时若 resolution 仍 pending，先等 `resolutionPromise` 完成；不会用 `completed` 顶替 `error`。
- **诊断日志**：临时 `console.debug`，事件 `status:false / settle:schedule / decide / onEnqueued / notify:*`，带时间/可见性/前台标志；复测一轮后移除。
- **用例**：D1-4（hasFocus=true 但 blur）、D1-5（timer 不触发仍通知）、D1-6（error 不降级）、D1-7（后台 pending resolution → error 保留）。
- 自动化：**128/128**（124 + 4），`node --check` 6/6；版本 1.1.0 未改。

## 第二版仍需真机确认

- 遮挡时 `status:false` 是否在遮挡期间到达（若只在回前台到达，渲染进程事件队列被冻结，客户端无解，需宿主侧方案）。
- `settle:schedule` 是否显示 `foreground:false`、`mode:microtask`。
- 是否有 `notify:deliver/delivered`；若只有 `notify:skip visible-focused`，前台标志仍误判。
- 后台 resolution pending 且 200 ms timer 被节流时，是否会导致 decide 一直等待。
- V13 通过前不得判 R1b 通过。

## 修复（2026-10-26 23:35，第一版，已证明不足）

- **入队即通知**：store 在 `decide` 入队 `publish()` 后同步回调 `env.onEnqueued(item)`；通知不再依赖 `ToastHost` 渲染。
- **渲染无关文案**：`apply` 的 `notifyEnqueuedNow` 用 `textFor(item)` 解析 `工作区[会话] · 状态`；工作区用 ToastHost 首帧缓存，会话优先缓存、缺值用 `ctx.sessions.list`；都缺时回退“未分组/未命名会话”，仍发通知。
- **去重**：`handled` 按 item key；渲染路径 `notifyItems` 只兜底，渲染后不重复。
- **可见性语义不变**：可见聚焦 → 浮层；可见未聚焦/遮挡/最小化 → 通知。
- 新增用例：R1b-D1-1（隐藏且从未 render）、R1b-D1-2（遮挡 render 前发、render 后不重复）、R1b-D1-3（名称缓存同文）。
- 自动化：124/124（原 121 + 3），`node --check` 6/6；版本 1.1.0 未改。

## 修复后仍需真机

- V13：遮挡（未最小化）→ 通知中心 1 条；切回卡片在；不重复。
- 可见未聚焦 → 通知；可见聚焦 → 仅浮层；最小化 → 通知。
- 观察后台 250 ms 节流造成的通知时延。
- 若 Electron 把遮挡上报为 `visible + hasFocus=true`，仍可能 skip；需 V13 实测确认。

## 验收（原）

- 遮挡窗口完成任务 → 通知中心出现一条；切回前台卡片仍可正常显示；
- 可见未聚焦 → 通知仍正常；
- 可见聚焦 → 仅浮层；
- 自动化新增用例全绿，121 基线不回退；
- V13 重测通过后，R1b 才能继续。
