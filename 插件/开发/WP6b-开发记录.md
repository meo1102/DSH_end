# WP6b 开发记录 — 通知接线 + D1–D4 + 三个功能缺口

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | notifier 接 apply；D1–D4；卡片点击回跳、`enabled:false`、名称/状态行；客户端半区至此完整 |
| 时间 | 2026-10-26 17:36（Asia/Shanghai）；真机修复 §12/§13 追加于 17:36 |
| 状态 | 代码与 P01–P12 单测完成；真机两次失败已修复（§12 selector、§13 timers）；**未重启宿主复验、未观察真实页面/OS 通知** |
| 测试结果 | S 7/7、I 18/18、U 11/11、F 6/6、D 4/4、N 10/10、R 27/27、W 11/11、P 15/15，共 **109/109** 通过，0 失败 0 跳过（exit 0） |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/client.js` | 1557 | notifier 接 apply、文案共享表、D1–D4、卡片点击、enabled 短路、uiWorkspace、名称 props 透传、IDENTITY、宿主错误边界、timers 归一化与 now 回落 |
| `task-complete-toast/test/presentation.test.js` | 680 | 新增 P01–P12（含 P04 三个子测试，共 15 条） |
| `task-complete-toast/test/harness.js` | 537 | 假 ctx 补 `uiWorkspace`、`slotProps`、`remoteListenerCount`；新增错误边界渲染模拟 |
| `task-complete-toast/test/notifier.test.js` | 255 | **N05/N06 期望按 D1 更新**（原断言固定了缺陷行为） |
| `task-complete-toast/test/smoke.test.js` | 217 | **S4 的 inject 期望再加 `uiWorkspace`**；S5 改走错误边界渲染辅助 |
| `task-complete-toast/README.md` | 109 | 阶段、能力、命令、限制同步 WP6b 与两次真机修复 |
| `task-complete-toast/index.js`、`lib/*` | 不变 | 未改 |
| `package.json`、`cordis.patch.yml`、`locale/*`、`icon.svg` | 不变 | 未改 |

行数按 `[System.IO.File]::ReadAllLines().Length` 统计。

## 2. apply 装配顺序（client.js:1455–1538）

| 序 | 动作 |
|---:|---|
| 1 | 读注入配置；`enabled === false` 立即 `return`（B8，不建 resolver/store/notifier/overlay） |
| 2 | `createResolver`；注册 zh/en 字典；`t = ctx.locale.bind(NS)` |
| 3 | 创建 store + 真实 env（含 `isFocused`）；`store.start()`；`connection/reset → reset` |
| 4 | 建 `texts`（文案共享表）与 `handled`（通知去重）；建 notifier（document/Notification/openSession/hasUserActivation/texts/requeue） |
| 5 | `ctx.effect(() => () => notifier.dispose())` |
| 6 | 向 `shell.overlay` 注册组件；组件拿到真实 store/config/t/locale/texts/onRendered/openSession |
| 7 | `inject` 为 `['slots','locale','sessions','remote','uiWorkspace']` |

## 3. 通知与浮层「文案同源」方案

### 3.1 设计

- `apply` 创建 `texts: Map<itemKey, {title, line}>`，作为浮层与通知之间唯一的文案来源。
- `ToastHost` 每次渲染每张卡片时：
  1. 按当前 `useWorkspaces`/`useSessions` 快照解析 `title` 与 `line`；
  2. `texts.set(item.key, {title, line})`；
  3. 清掉已离开队列的 key；
  4. 调用 apply 注入的 `onRendered(items)`。
- `onRendered → notifyItems(items)` 只对「共享表已有文案且尚未通知过」的 key 调一次 `notifier.notify(item)`；`handled` 去重，并随队列清空回收。
- `createNotifier` 的 `textOf(item)` 优先读 `texts.get(item.key)`，回落条目自带 `title/line`；`enrich` 把文案固化到条目上，保证 deferred 条目在共享表清理后仍用同一份文案重试。

### 3.2 为什么这样排

- 名称来自插槽 props 的 `useWorkspaces`/`useSessions`，只有 React 渲染时有；notifier 无法独立解析出与浮层一致的结果。
- 因此通知必须等 `ToastHost` 渲染、文案进表后再发；`onRendered` 是「渲染完成」钩子。React 对 `useSyncExternalStore` 的 store 变化会触发隐藏页面的重渲染（前提见 §10）。
- 通知发出的是 `texts` 里的同一份 `{title,line}`，P01 逐字比较正文与浮层第二行、标题与浮层标题。

### 3.3 已知取舍

- `onRendered` 在渲染函数内同步调用 notifier（严格说属于渲染期副作用）。用 `handled` + 共享表写入完成作为前置保证幂等；若该次渲染被 React 丢弃，条目仍在 store 中，后续渲染会再次触发。
- 该设计依赖「隐藏页面仍会渲染 overlay」。这与任务给定前提一致；真实后台节流未在页面观察（§10）。

## 4. D1–D4 逐条修复证据

| 缺陷 | 修法 | 代码 | 证据 |
|---|---|---|---|
| D1（P1） | `permission='default'` 不再拦截发送：直接 `deliver`；只有 `new Notification` 抛错才 deferred。发送成功且页面可见 + 有手势时，再异步 `requestPermission` 作为升级路径 | `send` 1363–1387；`deliver` 1335–1361 | P04（无手势仍构造；构造抛错 deferred；可见+手势发送后申请）；N05/N06 期望已按新行为更新 |
| D2（P2） | store `decide` 在入队前检查：`suppressWhenFocused===true && env.isFocused()===true` → `finish()`，不更新冷却、不入队；因此浮层与通知都不会发生 | `decide` 446–449；`createClientEnv` 增加 `isFocused`（`window.document.hasFocus()`） | P03：队列 0、通知 0 |
| D3（P3） | `issued` 在 `onclose`、点击关闭、`closeNotification`、`dispose` 时移除；新增 `issuedCount()` 便于验证 | `deliver` 的 `onclose`/点击（1345–1356）；`closeNotification` 1326–1333；`dispose` 1433、1446 | P09：onclose → 0；点击 → 0；dispose → 0 |
| D4（P2） | `onVisible` 对每条 deferred 先 `env.requeue(item)` 再重试通知；`store.requeue` 换新 key、刷新 `at`、重新 publish，卡片重新挂载并重开计时器（apply 侧把新 key 记入 `handled`，避免重复通知） | `store.requeue` 580–596；`onVisible` 1396–1417；apply `requeue` 1491–1498 | P05：恢复可见后队列条目 key 变化、`at === clock.now()` 且大于旧值 |

## 5. 三个功能缺口

| # | 要求 | 落地 | 证据 |
|---|---|---|---|
| 7 | 卡片点击回跳 + dismiss；关闭按钮 `stopPropagation` | 卡片 root `onClick` 调 `openSession(item.sessionId)` 后 `onDismiss(item.key)`（1131–1138）；关闭按钮先 `stopPropagation` 再 `beginClose`（1154–1156）；apply 注入 `openSession = ctx.uiWorkspace.openSession(id)`（1480） | P06：点击 → opened=['s-6'] 且队列清空；关闭 → stopped=1、opened 不变、120ms 后移除 |
| 8 | `enabled:false` 完全不启动 | apply 读完配置即 `return`（1462），不注册 locale/store/notifier/overlay | P07：registrations/effects/localeRegistrations/remote 监听全为 0 |
| 9 | 名称/状态行真实路径；标准 props 传 selector | `ToastHost` 从插槽 props 取 `useWorkspaces`/`useSessions`，并传模块级 `IDENTITY`（1210–1211）；apply 透传插槽 props | P08：明细行 `工区[会话] · 待执行`；selector 跨渲染同一引用；无参调用会因桩抛 TypeError 而红 |

## 6. P 用例表

| 编号 | 场景 | 期望 | 关键断言 |
|---|---|---|---|
| P01 | 隐藏页入队并渲染 | 通知正文/标题与浮层同源 | 通知 1 条；body === 浮层第二行；title === 浮层标题；tag 正确 |
| P02 | 可见页入队 | 不发系统通知 | 队列 1 条；通知实例 0（notifier 被调用但 `auto+可见` 返回 skipped） |
| P03 | `suppressWhenFocused:true` + 聚焦 | 不入队、不通知 | 队列 0；通知 0 |
| P04 | D1 三种权限/手势路径 | default 先发送；构造抛错 deferred；可见+手势再申请 | 3 个子测试：delivered/requestCount 0；deferred；delivered/requestCount 1 |
| P05 | D4 deferred → 可见 | 浮层重新入队、重新计时 | 新 key；`at === clock.now()` 且 > 旧 at |
| P06 | 点击卡片 / 关闭按钮 | 回跳 + dismiss；关闭不冒泡 | opened 正确；关闭 stopped=1、opened 不变、退场后移除 |
| P07 | `enabled:false` | 完全不启动 | 四项注册数均为 0 |
| P08 | 名称解析 + selector 签名 | `工区[会话] · 待执行`；selector 必传且跨渲染同引用 | 明细行逐字相等；`useWorkspaces` 无参抛 TypeError；两次渲染 selector 同为 `IDENTITY` |
| P09 | D3 issued 清理 | 关闭/点击/dispose 后为 0 | `issuedCount()` 1→0（三种路径） |
| P10 | 宿主错误边界 | 渲染抛错 → null、只记录一次、不外抛 | slot 组件外层是 `HostErrorBoundary`；注入抛错 store 后渲染 null；重复 `componentDidCatch` 只记一次 |
| P11 | timers 只有 `setTimeout/clearTimeout`、没有 `now` | 挂载不抛、到期仍 dismiss | ToastHost 归一化出 `now`；`createDismissTimer` 裸 timers 也能 start；到期回调触发 |
| P12 | window 形状的 timers（方法依赖 `this`） | 绑定正确、now 可用 | `now/setTimeout/clearTimeout` 的 `this` 都是 windowLike；now 返回 4242；到期触发 |

## 7. 测试设施与既有期望变更（单列）

| 变更 | 原因 | 影响 |
|---|---|---|
| `harness.createFakeCtx` 补 `uiWorkspace`（`opened` 记录 + `openSession`）、`slotProps`、`remoteListenerCount` | P06 需要回跳记录；P07 需要观察订阅；P08 需要插槽 props | 原有 `{ctx,...}` 形状保留，既有调用不受影响 |
| `test/notifier.test.js` N05/N06 期望更新 | 原断言固定了 D1 缺陷（default → deferred）；D1 要求先尝试发送 | **这是既有用例的期望变更**；N 套件仍 10/10，不是放宽 |
| `test/smoke.test.js` S4 `inject` 期望加 `uiWorkspace` | C05 要求五项；WP6b 点击回跳需要该服务 | 唯一 S4 断言变更；其余用例不动 |
| 新增 `test/presentation.test.js` | P01–P12 | 新增 15 条，基线 94 → 109 |
| `harness` 新增 `renderSlotElement` / `slotChildProps` | 宿主级错误边界是类组件，测试需要按最小 React 语义实例化并模拟 catch | S5 与 P 套件的渲染辅助；不 mock 被测逻辑 |
| `presentation` 夹具支持 `timers` 注入 | P11/P12 需要模拟真实 window 与精简 timers | 只影响测试装载 |

## 8. 门禁与统计

工作目录 `D:\DSH\DSH_end\插件\开发\task-complete-toast`：

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js
```

```text
ℹ tests 109
ℹ suites 0
ℹ pass 109
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 85.3677
EXITCODE=0
END=2026-10-26 17:36:33 +08:00
```

| 套件 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| S | 7 | 0 | 0 |
| I | 18 | 0 | 0 |
| U | 11 | 0 | 0 |
| F | 6 | 0 | 0 |
| D | 4 | 0 | 0 |
| N | 10 | 0 | 0 |
| R | 27 | 0 | 0 |
| W | 11 | 0 | 0 |
| P | 15 | 0 | 0 |
| 合计 | **109** | **0** | **0** |

## 9. 失败注入验证（两次，均已还原）

| # | 改坏的行 | 结果 |
|---|---|---|
| 1 | `client.js:1230` 删除 `texts.set(item.key, {title, line})` | P01 红：`隐藏时应在渲染后触发通知`，`0 !== 1`（共享表缺失 → notifyItems 不发） |
| 2 | `client.js:1409` 删除 `onVisible` 里的 `env.requeue(item)` | P05 红：`新 key 让卡片重新挂载、计时器重开`，新 key 仍等于旧 key |
| 3 | `client.js:1210` `useWorkspaces(IDENTITY)` → `useWorkspaces()` | P08 红：桩抛 `TypeError: selector is not a function`，边界渲染 null 后取卡片失败 |
| 4 | `client.js:1521` 去掉 `HostErrorBoundary` 包裹 | P10 红：`slot 组件必须被宿主错误边界包裹` |
| 5 | `client.js:1182` ToastHost 的 `now` 回落 → `timerSource?.now` | P11 红：`ToastHost 必须给缺失 now 的 timers 补回落`，`undefined !== function` |
| 6 | `client.js:231` `createDismissTimer` 的 `now` 回落 → `() => env.now()` | P11 红：`env.now is not a function`（与真机栈同型） |

六次均单独重跑 P 用例确认失败，再还原；最终全量 109/109。

## 10. 未覆盖与风险

| 项 | 说明 |
|---|---|
| 真实页面 / 重启 | 未重启宿主、未在 GUI 观察浮层、点击、语言切换、自动消失 |
| 真实 OS 通知 | 未验证 Windows 通知落点、AUMID、专注助手；Electron 的 `default` 权限是否允许构造未实测 |
| 「隐藏时 React 仍渲染」 | 文案共享表依赖该前提；后台标签/最小化的 React 调度与节流未观察 |
| 渲染期触发通知 | `onRendered` 在渲染函数内同步调用 notifier；幂等由共享表 + `handled` 保证，但严格 React 语义下属副作用，页面验证后再决定是否改为 effect |
| D1 升级路径 | 发送后 `requestPermission` 是尽力而为；真实权限弹窗时机与用户手势判定未观察 |
| D2 | `document.hasFocus()` 在 Electron 多窗口/最小化下的语义未验证 |
| D4 | 只验证 store 队列与 key/at；真实补弹时卡片重新挂载、动画与计时器未观察 |
| F6 | `ctx.uiWorkspace.openSession` 真实行为（已归档会话、窗口聚焦）未验证；卡片不可键盘激活（未要求） |
| 名称解析 | 依赖插槽 props 的 `useWorkspaces`/`useSessions` 形状（V-3 未证实）；P08 用固定快照 |
| 状态行 | 仍固定 `statusIdle`；`statusRunning` 等键未接真实状态列 |
| `enabled:false` | 只验证注册面为 0；真实插件面板开关后的热更新未验证 |
| 多标签 | 无认领，两标签可能各弹一次（WP8） |
| 子代理 / 会话移除 | V-2 仍未证实；沿用尽力探测 |
| 通知 tag 冲突/替换 | `tag='dsh-task-'+sessionId`、`renotify:false` 的真实 OS 行为未观察 |

## 11. 契约与声明

- §7 契约未改：路由、状态码、响应字段、配置字段、文案 key、多标签消息保持原样；`inject` 只是补齐 §11.2 C05 的五项依赖。
- 未安装、未调 `plugin_manager`、未改 profile / `app.asar` / 依赖。
- 本轮只交付接线代码与单测；**未重启宿主、未在真实页面或真实 OS 通知上观察**，109/109 仅代表本地夹具下的行为，不构成可用性结论。

## 12. 真机首次验收失败与修复（2026-10-26 17:23）

### 12.1 现象

插件开关为开启，但 `shell.overlay` 中 `task-complete-toast` 的 `active` 从 `true` 变为 `false`，即 slot entry 的组件渲染抛错被槽位框架捕获。旧版客户端是空组件，因此该问题此前未暴露。

### 12.2 真机证据（控制台原文，照抄）

```text
slot entry crashed in 'shell.overlay': TypeError: selector is not a function
    at memoizedSelector (client.js:107:1)
    at client.js:123:1
    at Object.useSyncExternalStore (index-BXV-oxvX.js:54:24351)
    at Te.useSyncExternalStore (index-BXV-oxvX.js:25:6560)
    at exports.useSyncExternalStoreWithSelector (client.js:133:1)
    at useSelector (client.js:159:1)
    at ToastHost (client.js:1134:1)
```

栈指向 `ToastHost` 里的 `useWorkspaces()`。结合本机源码目录中的类型声明：

```text
useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
export type SnapshotSelectorHook<T> = <S>(sel: (s: T) => S, eq?: (a: S, b: S) => boolean) => S
```

可确认 selector 是必填参数；无参调用时 `useSyncExternalStoreWithSelector` 内部拿到 `undefined` 并抛 `selector is not a function`。

### 12.3 修复

| 修 | 内容 | 代码 |
|---|---|---|
| 1 | 新增模块级常量 `const IDENTITY = (snapshot) => snapshot;`；`useWorkspaces(IDENTITY)`、`useSessions(IDENTITY)`。常量只创建一次，跨渲染引用稳定 | `client.js:1170`、`1210–1211` |
| 2 | 新增宿主级 `HostErrorBoundary`，包裹在 `BoundToastHost` 外层；捕获后渲染 `null`、每个实例只 `console.error` 一次、不外抛。只影响渲染，不停止 store 订阅与通知 | `client.js:1021–1043`、`1521` |
| 3 | 测试桩模拟真实签名：`useWorkspaces` 收到非函数参数立即抛 `TypeError: selector is not a function`；`useSessions` 同时接受无参与 selector。新增 P08 selector 断言（两次渲染 selector 引用相同且等于 `IDENTITY`）与 P10 宿主边界断言（抛错 store → null、只记一次、不外抛） | `presentation.test.js` P08/P10 |

### 12.4 为什么传 identity 对两种签名都安全

- 真实签名（已证实）：`selector` 必填，传 `IDENTITY` 返回完整快照，正是本插件需要的值。
- 若某版本退化为「无参返回快照、忽略多余参数」：`useWorkspaces(IDENTITY)` 仍返回快照，参数被忽略，不影响结果。
- 若某版本实现为「selector 可选」：传 `IDENTITY` 等于不筛选，同样返回完整快照。
- 使用模块级常量而非每次渲染新建箭头函数，避免依赖 selector 身份的 hook 反复重订阅；P08 会检查两次渲染的 selector 引用相等。

### 12.5 仍无法排除的可能

- 若刷新后 entry 仍为 `inactive`，需要控制台报错原文与堆栈（尤其是是否仍指向 `ToastHost`，或转向 `ctx.locale.subscribe` / `ctx.slots` 等其他调用）。
- 宿主级错误边界只能保证「本插件不再把异常抛给槽位框架」，不能修复其他真实 API 签名不符；新报错会以 `task-complete-toast: host render failed` 形式出现，需要原文定位。
- `useSessions` 的真实 selector 行为、`useSyncExternalStoreWithSelector` 的相等比较、`shell.overlay` 的 props 注入形状仍以真机复验为准。
- 本次未能拿到修复后的页面截图或控制台；`active` 是否恢复、浮层是否出现、通知是否弹出均未观察。

## 13. 真机第二次失败与修复：`env.now is not a function`（2026-10-26 17:33）

### 13.1 现象

提示已经触发、条目已产生，store 判定与入队正常；卡片渲染在启动自动消失计时器时抛错，被单卡错误边界捕获并记录。`active` 不再整体失活，但卡片不显示。

### 13.2 真机证据（控制台原文，照抄）

```text
task-complete-toast: card render failed TypeError: env.now is not a function
    at Object.start (client.js:260:1)
    at client.js:1063:1
```

### 13.3 根因

- `client.js:260` 是 `createDismissTimer().start()`，内部调用 `env.now()`。
- `ToastCard` 的 `timers` 来自 `props.timers ?? window`；真实 `window` 只有 `setTimeout` / `clearTimeout`，**没有 `now`**。
- 测试里用的假 timers 一直自带 `now`，所以单测全绿；真实 window 才暴露「桩比真实宽松」。

### 13.4 修复

| 修 | 内容 | 代码 |
|---|---|---|
| 1 | `createDismissTimer` 内部统一走局部 `now`：`env.now` 可调用则用，否则回落 `Date.now`；`setTimeout` / `clearTimeout` 缺失也各自回落 | `client.js:229–301` |
| 2 | `ToastHost` 不再把 `window` 原样传下去，统一归一化为 `{now, setTimeout, clearTimeout}`：`now` 用 `Date.now` 回落，`setTimeout` / `clearTimeout` 用 `.bind(timerSource)` 固定 `this`；`props.timers` 走同一归一化 | `client.js:1178–1192` |
| 3 | 同类隐患清理：`createStore` 内部也统一走局部 `now` / `scheduleTimer` / `cancelTimer`（缺 `now` 回落 `Date.now`，缺 timer 回落全局或 `no-op`）；`ToastCard` 的退场计时也做同样的 schedule/cancel 回落；`createResolver` 原有 guard 保留；`createNotifier` 不使用计时器，文档与调用侧继续只传可调用项 | `client.js:231–241`、`322–331`、`451`、`509`、`609`、`1045–1060` |
| 4 | 测试新增 P11/P12：P11 用只有 `setTimeout/clearTimeout` 的 timers，验证 `createDismissTimer` 裸用不抛、ToastHost 归一化后有 `now`、到期仍 dismiss；P12 用方法依赖 `this` 的 window 形状对象，验证 `now/setTimeout/clearTimeout` 的 `this` 都是该对象、`now` 生效、到期触发 | `presentation.test.js` P11/P12 |

### 13.5 为什么测试没抓到

- `dismiss.test.js` 与 `presentation` 早期夹具都把 `now` 当 timers 的必备字段传入；`ToastHost` 在测试里也走 `props.timers`，因此从未走到「真实 window 没有 now」的分支。
- P11 现在把该前提反过来：timers 只有 `setTimeout/clearTimeout`，并断言 ToastHost 必须补出 `now`、`createDismissTimer` 裸用也不抛。
- P12 补上 `this` 绑定维度：方法抽取/解构后调用会丢 `this`，真实 window 的定时器 API 对此敏感。

### 13.6 失败注入证据（与真机同型）

- 把 `createDismissTimer` 的 `now` 回落改回 `() => env.now()` 后跑 P11，报错原文与真机同型：`env.now is not a function`（`start` 调用点）。
- 把 `ToastHost` 的 `now` 回落改为 `timerSource?.now` 后跑 P11，断言 `typeof timers.now === 'function'` 变红。
- 两处均已还原；最终全量 109/109。

### 13.7 仍无法排除的可能

- 若刷新后卡片仍不出现，需要新的控制台原文；现在卡片错误会以 `task-complete-toast: card render failed …` 记录，栈会指向具体渲染步骤。
- `window.setTimeout` 在 Electron 中是否为原生函数、绑定后是否保持行为、`Date.now` 与主题/暂停逻辑的组合未在真机逐项验证。
- 本次未取得修复后的页面截图；`active`、卡片显示、自动消失与通知的成对观察仍待复验。
