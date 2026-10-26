# WP1 开发记录 — 宿主半区

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | 开发方案 §6.3、§7.1、§7.3、§7.4、§8、§10.3；WP1 |
| 时间 | 2026-10-26 16:06（初版）；真机补充见 §5.3 |
| 状态 | 代码与单测完成；父代理真机确认路由与 `event.time`；**页面浮层仍未验证** |
| 测试结果 | S 套件 7/7、I 套件 18/18，共 25/25 通过，0 失败 0 跳过 |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/index.js` | 83 | 宿主装配：`inject`、`Config`、结果表、`session/event`、路由、注入行、`disposed` |
| `task-complete-toast/lib/config.js` | 194 | 零依赖 Standard Schema、默认值/范围校验、`buildClientConfig` |
| `task-complete-toast/lib/outcome-table.js` | 47 | 有界 LRU + 读时惰性 TTL |
| `task-complete-toast/lib/classify.js` | 45 | §7.4 八行映射 |
| `task-complete-toast/lib/host.js` | 107 | `readSessionId`、`sendJson`、路由处理器、`toOutcomeEntry` |
| `task-complete-toast/package.json` | 30 | `files` 增加 `lib/*.js`（exports 未改） |
| `task-complete-toast/README.md` | 82 | 更新为 WP1 阶段说明与测试命令 |
| `task-complete-toast/test/harness.js` | 313 | `parsePatch` 支持 `config`；伪宿主 ctx/req/res |
| `task-complete-toast/test/smoke.test.js` | 150 | S1/S7 随 WP1 契约更新 |
| `task-complete-toast/test/integration.test.js` | 394 | I01–I17 |

未改动：`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、profile、`app.asar`。

行数按 `[System.IO.File]::ReadAllLines().Length` 统计，不把末尾换行算成额外一行。

## 2. 契约逐条对照

### 2.1 §7.1 宿主 Config

| 字段 | 默认 | 校验 | 落地 |
|---|---|---|---|
| `enabled` | `true` | boolean | `lib/config.js` |
| `bridge.enabled` | `true` | boolean | 同上 |
| `bridge.routePath` | `/dsh-task-complete/outcome` | string、以 `/` 开头、长度 8–120 | 同上 |
| `bridge.routeKind` | `'exact'` | 枚举 `exact`/`prefix` | 同上 |
| `bridge.ringSize` | `256` | 整数 32–1024 | 同上 |
| `bridge.entryTtlMs` | `600000` | 整数 60000–3600000 | 同上 |
| `bridge.exposeReason` | `true` | boolean | 同上 |

- `undefined` 与 `{}` 都得到全套默认值；缺字段补默认；未知键忽略。
- 类型/范围错误返回 `{ issues: [{ message, path }] }`；Loader 会据此拒绝激活。
- `Config` 同时带 `type`、`properties`、`default` 描述字段，但它们只用于说明；Cordis 实际只调用 `~standard.validate`。

### 2.2 §7.3 宿主路由

| 场景 | 状态码 | 响应体 | 实现/测试 |
|---|---|---|---|
| 命中 | 200 | `{sessionId, outcome, reasonKind, cancelCause, at, seq}` | I01、I04、I05 |
| sessionId 缺失/空/超长/控制字符 | 400 | `{error:'invalid-session-id'}` | I03 |
| 未记录/已过期 | 404 | `{error:'unknown-session'}` | I02、I07、I08 |
| 非 GET | 405 | `{error:'method-not-allowed'}` + `allow:GET` | I03 |
| `exposeReason:false` | 200 | `{sessionId, outcome, at}` | I15 |

- 所有响应统一 `cache-control:no-store`、`content-type:application/json; charset=utf-8`、`x-content-type-options:nosniff`（I01/I02/I03 断言）。
- 路由只查表，不读取会话标题、路径、模型输出或工具参数。
- `kind` 与 `path` 直接取配置；I16 验证 `prefix` + 自定义 `/custom/outcome` 注册并命中。
- 路由重复注册不捕获异常：`webServer.register` 抛错即让激活失败（§6.3 边界），未在真实 webServer 上测试。

### 2.3 §7.4 turn/end 映射

| reason | outcome | reasonKind | cancelCause | 测试 |
|---|---|---|---|---|
| `completed` | `completed` | `completed` | `null` | I01 |
| `error` | `error` | `error` | `null` | I04 |
| `max-tokens` | `interrupted` | `max-tokens` | `null` | I04 |
| `blocked` | `blocked` | `blocked` | `null` | I17 |
| `interrupted` | `interrupted` | `interrupted` | `null` | I17 |
| `aborted` + `user` | `suppressed` | `aborted` | `user` | I05 |
| `aborted` + `parent`/`hook`/`disposed`/`legacy` | `stopped` | `aborted` | 对应 cause | I05 |
| `forked` | `ignored` | `forked` | `null` | I05 |

> §7.4 八行均已由 I01/I04/I05/I17 覆盖。

## 3. 契约变更采纳记录（ADR-008 / ADR-009）

### ADR-008：Config 用零依赖手写 Standard Schema

- **依据**：Cordis `resolveConfig` 执行 `runtime.Config["~standard"].validate(config)`；纯 JSON Schema 没有 `~standard`，激活会抛错。已装插件用 `@deepseek-ai/schemastery`，但本包坚持零依赖。
- **落地**：`lib/config.js` 导出 `Config`，含 `~standard.version=1`、`vendor='task-complete-toast'`、`validate`，另有 `type/properties/default` 描述字段。
- **`types` 成员**：未添加。当前 Cordis 只读取 `validate`，不读取 `types`；配置面板是否会投影字段未验证。
- **行为**：`undefined`/空对象 → 全套默认；缺字段补默认；越界/类型错 → `issues`；未知键忽略（向前兼容）。
- **代价**：默认值与范围校验由本包维护；`Config` 不是 schemastery，Loader 的 volatile 比较会走严格原始值比较（`isSchemastery` 为 false），不影响正确性，只影响“仅 volatile 字段变化”时的重载判定。

### ADR-009：注入行只投影三项

- **落地**：`buildClientConfig(config)` 返回且只返回：

  ```js
  { enabled, bridge: config.bridge.enabled ? 'auto' : 'off', routePath: config.bridge.routePath }
  ```

- I06 断言默认值下 value 深等于该对象，且键恰为 `bridge`/`enabled`/`routePath`。
- `ringSize`/`entryTtlMs`/`routeKind`/`exposeReason` 不外泄；I06b 断言 `enabled:false` 时仍注册注入行、不注册事件/路由，`bridge` 为 `off`。
- §7.2 已同步增加 `routePath`；`position` 等客户端字段仍由客户端 `DEFAULTS` 负责，宿主不投影。

## 4. 关键实现说明

- **生命周期**：三个 `ctx.effect` 分别持有 `session/event`、`webServer.register`、`webserver/index-inject`；每个清理函数都置 `state.disposed = true` 并调用底层 disposer。事件回调与注入回调先判 `disposed`。
- **结果表**：`Map` 插入顺序作为 LRU；同 `sessionId` 覆盖并刷新；容量满从最旧开始淘汰；`get` 时按 `now() - entry.at > ttlMs` 惰性过期，后台不跑定时器。
- **事件写入**：只处理 `event.type === 'turn/end'`；键为 `session.id`；`at` 取 `event.time`（epoch 毫秒），`seq` 取 `event.seq`；缺失时 `at` 用 `Date.now()`、`seq` 用 `0`。
- **路由**：`createRouteHandler` 只做方法/参数/查表/响应；不读会话内容；400 与 404 的顺序、405 的 `allow` 头与契约一致。
- **enabled:false**：仍创建表但只注册注入 effect，不注册 `session/event` 与路由。
- **错误**：配置不合法时 `apply` 抛 `TypeError`（Loader 之前也会拒绝）；路由重复由 `webServer.register` 抛出，不吞。
- **可测性选择**：纯逻辑放在 `lib/*.js` 并直接 `import` 测试；没有使用 `__test__` 导出。`package.json` 的 `files` 已加入 `lib/*.js`（本地链接安装不看 `files`，但打包会看）。

## 5. 测试

### 5.1 命令与原始统计

工作目录：`D:\DSH\DSH_end\插件\开发\task-complete-toast`

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js
```

```text
✔ I01 turn/end(completed) 写入后 GET → 200 且字段/头齐全 (1.7603ms)
✔ I02 未知会话 GET → 404 unknown-session (0.1866ms)
✔ I03 sessionId 缺失/空/超长/控制字符 → 400；非 GET → 405 (0.2103ms)
✔ I04 error 与 max-tokens 分别映射 error / interrupted (0.2015ms)
✔ I05 aborted 的 5 种 cause 与 forked 映射正确 (0.3897ms)
✔ I06 index-inject 默认投影只有 enabled/bridge/routePath (0.1894ms)
✔ I06b enabled:false 只注册注入行，bridge 投影为 off (0.1328ms)
✔ I07 TTL 过期后 GET → 404 且表项被清除 (0.1362ms)
✔ I08 表满 257 条淘汰最旧，容量保持 256 (0.2598ms)
✔ I09 Config：undefined/空对象得到全套默认值 (0.1737ms)
✔ I10 Config：数值/路径越界被拒，边界值通过 (0.2644ms)
✔ I11 Config：类型错误被拒（含 enum） (0.1557ms)
✔ I12 Config：未知键忽略且不进入归一化结果 (0.0724ms)
✔ I13 parsePatch 支持 config 缩进映射 (0.8148ms)
✔ I14 dispose 后监听与路由全部移除，注入行不再产出 (0.1909ms)
✔ I15 exposeReason:false 只回 sessionId/outcome/at (0.1393ms)
✔ I16 自定义 routePath/routeKind 透传并生效 (0.118ms)
✔ I17 blocked 与 interrupted 映射 (0.1015ms)
✔ S1 清单：名称、版本、私有、ESM 与四个导出齐全 (0.3136ms)
✔ S2 清单：dsh.bundle.patch 与 dsh.client(web/immediately/空 inject) (0.0657ms)
✔ S3 patch：insert 恰好一行宿主 entry 且 id/name 正确 (0.3543ms)
✔ S4 客户端：factory 可装载，返回 inject 与 apply (0.7809ms)
✔ S5 客户端：apply 在伪 ctx 下不抛错，只注册 shell.overlay 空占位 (0.7111ms)
✔ S6 资源：locale 只含 meta，icon 为合法且不超 256 KiB 的 SVG (0.5513ms)
✔ S7 宿主：导出 apply/inject 与 Standard Schema Config，调用不抛错 (0.3277ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27.137
EXITCODE=0
START=2026-10-26 16:06:22 +08:00
END=2026-10-26 16:06:22 +08:00
```

| 套件 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| S（smoke） | 7 | 0 | 0 |
| I（integration） | 18 | 0 | 0 |
| 合计 | **25** | **0** | **0** |

补充：直接运行 `node --test --test-isolation=none`（不加文件名）会把 `test/harness.js` 当作零断言测试文件计入（比显式命令多 1 项）；真正的用例是 S1–S7 + I01–I17 共 25 条。报告以上面的显式命令为准。

### 5.2 测试方式与理由

- **伪 req/res，而非进程内 HTTP server**：路由处理器是真实注册到 `webServer.register` 的同一个函数；用伪 `IncomingMessage`/`ServerResponse` 直接调用，能精确断言状态码、响应头、JSON 体与调用次数，不依赖端口/网络，也不会在受限沙箱里引入额外不稳定因素。被测的路由逻辑没有被 mock。
- **伪宿主 ctx**：`ctx.effect` 执行注册并收 disposer，`ctx.on` 记录监听，`webServer.register` 记录路由；`host.emit` 触发监听，`disposeAll` 触发清理。这样能覆盖装配顺序、`enabled:false` 分支、注入行与 dispose（I14），不 mock 被测逻辑。
- **假时钟**：结果表接受 `now` 参数，I07/I08 用注入时钟验证 TTL 与容量，不 sleep。
- **事件时间贴近当前时间**：TTL 按 `event.time` 计算，I01/I04/I05/I17 使用 `Date.now()` 作为事件时间，避免测试夹具本身制造“立即过期”。

### 5.3 真机补充（父代理实测，2026-10-26）

以下由父代理在真实宿主上取得，不是本代理执行：

- 路由**不重启即生效**：安装/启用后直接可请求。
- `GET` 未知 id → 404 `{"error":"unknown-session"}`。
- `POST` → 405 + `allow: GET`。
- 无 `sessionId` → 400。
- 三安全头齐全（`no-store`、`nosniff`、`application/json; charset=utf-8`）。
- 200 实测：`at=1793002859374`、`seq=974`，证明真实 `event.time` 是 **epoch 毫秒**；TTL 风险解除。

## 6. 未覆盖项与原因

| 项 | 原因 |
|---|---|
| 重启后宿主激活、真实 `ctx.effect`/`ctx.on`/`webServer.register` 接线 | 部分已由父代理真机确认：路由不重启即生效；其余 effect 细节未逐项观察 |
| 真实路由是否被鉴权/fallback 拦截（V-4） | 已由父代理真机确认 200/400/404/405 直达，未被拦截 |
| `session/event` 的真实事件形状与 `event.time` 语义 | 已由父代理真机确认 200 的 `at=1793002859374`（epoch 毫秒）、`seq=974` |
| `Config` 在配置面板的投影/编辑 | 手写 Standard Schema 不是 schemastery；面板是否显示字段未验证 |
| `webServer.register` 重复路径导致激活失败 | 需要真实 webServer 上注册冲突路径；当前只验证了正常注册 |
| `prefix` 的真实前缀分发 | I16 只验证注册参数与处理器直调，未经过真实 webServer 路由匹配 |
| 客户端 WP2+（状态机、结果桥拉取、卡片、通知、多标签） | 不在 WP1 范围 |

## 7. 风险与遗留

1. ~~**TTL 依赖 `event.time` 的单位**~~：已由父代理真机确认 `at=1793002859374` 为 epoch 毫秒，TTL 风险解除。
2. **Config 非 schemastery**：Cordis 只读 `~standard.validate`，激活没问题；但配置面板能否投影字段未验证，且 Loader 的 volatile 比较会走严格原始值比较。
3. **路由重复注册**：按 §6.3 让 `webServer.register` 抛错，插件激活失败；没有捕获或降级，这是有意为之，需在真实环境验证可见错误。
4. **`apply` 二次校验**：Loader 已校验，`apply` 再校验一次；对合法配置无副作用，对直接调用者能 fail fast。
5. **路由处理器无 `disposed` 守卫**：依赖 `webServer.register` 返回的 disposer 在卸载时移除路由；事件回调与注入回调已有 `disposed` 守卫。
6. **客户端未做页面验证**：宿主路由已由父代理真机确认不重启生效；客户端渲染、自动消失与通知仍需重启页面/宿主后验证。

## 8. 下一步

1. ~~**重启宿主后验证 Host**~~：父代理已在真实宿主确认 200/400/404/405、响应头与 `allow: GET`；`exposeReason:false`/`enabled:false` 仍建议在页面验证。
2. ~~**读取真实 `turn/end` 时间**~~：已确认 `event.time` 为 epoch 毫秒（`at=1793002859374`、`seq=974`）。
3. **检查 Config 面板**：确认手写 Standard Schema 能被配置面板识别；若不能，记录限制，不擅自改契约。
4. 进入 **WP2 客户端 Store**：按 §8 状态机与 U01–U11 先写假时钟用例，再实现。
5. 在 WP6 接入客户端配置时，消费 ADR-009 的三项投影，并保持 `DEFAULTS` 兜底。

## 9. 声明

宿主半区代码与单测完成；父代理已在真实宿主确认路由与 `event.time`，但**页面浮层、配置面板与客户端能力仍未验证**。本记录不包含可用性结论。
