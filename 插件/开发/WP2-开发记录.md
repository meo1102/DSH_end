# WP2 开发记录 — 客户端 Store

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | 开发方案 §6.4、§7.5、§8、§10.2 的 U01–U11；ADR-002/003/005 |
| 时间 | 2026-10-26 16:16（Asia/Shanghai） |
| 状态 | Store 纯逻辑与单测完成；**`apply` 尚未接线、未重启、未在页面观察** |
| 测试结果 | S 7/7、I 18/18、U 11/11，共 36/36 通过，0 失败 0 跳过 |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/client.js` | 275 | 内联 `createStore`、`DEFAULTS`、`__test__`；`apply` 保留空占位与 WP6 接入点 |
| `task-complete-toast/test/store.test.js` | 288 | U01–U11、假时钟、伪宿主 env |
| `task-complete-toast/test/smoke.test.js` | 153 | S4 放宽为允许 `__test__` |
| `task-complete-toast/README.md` | 88 | 更新为 WP1+WP2 阶段、测试命令与限制 |

未改动：`index.js`、`lib/*.js`、`package.json`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、profile、`app.asar`。

行数按 `[System.IO.File]::ReadAllLines().Length` 统计，不把末尾换行算成额外一行。

## 2. U01–U11 用例表

所有用例使用假时钟；时间单位均为毫秒。`Item` 断言固定包含 `{key, sessionId, at, outcome:'pending'}`。

| 编号 | 输入 | 期望 | 断言点 |
|---|---|---|---|
| U01 | `list.phase='pending'`，首个 `status(false)`；`minRunMs:0` | 只记基线，不弹；后续真实 running 仍可弹 | 基线后 1000ms 队列为空；随后 `true→1600ms→false→250ms` 得到 1 条 `pending` |
| U02 | `status(true)` → 2000ms → `status(false)` | 250ms 观察窗后入队 | 249ms 时队列为空；250ms 时 1 条，`at=2250`，`outcome='pending'` |
| U03 | 运行 800ms 后结束 | `minRunMs=1500` 抑制 | 再推进 300ms 队列为空 |
| U04 | `status(false)` 后 100ms 又 `status(true)` | 回弹取消，不入队 | 再推进 500ms 队列为空；计时器被清除 |
| U05 | `getBinding` 返回 `pendingSubmissions:[…]` | 抑制 | 结束并过观察窗后队列为空 |
| U06 | 同会话完成 1 → 2s 后再次完成 | `cooldownMs=3000` 合并 | 第二次不新增；仅 1 条，`at=2250` |
| U07 | 4 个会话同时 `true` → 2000ms → 同时 `false` | `maxVisible=3`，移除最旧 | 队列为 `s-1,s-2,s-3`，`s-0` 被移除 |
| U08 | 10 个不同会话在一分钟内依次完成 | `maxPerMinute=6`，第 7 次起抑制 | 订阅累计只见到 6 个 `sessionId`；队列仍为 3 |
| U09 | 会话不在 `byId` | 抑制 | 结束并过观察窗后队列为空 |
| U10 | `byId` 行带 `origin:'subagent'` | 尽力抑制（V-2 未证实） | 结束后队列为空 |
| U11 | 有队列/有观察窗计时器时 `reset()` | 清空状态、队列、计时器并重新基线 | 队列空、`clock.pending()=0`；重新基线后真实 running 仍可产生新条目 |

## 3. 状态机落地与 §8 对照

### 3.1 §8.1 状态

| `state.mode` | 进入条件 | 动作 |
|---|---|---|
| `unknown` | 初始 / decide 后删除状态 | 无计时器 |
| `baseline` | `phase='pending'` 且收到首个 `status(false)` | 只记录，不启动计时器；`sawRunning=false` |
| `running` | `status(true)`（含 baseline → running、settling → running） | `startedAt=now()`；`sawRunning=true` |
| `settling` | `status(false)` 从 running 进入 | `coalesceMs`（250）计时器 |
| 决策 | settling 计时器到期 | 同步执行 `decide`；WP2 无异步结果，WP5 再把结果解析插到这一步 |

- `settling` 收到 `status(true)`：清计时器、回到 `running`（U04）。
- `decide` 后不保留 `cooling` 状态：队列/冷却分别由 `lastToastAt` 与队列表达；下次 `status(true)` 重新进入 running。
- `reset()`：清所有计时器、状态、队列、冷却与限流窗口；不取消 `onStatus` 订阅（U11）。

### 3.2 §8.2 转移

| 当前 | 事件 | 守卫 | 动作 | 次态 | 用例 |
|---|---|---|---|---|---|
| unknown | `status(true)` | — | `startedAt=now()` | running | U02 |
| unknown | `status(false)` | `list.phase='pending'` | 记基线 | baseline | U01 |
| unknown | `status(false)` | 其他 | 丢弃 | unknown | U09 等价 |
| running | `status(false)` | — | 起 settle 计时器 | settling | U02 |
| settling | `status(true)` | — | 清计时器 | running | U04 |
| settling | 计时器到期 | `decide` 通过 | 入队 | unknown（冷却由 `lastToastAt`） | U02/U07 |
| settling | 计时器到期 | `decide` 拒绝 | 丢弃 | unknown | U03/U05/U06/U08/U09/U10 |
| any | `reset()` | — | 全清 | unknown | U11 |

### 3.3 §8.3 decide 顺序

| # | 条件 | 实现 | 用例 |
|---|---|---|---|
| 1 | 从未观察到 `running=true` | `state.sawRunning !== true` → suppress | U01 |
| 2 | 会话不在 `byId` | `row === undefined` → suppress | U09 |
| 3 | 子代理标记（V-2 未证实） | `isSubagentRow(row)` 尽力探测 → suppress | U10 |
| 4 | 观察窗内回弹 | `status(true)` 清计时器；`decide` 进入时再校验 `mode==='settling'` | U04 |
| 5 | `pendingSubmissions` 非空 | `env.getBinding(id).session.getSnapshot().pendingSubmissions.length > 0` → suppress | U05 |
| 6 | 运行不足 `minRunMs` | `now - startedAt < minRunMs` → suppress | U03 |
| 7 | 同会话冷却 | `now - lastToastAt < cooldownMs` → suppress | U06 |
| 8 | 每分钟上限 | 60s 滚动窗口内已入队数 `>= maxPerMinute` → suppress | U08 |
| 9 | 其他 | 入队、`lastToastAt=now`、记录限流时间、按 `maxVisible` 淘汰最旧 | U02/U07 |

- `maxPerMinute` 采用**滚动 60s**实现“本分钟已弹”；没有固定自然分钟边界。
- `maxVisible` 在入队后 `while (items.length > maxVisible) items.shift()`。
- 子代理探测字段：`subagent === true`、`isSubagent === true`、`origin === 'subagent'`、`kind === 'subagent'`、`header.origin === 'subagent'`；拿不到就不过滤（V-2 未证实）。

## 4. Store API 与假时钟

- `createStore(env, config)` 返回 `{start, subscribe, get, dismiss, ingest, reset}`。
- `env`：`now`、`setTimeout`、`clearTimeout`、`list`、`onStatus`、`getBinding`；store 内部不访问 `Date`/`window`/全局定时器。
- `list` 兼容三种形态：普通快照对象、带 `getSnapshot()` 的 ObservableSnapshot、返回快照的函数；`getSnapshot` 优先。
- `Item`：`{key, sessionId, at, outcome:'pending'}`；`key` 由 `sessionId + 单调序号` 生成。
- `subscribe(fn)` 在队列变化时收到只读快照；`get()` 在未变化时返回同一快照引用（供 WP3 的 `useSyncExternalStore` 使用）；`dismiss(key)` 移除一条；`ingest(list)` 为 `env.list` 缺省时的备用快照入口。
- 假时钟：`advance(ms)` 只执行到期计时器，按到期时间排序；不 `sleep`、不读真实时间。`clock.pending()` 暴露待执行计时器数量给 U11。

## 5. 测试变更（S4）

S4 从「factory 只含 `apply`/`inject`」**放宽**为「必须含 `apply`/`inject`，允许额外 `__test__`」：

- 变更前：`Object.keys(factory).sort()` 严格等于 `['apply','inject']`。
- 变更后：严格等于 `['__test__','apply','inject']`，并额外断言 `__test__.createStore` 为函数、`__test__.DEFAULTS` 包含 `coalesceMs=250`。
- 理由：ADR-007 明确允许 `__test__` 测试钩子；WP2 的 Store 必须通过它暴露给 `node:test`，否则单文件客户端无法单测。
- 这是**放宽**，不是静默改动；S1–S3、S5–S7 与 I01–I17 未放宽。

## 6. 测试命令与原始统计

工作目录：`D:\DSH\DSH_end\插件\开发\task-complete-toast`

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js
```

```text
✔ I01 turn/end(completed) 写入后 GET → 200 且字段/头齐全 (1.9618ms)
✔ I02 未知会话 GET → 404 unknown-session (0.2164ms)
✔ I03 sessionId 缺失/空/超长/控制字符 → 400；非 GET → 405 (0.2163ms)
✔ I04 error 与 max-tokens 分别映射 error / interrupted (0.1938ms)
✔ I05 aborted 的 5 种 cause 与 forked 映射正确 (0.3373ms)
✔ I06 index-inject 默认投影只有 enabled/bridge/routePath (0.1819ms)
✔ I06b enabled:false 只注册注入行，bridge 投影为 off (0.1113ms)
✔ I07 TTL 过期后 GET → 404 且表项被清除 (0.1244ms)
✔ I08 表满 257 条淘汰最旧，容量保持 256 (0.2257ms)
✔ I09 Config：undefined/空对象得到全套默认值 (0.1492ms)
✔ I10 Config：数值/路径越界被拒，边界值通过 (0.2522ms)
✔ I11 Config：类型错误被拒（含 enum） (0.1559ms)
✔ I12 Config：未知键忽略且不进入归一化结果 (0.0761ms)
✔ I13 parsePatch 支持 config 缩进映射 (0.5671ms)
✔ I14 dispose 后监听与路由全部移除，注入行不再产出 (0.1526ms)
✔ I15 exposeReason:false 只回 sessionId/outcome/at (0.1329ms)
✔ I16 自定义 routePath/routeKind 透传并生效 (0.1245ms)
✔ I17 blocked 与 interrupted 映射 (0.1208ms)
✔ S1 清单：名称、版本、私有、ESM 与四个导出齐全 (0.3047ms)
✔ S2 清单：dsh.bundle.patch 与 dsh.client(web/immediately/空 inject) (0.0815ms)
✔ S3 patch：insert 恰好一行宿主 entry 且 id/name 正确 (0.3544ms)
✔ S4 客户端：factory 返回 inject/apply，并暴露 __test__（ADR-007） (0.6259ms)
✔ S5 客户端：apply 在伪 ctx 下不抛错，只注册 shell.overlay 空占位 (0.7837ms)
✔ S6 资源：locale 只含 meta，icon 为合法且不超 256 KiB 的 SVG (0.6026ms)
✔ S7 宿主：导出 apply/inject 与 Standard Schema Config，调用不抛错 (0.352ms)
✔ U01 phase=pending 的首个 status(false) 只记基线，不弹 (0.6006ms)
✔ U02 status(true) → 2s → status(false)，250ms 后入队 (0.1379ms)
✔ U03 运行 800ms 后结束被 minRunMs 抑制 (0.1094ms)
✔ U04 观察窗内回弹 status(true) 取消，不入队 (0.1095ms)
✔ U05 pendingSubmissions 非空时抑制 (0.13ms)
✔ U06 同会话两次完成间隔 2s，冷却合并只留一条 (0.1209ms)
✔ U07 4 条同时有效时最多 3 条，最旧被移除 (0.1844ms)
✔ U08 一分钟内 10 次完成，第 7 次起抑制 (0.2033ms)
✔ U09 会话不在 byId 时抑制 (0.1589ms)
✔ U10 byId 行带 subagent 标记时抑制（V-2 未证实） (0.2656ms)
✔ U11 reset 清空状态/队列/计时器并重新基线 (0.2318ms)
ℹ tests 36
ℹ suites 0
ℹ pass 36
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30.783
EXITCODE=0
START=2026-10-26 16:16:54 +08:00
END=2026-10-26 16:16:54 +08:00
```

| 套件 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| S（smoke） | 7 | 0 | 0 |
| I（integration） | 18 | 0 | 0 |
| U（store） | 11 | 0 | 0 |
| 合计 | **36** | **0** | **0** |

## 7. 变异检查（测试能变红）

两条均为临时改坏实现、跑单用例、随后恢复；恢复后全量 36/36 通过。

| 用例 | 改坏位置 | 改法 | 结果 |
|---|---|---|---|
| U07 | `client.js:141` 入队后的淘汰 | `items.shift()` → `items.pop()` | ❌ 变红：实际 `['s-0','s-1','s-2']`，期望 `['s-1','s-2','s-3']` |
| U08 | `client.js:132` 限流判断 | `emittedAt.length >= maxPerMinute` → `>` | ❌ 变红：`seen.size` 7，期望 6 |

复现命令：

```powershell
node --test --test-isolation=none --test-name-pattern "U07" test/store.test.js
node --test --test-isolation=none --test-name-pattern "U08" test/store.test.js
```

## 8. 未覆盖与风险

| 项 | 说明 |
|---|---|
| `apply` 未接线 | 真实 `api-session/status`、`ctx.sessions.list`、`connection/reset` 尚未进入 store；WP6 统一接入。 |
| `env.list` 真实形态 | 适配器兼容普通快照/`getSnapshot()`/函数，但真实 `ctx.sessions.list` 的快照时机与 `phase` 语义未在页面验证。 |
| V-2 子代理标记 | 只做尽力探测；真实 `byId` 行是否带这些字段未证实，拿不到就不过滤。 |
| `pendingSubmissions` | 按 `binding(id).session.getSnapshot().pendingSubmissions` 读取；真实 binding 形状未在运行时验证。 |
| `connection/reset` | Store 暴露 `reset()`；`ctx.on('connection/reset')` 的接线在 WP6，当前 U11 直接调用。 |
| 结果解析 | 本阶段 `outcome` 固定 `pending`；结果桥/`deciding` 的异步结果在 WP5。 |
| 自动消失 | `durationMs` 未在 Store 实现；WP3 渲染队列时处理。 |
| `maxPerMinute` 口径 | 用滚动 60s 而非自然分钟；若验收要求固定分钟边界，需要报告后调整。 |
| `ingest` / `dismiss` / `start` disposer | 已实现但未被 U01–U11 单列覆盖；WP3/WP6 使用前应补。 |
| 基线内部状态 | U01 通过行为证明“不弹/后续 running 可弹”，未直接读取内部 `baseline` 状态。 |

## 9. 下一步

1. **WP3 渲染层**：用现有 `shell.overlay` 占位订阅 `store.subscribe`，先做静态卡片与 `maxVisible`/`dismiss` 的可视验证；`durationMs` 自动消失在此实现。
2. **WP4 通知与补弹**：消费同一队列；不要改变 Store 的判定顺序。
3. **WP5 结果桥**：在 `decide` 的 settling 之后插入解析，把 `outcome` 从 `pending` 替换为 `completed/error/...`；保持 §8.4 时延预算。
4. **WP6 真实接线**：按 `apply` 注释创建 `env`（`now`/定时器/`ctx.sessions.list`/`ctx.remote.$on`/`getBinding`），用 `ctx.effect(() => store.start())` 与 `ctx.on('connection/reset', () => store.reset())` 持有生命周期；读取 ADR-009 三项配置。
5. 真实宿主上补验证：`phase` 快照时机、`pendingSubmissions`、子代理标记、`event.time` 与 TTL。

## 10. 声明

Store 纯逻辑与单测完成；**未接线、未重启、未在页面观察**。本记录不包含任何可用性结论。
