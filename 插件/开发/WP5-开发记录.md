# WP5 开发记录 — 结果桥 resolver（只做纯逻辑，不接线）

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | 开发方案 §4.2 快慢路径、§7.5 `resolve` 签名、§7.3 路由契约、§8.4 时延预算；只做 `createResolver`，不接 store/apply |
| 时间 | 2026-10-26 16:50（Asia/Shanghai） |
| 状态 | resolver 纯逻辑与单测完成；**未接 store、未接 apply、未重启宿主、未在真实路由/页面观察** |
| 测试结果 | S 7/7、I 18/18、U 11/11、F 6/6、D 4/4、N 10/10、R 27/27，共 **83/83** 通过，0 失败 0 跳过（exit 0） |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/client.js` | 1127 | 新增内联 `classify`、`ROUTE_OUTCOMES`、`createResolver`；`__test__` 增加 `createResolver` / `classify`；`apply` 未改 |
| `task-complete-toast/test/resolver.test.js` | 355 | 新增 R01–R10（含子测试共 27 条） |
| `task-complete-toast/test/harness.js` | 363 | vm 沙箱补真实 `AbortController`（运行环境，不是被测逻辑的桩） |
| `task-complete-toast/test/smoke.test.js` | 216 | S4 增加 `createResolver` / `classify` 两个函数断言 |
| `task-complete-toast/README.md` | 102 | 阶段、目录、测试命令、已知限制同步到 WP5 纯逻辑 |
| `task-complete-toast/index.js` | 83 | 未改 |
| `task-complete-toast/lib/*.js` | 不变 | 未改；`lib/classify.js` 作为 R09 对照基线 |
| `task-complete-toast/package.json`、`cordis.patch.yml`、`locale/*`、`icon.svg` | 不变 | 未改 |

行数按 `[System.IO.File]::ReadAllLines().Length` 统计。

## 2. 实现落点（client.js）

| 单元 | 行 | 说明 |
|---|---:|---|
| `classify(reason)` + `normalizeCause` | 436–473 | §7.4 全 8 行；客户端不能 import `lib/classify.js`，内联一份 |
| `ROUTE_OUTCOMES` | 475–484 | `completed/error/interrupted/blocked/stopped/ignored/suppressed` 七值 |
| `createResolver(env, config)` | 503–643 | `{ resolve(sessionId, signal) }`；`env` 注入 `getBinding/fetch/now/setTimeout/clearTimeout` |
| `outcomeFromBinding` | 516–533 | 快路径：`entries` 反向找最后一条 `type==='event' && event.type==='turn/end'`；读取异常按未命中处理 |
| 快路径返回 | 538–539 | 命中直接 `{outcome, source:'binding'}`，不建计时器、不调 `fetch` |
| 慢路径 | 541–621 | `bridge==='off'` 先降级；`GET {routePath}?sessionId=<encodeURIComponent(id)>`，`cache:'no-store'`；`AbortController` + 预算计时器；预算同时约束 `json()` 读取 |
| 超时/取消竞争 | 560–579、592–600 | `Promise.race([request, cancelPromise])`；超时与外部 `signal` 都走同一 `cancel()`（先 `abort()` 再结算降级） |
| 200 判定 | 602–621 | `response.ok===true` 且 JSON 合法；合法枚举 → `route`；未知/缺失 → `fallback` |
| 清理 | 622–635 | `finally` 清预算计时器、移除外部 abort 监听；清理自身异常也被吞掉 |
| 最外层 catch | 636–639 | 任何异常都返回 `fallback`，`resolve` 永不 reject |

`initialize/apply`、`inject: ['slots']`、`createNoopEnv`、Toast/Notifier 均未改动；`createResolver` 当前没有运行时调用方。

## 3. R 用例表

| 编号 | 场景 | 期望 | 主要断言 |
|---|---|---|---|
| R01 | 绑定窗口含两条 `turn/end` + 干扰项 | 取最后一条，`completed` | `source='binding'`；`fetch` 调用数 0；无残留计时器 |
| R01b | 绑定无 `turn/end`；`getBinding` 抛错 | 转慢路径，不抛异常 | 两次分别拿到 `route`；快照异常不阻断路由 |
| R02 | 慢路径 200，七种合法 outcome 逐一 | 原值返回 | 7 个子测试均 `source='route'`；URL/`cache:'no-store'`/`AbortSignal` 齐全；id 做 `encodeURIComponent` |
| R03 | 400 / 404 / 500 / 204 | `completed` + `fallback` | 4 个子测试；调用 1 次；计时器清零 |
| R04 | 假计时器 200 ms 预算，fetch 挂起 | `completed` + `fallback` | 199 ms 未降级；200 ms 后 `settled`；`fetch` 的 signal `aborted=true`；计时器清零 |
| R05 | fetch 抛 `TypeError` | `completed` + `fallback` | 计时器清零 |
| R06 | 200 但 `json()` 抛 `SyntaxError` | `completed` + `fallback` | 计时器清零 |
| R07 | 未知/大小写错/缺失/`null`/数组 body | `completed` + `fallback` | 5 个子测试 |
| R08 | `bridge:'off'` | 不 fetch | 无 binding 时 `fallback`；有 binding 时仍 `binding`，均 0 次 fetch |
| R09 | 8 种 reason + 5 种 aborted cause + 未知 | 与 `lib/classify.js` 一致 | 逐项比对 `outcome/reasonKind/cancelCause`；额外 12 个分支整体比对 |
| R10 | 外部 signal 已取消 / 在途取消 | `fallback`，不抛 | 已取消不 fetch；在途取消触发 `abort`、计时器清零 |

> R02 覆盖任务里写的「六种」之外还覆盖 `suppressed`：§7.4 与 §7.3 的合法集合实际是七值，多覆盖一个值不改变契约。

## 4. §4.2 / §8.4 对照

### 4.1 §4.2（推荐通道）

| 方案要求 | 落地 | 证据 |
|---|---|---|
| 快路径：已 retain 的会话读 `binding(id).eventSource` 最后一条 `turn/end`，零请求 | `outcomeFromBinding` 反向扫描 + 内联 `classify` | R01、R01b |
| 慢路径：未 retain 的会话 `GET {routePath}?sessionId=…`，预算 200 ms | `fetch` + `AbortController` + `setTimeout` 预算 | R02、R04 |
| 降级：404 / 超时 / 非 2xx → 按「任务完成」不阻塞 | 统一 `fallback()` = `{outcome:'completed', source:'fallback'}` | R03、R04、R05、R06、R07 |
| 客户端侧桥开关 `bridge:'off'` 总走启发式 | 快路径之后、fetch 之前短路 | R08 |

### 4.2 §8.4（时延预算）

| 阶段 | 方案预算 | 本轮实现/证据 |
|---|---|---|
| 结果解析：快路径 | 0 | 不建计时器、不发请求；R01 断言 `calls=0`、`clock.pending()=0` |
| 结果解析：慢路径 | ≤200 ms | 预算取自 `resolveBudgetMs`（默认 200）；R04 在 199 ms 断言未降级、200 ms 已降级；`json()` 读取也被同一预算约束 |
| 与认领窗并行 | ≤80 ms，不叠加 | resolver 内无认领逻辑；接线时由 WP6/WP8 并行发起，本单元不引入串行等待 |
| 渲染 | ≤32 ms | 不属于 resolver |
| 合计 P95 | ≤500 ms | **未做端到端测量**；resolver 自身最坏 200 ms + 微任务，未与 250 ms 观察窗、80 ms 认领窗、32 ms 渲染合测 |

## 5. 两份分类实现的一致性

`client.js` 的 `classify`（436 行起）与 `lib/classify.js`（45 行）是两份独立实现：前者受单文件客户端、无打包器约束，不能 import 宿主模块。

- 字节级语义一致：`completed/error/max-tokens/blocked/interrupted/forked` 的 `reasonKind`；`aborted` 的 `user → suppressed`、其余 cause → `stopped`、`cancelCause` 归一化；未知 kind → `ignored` + `unknown`；`reason` 为字符串/对象/缺失分别归一。
- R09 用 8 种 §7.4 reason 逐字段比对，另加 `hook/disposed/legacy`、字符串 cause、缺失 reason、未知 kind、`undefined`、`null` 共 12 个分支整体比对。任一字段漂移即红。
- 维护约束：改任一份必须同步另一份并跑 R09；R09 是防漂移的唯一门禁，不做运行时代码共享。

## 6. 测试变更与统计

### 6.1 新增/修改

- 新增 `test/resolver.test.js`：R01–R10，含子测试共 27 条。
- `test/harness.js`：vm 沙箱补真实 `AbortController`。这是补运行环境（浏览器/Node 都有的全局），不是给被测逻辑打桩；`fetch` 仍由每个用例显式注入。
- `test/smoke.test.js`：S4 增加 `createResolver`、`classify` 两个 `typeof === 'function'` 断言（用例数不变，仍为 7）。
- `README.md`：阶段、目录、测试命令、已知限制同步；不改契约字段与文案。

### 6.2 门禁命令（工作目录 `D:\DSH\DSH_end\插件\开发\task-complete-toast`）

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js
```

```text
ℹ tests 83
ℹ suites 0
ℹ pass 83
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 49.0501
EXITCODE=0
END=2026-10-26 16:49:52 +08:00
```

| 套件 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| S（smoke） | 7 | 0 | 0 |
| I（integration） | 18 | 0 | 0 |
| U（store） | 11 | 0 | 0 |
| F（format） | 6 | 0 | 0 |
| D（dismiss） | 4 | 0 | 0 |
| N（notifier） | 10 | 0 | 0 |
| R（resolver） | 27 | 0 | 0 |
| 合计 | **83** | **0** | **0** |

原有 56 条保持全绿；新增 27 条。

### 6.3 失败注入验证（两次，均已还原）

| # | 改坏的行 | 结果 |
|---|---|---|
| 1 | `client.js:539` `if (fromBinding !== undefined)` → `if (false && fromBinding !== undefined)`（跳过快路径） | R01 红：实际 `source:'fallback'`，期望 `'binding'`；同时 `fetch` 被调用 |
| 2 | `client.js:569` 超时回调里的 `cancel();` → `settleCancel(cancelled);`（超时不 abort） | R04 红：`超时必须 abort 在途请求`，`false !== true` |

两次改坏后均单独重跑对应用例确认失败，再还原；最终全量 83/83。说明 R01 守快路径、R04 守预算与 abort，不是只跑通 happy path。

## 7. U12–U14 的覆盖说明

| 原用例 | 本轮覆盖 | 说明 |
|---|---|---|
| U12 `aborted/user` → 抑制、不入队 | R09（分类为 `suppressed`）+ R02（路由值 `suppressed` 原样返回） | resolver 只负责映射，不负责丢队列；「不入队」由 store/`decide` 在 WP6 接线时消费 |
| U13 `error` → 入队，标题 `titleError` | R02（路由值 `error`）+ R09 + 既有 F 套件 `titleOf` | 「入队」同上由 store 负责，本轮不接 |
| U14 `forked` → 抑制 | R09（分类为 `ignored`）+ R02（路由值 `ignored`） | 同 U12 |

结论：三个用例的**映射部分**已由 R02/R09 覆盖；**队列抑制部分**仍属 WP2 的 `decide`/WP6 接线，本轮没有放宽或改写任何既有 U 用例。

## 8. 契约偏差与命名说明（未改 §7）

1. **测试文件名**：开发方案 §6.1 写 `test/resolve.test.js`，本次任务指定 `test/resolver.test.js`；按任务执行，§7 契约不受影响。
2. **R02「六种」**：任务原文写「六种 outcome」，但任务同段给出的合法集合与 §7.3/§7.4 均为七值（含 `suppressed`）。R02 覆盖七值，属于超集覆盖，不改变响应契约。
3. **`__test__` 清单**：§6.4 列出的 `__test__` 为 `{createStore, classify, formatLine, titleOf, createLease}`；为了测试装载，本轮实际导出 `createStore/createResolver/classify/...`。`createResolver` 是 §7.5 的正式单元，`classify` 本就在 §6.4 清单内；`createLease` 尚未实现（WP8）。这是可测性导出，不改变运行时接口。
4. **`resolveBudgetMs` 的 `json()` 读取**：方案只写「拉取预算 200 ms」。实现把预算同时覆盖响应体读取，避免 200 后 JSON 仍挂起；不改变降级结果。

未发现 §7 路由、状态码、响应字段、配置字段、文案 key 的自相矛盾，因此没有发「需决策」消息。

## 9. 未覆盖与风险

| 项 | 说明 |
|---|---|
| 真实路由 / 真实 `fetch` | 全部用伪 `fetch`；未在 Electron 渲染进程请求真实 `/dsh-task-complete/outcome` |
| 真实 200 ms | 只用假计时器验证；未测真实网络/事件循环抖动 |
| 真实 `SessionBinding` 形状 | 快路径按设计方案 §5.1 的 `{type:'event', event:{type:'turn/end', data:{reason}}}` 读取；V 系假设仍未在真实页面证实 → `[待验证]` |
| 接线 | `createResolver` 未被 `apply` 调用；`DEFAULTS` 之外的真实注入行未读取（WP6） |
| 卸载中的在途请求 | resolver 无 `disposed` 标志；WP6 必须用外部 `signal` 取消（R10 已守该路径） |
| `bridge` 只认 `'off'` | 其他值（含缺省/`'auto'`）一律按 `auto`；非法值不在 resolver 里校验，依赖客户端配置合并 |
| 认领窗并行 | 仅约定由 WP6/WP8 并行发起；本轮无并行测量 |
| 外部 signal 的生命周期 | 由调用方持有；resolver 只监听一次并在 `finally` 移除 |
| 浏览器 `AbortController` | 代码用 `typeof AbortController` 能力检测；缺失时仍会按预算降级，但不会真正中断请求（现代浏览器均存在） |
| `env.setTimeout` 缺失 | 不设预算计时器，慢路径不会自动降级；按 §6.4/任务约定 `env` 必带该函数 |

## 10. 下一步

1. **WP6 接线**：在 settle 起点并行发起 `resolve(sessionId, signal)`，把结果写回 Item（替换 `outcome:'pending'`），`ignored/suppressed` 丢弃，`error` 用 `titleError`；`disposed` 时 abort。
2. `apply` 读取 `window.__DSH_TASK_COMPLETE_TOAST__`（`DEFAULTS` ← 注入行），并用真实 `ctx.sessions.binding` / 全局 `fetch` / 计时器构造 resolver。
3. 修 D1–D4、接 locale 字典与 notifier；再做真实路由与 200 ms 预算的手测（P01/P02）。
4. WP8 补 `createLease` 与多标签认领。

## 11. 声明

本轮只交付 resolver 纯逻辑与单测。**未接 store/apply、未重启宿主、未发系统通知、未在真实页面或真实路由上观察**；83/83 仅代表本地单测夹具下的行为，不构成可用性结论。
