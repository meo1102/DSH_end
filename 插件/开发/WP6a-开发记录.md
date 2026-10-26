# WP6a 开发记录 — 真实数据接进 store

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | locale 字典、注入配置读取、真实 env、生命周期、resolver 接判定；**不含 notifier/D1–D4/deferred/suppressWhenFocused** |
| 时间 | 2026-10-26 17:01（Asia/Shanghai） |
| 状态 | 接线代码与 W01–W09 单测完成；**未重启宿主、未在真实页面/真实事件流观察** |
| 测试结果 | S 7/7、I 18/18、U 11/11、F 6/6、D 4/4、N 10/10、R 27/27、W 11/11，共 **94/94** 通过，0 失败 0 跳过（exit 0） |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/client.js` | 1335 | 新增 zh/en 字典、配置守卫与合并、store 解析集成、真实 env、apply 装配、ToastHost locale 订阅；`inject` 扩为四项 |
| `task-complete-toast/test/wiring.test.js` | 402 | 新增 W01–W09（含 W06 两个子测试，共 11 条） |
| `task-complete-toast/test/harness.js` | 477 | `loadClientModule` 支持 window 额外字段；`createFakeCtx` 扩为含 effect/on/locale/remote/sessions |
| `task-complete-toast/test/smoke.test.js` | 216 | **S4 一行断言推进**：`inject` 从 `['slots']` 改为四项（见 §7） |
| `task-complete-toast/README.md` | 103 | 阶段、能力、目录、测试命令、已知限制同步 WP6a |
| `task-complete-toast/index.js`、`lib/*` | 不变 | 未改 |
| `package.json`、`cordis.patch.yml`、`locale/*`、`icon.svg` | 不变 | 未改 |

行数按 `[System.IO.File]::ReadAllLines().Length` 统计。

## 2. apply 装配顺序（client.js:1279–1318）

| 序 | 动作 | 落点 |
|---:|---|---|
| 1 | 读 `window.__DSH_TASK_COMPLETE_TOAST__`，逐字段校验后合并到 `DEFAULTS` 之上 | 1280–1282、`readClientConfig` 97–110 |
| 2 | 用同一份 config + `createResolverEnv(ctx)` 创建 resolver（fetch 走 `window.fetch`） | 1284–1285、`createResolverEnv` 817–833 |
| 3 | 两个 `ctx.effect` 分别注册 zh/en 字典；`t = ctx.locale.bind(LOCALE_NS)` | 1287–1290 |
| 4 | 用 `createClientEnv(ctx, resolver)` 创建 store；`ctx.effect(() => store.start())`；`ctx.effect(() => ctx.on('connection/reset', () => store.reset()))` | 1292–1295、`createClientEnv` 799–815 |
| 5 | 构造 locale face（`subscribe`/`getSnapshot` 包装），供组件订阅 | 1297–1301 |
| 6 | 仍只注册 `shell.overlay` 一项，组件拿到真实 store/config/t/locale | 1313–1317 |

`__test__` 增加 `readClientConfig` / `zh` / `en`（仅测试装载）；`apply` 未注册第二项插槽。

## 3. 配置读取（§7.2 / ADR-009）

- 只认 15 个已知字段；逐字段用 `CONFIG_GUARDS` 校验，类型或枚举不符就**忽略该字段**，读取异常也返回 `{}`，不抛。
- 合并顺序：`DEFAULTS` ← 注入值。宿主实际只投影 `enabled` / `bridge` / `routePath`（ADR-009）；测试注入额外字段验证了客户端侧覆盖能力。
- 允许的额外覆盖：`position`、`maxVisible`、`durationMs`、`minRunMs`、`coalesceMs`、`cooldownMs`、`showTitle`、`systemNotification`、`suppressWhenFocused`、`maxPerMinute`、`resolveBudgetMs`、`claimWindowMs`。
- 类型守卫：布尔、有限非负数字、路由以 `/` 开头、三个枚举（position/systemNotification/bridge）。W01 用 `durationMs:'5000'`、`position:'top'`、`bridge:'maybe'` 验证坏值被忽略。

## 4. locale（§7.7 / §9.5）

- `client.js` 顶部新增 `zh` / `en`（各 14 键，键与取值逐字对齐 §7.7）；`LOCALE_NS='taskCompleteToast'`。
- 注册形式按任务要求：`ctx.effect(() => ctx.locale.register(NS, 'zh', zh))`、`'en'` 各一次；已核对本机 `LocaleRuntime.register(ns, localeOrDicts, dict)` 支持字符串 + 字典形式。
- `t = ctx.locale.bind(NS)`；组件新增一次 `useSyncExternalStore(localeFace.subscribe, localeFace.getSnapshot, …)`，只借用订阅触发重渲染，文本由绑定 `t` 在调用时解析当前语言。W02 验证 zh→en 切换后同一 `t` 返回英文。
- `locale/*.json` 仍只含 `meta`，未混入运行时键。

## 5. 真实 env 与生命周期

| env 字段 | 来源 |
|---|---|
| `now` | `Date.now()` |
| `setTimeout` / `clearTimeout` | `window.setTimeout` / `window.clearTimeout`（调用时保留 window 接收者） |
| `list` | `ctx.sessions.list.getSnapshot()` |
| `onStatus` | `ctx.remote.$on('api-session/status', handler)` |
| `getBinding` | `ctx.sessions.binding(id)` |
| `resolve` | `(id, signal) => resolver.resolve(id, signal)` |
| resolver 的 `fetch` | `window.fetch(url, init)`；缺失时抛给 resolver，由 resolver 降级 |

- `store.start()` 的返回清理函数交给 `ctx.effect`；卸载时 `reset()` 清空计时器、abort 在途解析。
- `connection/reset` 单独注册 effect，调用 `store.reset()`。
- 每个计时器、监听、resolve 都挂在会话 state / effect 上；无新增常驻轮询。

## 6. 竞态处理（abort 与 generation）

1. **settling 起点并发**：`status(false)` 且原状态为 `running` 时，先 `startResolution(id, state, generation)`，再挂 250 ms 观察窗计时器（client.js:493–505）。解析与观察窗并行，不串行等待。
2. **回弹 abort**：`status(true)` 在 settling 中到达 → `clearSettle` + `abortResolution(state)`，在途 resolve 的 signal 立即 abort，结果不再写回（client.js:474–487）。
3. **写回守卫**：resolve 的 then/catch 同时检查 `states.get(id) === state`、`state.mode === 'settling'`、`state.generation === generation`；任一不符就丢弃。`generation` 沿用原有 settle 代际，state 已被删除或已换新对象都写不进去（client.js:388–397）。
4. **decide 读取**：结果已到 → 用其 outcome；仍在途 → 按 v1 降级 `completed`；随后 `finish()` 统一 `abortResolution`（client.js:401–406、434–467）。
5. **结果消费**：`ignored` / `suppressed` 直接 `finish()`，不入队；其余写入 `Item.outcome`（`completed/error/interrupted/blocked/stopped`）。
6. **卸载 / reset**：`reset()` 遍历 state，先 `clearSettle` 再 `abortResolution`，随后清空队列与限流窗口（client.js:520–530）。
7. **兼容**：未注入 `env.resolve` 时 `resolution.status='none'`，Item 仍写 `'pending'`，既有 U01–U11 行为与期望不变。

## 7. W 用例表

| 编号 | 场景 | 期望 | 断言点 |
|---|---|---|---|
| W01 | 注入 `maxVisible:1` + 三个坏值 | 合法字段覆盖、坏值忽略、队列最多 1 | `config.*` 五项；两会话完成后 `store.get().length===1` |
| W02 | apply 注册 locale | zh/en 两套、14 键、切换即时 | `localeRegistrations` 两条；键集合等于 §7.7；`t` zh↔en |
| W03 | status(false) 后不推进观察窗 | settling 起点已发起一次真实 resolver | 时钟仍 2000；flush 后 `fetchCalls===1`；URL 正确；250 ms 后 outcome=error |
| W04 | 绑定 `aborted/user` | suppressed 不入队 | 队列 0；无残留计时器 |
| W05 | resolver 返回 error | 入队且 `outcome='error'` | 1 条，sessionId 正确 |
| W06 | resolver reject / 观察窗后仍在途 | 都入队 `completed` | 两个子测试；在途用例断言 signal 已 abort、计时器清零 |
| W07 | settling 100 ms 后回弹 running | abort 在途、不入队 | abort 事件触发；settle 计时器清零；再走 500 ms 队列仍 0 |
| W08 | 入队后 `connection/reset` | 清空队列与计时器 | 队列 1→0；`clock.pending()===0` |
| W09 | 有在途 fetch 时 `ctx.disposeAll()` | abort 请求、清计时器、无残留条目 | fetch `signal.aborted===true`；flush 后计时器 0；队列 0 |

W01/W02/W03/W04/W08/W09 走 apply 级夹具（假 window + 假 ctx）；W05/W06/W07 走 store 级夹具（假时钟 + 注入 `env.resolve`）。apply 级用例注入 `minRunMs:0`/`cooldownMs:0`，因为真实 env 的 `now` 是 `Date.now`，假时钟无法推进墙钟；这是夹具需要，不是实现放宽。

## 8. 测试设施变更（允许，单列）

| 变更 | 原因 | 影响 |
|---|---|---|
| `test/harness.js` `loadClientModule(options)` 支持 `options.window` 额外字段 | 需要注入假计时器、假 `fetch` 与 `__DSH_TASK_COMPLETE_TOAST__` 到 vm 的 window | 原有调用不传 options，行为不变 |
| `createFakeCtx()` 扩展：`effect/on/locale/remote/sessions` + `disposeAll`/`emit`/`emitRemote`/`setList`/`setBinding`/`setLocale` | S5 与新的 apply 级测试需要真实形态的客户端 ctx | S5 原有断言仍通过；`{ctx, injected, registrations}` 返回形状保留 |
| `test/smoke.test.js` S4 `inject` 断言从 `['slots']` 改为 `['slots','locale','sessions','remote']` | WP6a 需要真实服务依赖，§11.2 C05 要求 inject 含 sessions/remote/slots/locale | **这是唯一的既有断言变更**；不是放宽，是把契约推进到接线后的真实依赖。其余 82 条既有用例的断言未动 |
| 新增 `test/wiring.test.js` | W01–W09 | 新增 11 条，基线 83 → 94 |

## 9. 门禁与统计

工作目录 `D:\DSH\DSH_end\插件\开发\task-complete-toast`：

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js
```

```text
ℹ tests 94
ℹ suites 0
ℹ pass 94
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 72.0325
EXITCODE=0
END=2026-10-26 17:00:53 +08:00
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
| 合计 | **94** | **0** | **0** |

## 10. 失败注入验证（两次，均已还原）

| # | 改坏的行 | 结果 |
|---|---|---|
| 1 | `client.js:498` 删除 settling 起点的 `startResolution(id, state, generation);` | W03 红：`settling 起点应已发起一次解析`，`0 !== 1` |
| 2 | `client.js:478` 删除回弹分支的 `abortResolution(state);` | W07 红：`回弹 running 必须 abort 在途解析`，`false !== true` |

两次均单独重跑对应用例确认失败，再还原；最终全量 94/94。

## 11. 未覆盖与风险

| 项 | 说明 |
|---|---|
| 真实页面 / 真实事件流 | 未重启宿主、未在 GUI 观察浮层；`api-session/status` 的真实参数顺序、`sessions.list` 快照形状、`binding` 生命周期仍 `[待验证]` |
| 真实 locale 切换重渲染 | 只验证绑定 `t` 随 `setLocale` 变；真实 `ctx.locale.subscribe` → React 重渲染未观察 |
| 名称解析输入 | `apply` 只把 store/config/t/locale 传给组件，未提供 `useWorkspaces`/`useSessions`；真实页面会落回「未分组/未命名会话」，名称接线留到 WP6b/WP7 |
| 真实路由 / fetch | W03 用假 `fetch`；真实同源路由与 200 ms 墙钟预算未测 |
| 真实计时器 | W03/W09 用假时钟；真实 `window.setTimeout`/`clearTimeout` 绑定未在页面验证 |
| 通知 | notifier 仍未接 apply；D1–D4、deferred 回浮层、`suppressWhenFocused` 均留 WP6b |
| 状态文案 | 卡片第二行仍固定 `statusIdle`；`statusRunning` 等键已备好但未接真实状态列 |
| `enabled:false` | 客户端未按 `enabled` 跳过 start；宿主关时只注入配置行，客户端当前仍会按注入值启动，行为需在 WP6b/WP7 明确 |
| `uiWorkspace` | 点击回跳未实现，`inject` 未包含 `uiWorkspace`；C05 完整项留到点击功能落地时补 |
| `maxVisible` 语义 | 当前同时用于队列上限；W01 只证明了 1 条生效，未验证渲染上限与 §6.5 的最终视觉顺序 |
| 多标签 | 无认领，两标签可能各弹（WP8） |
| 子代理 / 名称解析 | V-2/V-3 仍未证实，沿用尽力探测与回退 |
| 异步真实时序 | 单测里 settle 250 ms 与 resolve 200 ms 的先后由假时钟控制；真实事件循环下的抖动未测 |

## 12. 契约与声明

- §7 契约未改：路由、状态码、响应字段、配置字段、文案 key、多标签消息均保持原样。
- 未安装、未调 `plugin_manager`、未改 profile / `app.asar` / 依赖。
- 本轮只交付接线代码与单测；**未重启宿主、未在真实页面或真实事件流观察**，94/94 仅代表本地夹具下的行为，不构成可用性结论。
