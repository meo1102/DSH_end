# DSH「任务完成」提示插件 v1.1 开发方案

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.1-Plan A（实施层方案） |
| 日期 | 2026-10-26 |
| 上游设计 | `DSH任务完成提示插件-设计方案.md` v0.3（2026-10-25） |
| 目标产物 | 持久化插件包 `@local/task-complete-toast` `1.1.0` |
| 目标环境 | 当前安装的 DSH Desktop；P0 当前 Web GUI 为 `http://127.0.0.1:62714`（历史取证 26529） |
| 本文性质 | 开发计划 + 接口契约 + 测试设计 + 代码审查方案；**不含可执行代码** |
| 执行方 | 开发代理负责实现、自测、安装、验收取证；本文档作者只做设计与评审 |

> **P0 环境对齐（2026-10-26 21:10）**：当前实例 Web GUI 为 `http://127.0.0.1:62714`，插件已在 `desktop` profile 安装并启用；文中 `26529`/`55406` 为历史取证端口。剩余工作编号以 [`P0-接手基线与环境对齐.md`](P0-接手基线与环境对齐.md) 的 R1–R5 为准（本文 WP7/WP8/WP9 与交接文档的 WP7/WP8/WP9 含义不同）。
>
> **P1 裁决（2026-10-26 21:15）**：见 [`P1-设计裁决与验收基线.md`](P1-设计裁决与验收基线.md)。Q1–Q6 已裁决；R2 多标签纳入 v1.1；状态行固定 `statusIdle`；ADR-013 离场计时（移出重新 5 s）；验收基线改为「109/109 基线 + R2 新增 + V01–V28 + P01–P05 + C01–C36」。

> 定位说明：v0.3 回答「做什么、为什么」；本文回答「怎么拆、按什么契约写、怎么测、怎么审」。凡与 v0.3 冲突处以本文 §4 的修订项与附录 B 为准，且每条修订都写明理由与影响。

---

## 0. 一页速览

**一句话**：把 v1.1 拆成 10 个工作包（约 9.5 人日），核心改动是把「宿主推送结果」改成「**宿主记录 + 客户端按需拉取**」，从而绕开 SSE 鉴权、断线补发与多标签扇出这三个高风险点。

**决策摘要（8 条）**

1. **完成判定仍只看 Agent 空闲**：`api-session/status` 的 `running: true → false`，250 ms 观察窗，口径不变。
2. **结果桥改为拉模式**：宿主把 `turn/end` 记进有界内存表，客户端在判定瞬间 `GET` 一次；不建长连接（见 ADR-001）。
3. **状态采集放在 `apply`，不放在组件**：用 `ctx.remote.$on` 与 `ctx.sessions.list` 订阅，组件只订阅 store；避免 hook 只能活在渲染树里的限制（ADR-002）。
4. **基线来自 `sessions.list` 的 `phase`**：`pending` 阶段的首个 `running: false` 只记基线不弹窗，防重连误报（ADR-003）。
5. **标题由结果桥纠正，不由结果桥触发**：拉取失败/404 时按启发式退化为「任务完成」，最坏情况与 v1 等价（ADR-004）。
6. **多标签用 80 ms 认领窗去重**：最小 `tabId` 胜出，无需常驻 leader，也无须存储（ADR-005）。
7. **配置单一真源在宿主**：`Config` → `webserver/index-inject` 的 `global` 行 → 客户端读取；客户端只保留兜底默认值（ADR-006）。
8. **客户端保持单文件**：无构建步骤，纯函数通过 `__test__` 测试钩子暴露，用 Node 测试驱动验证（ADR-007）。

**关键数字**

| 项 | 值 |
|---|---|
| 工作包 | WP0–WP9，共 10 个 |
| 估算 | 9.5 人日（不含需求方验收等待） |
| 代码文件 | 宿主 1 + 客户端 1 + 清单 2 + locale 2 + 图标 1 |
| 测试 | 单测 20、集成 8、手测 26、性能 5 |
| 审查项 | 36 条（C01–C36：主干 32 + 性能/可测性 4） |
| 决策门 | G1（契约钉住）、G2（宿主可测）、G3（客户端可测）、G4（安装验收） |
| 性能目标 | 空闲 → 提示 P95 ≤ 500 ms；桥接最坏额外 ≤ 200 ms |

---

## 1. 背景、目标与非目标

### 1.1 背景

v0.3 已确认产品口径与总体架构（`shell.overlay` 浮层 + Web Notification 兜底），并给出 v1.1 的方向：用宿主 `turn/end` 修正标题。但 v0.3 的实现层仍有三处未定，直接开工会产生返工：

- 宿主到客户端的**结果通道**只写了 SSE 一种，未评估鉴权与重连成本；
- 客户端状态源在文档里有两种写法（`ctx.sessions.list` 与 `useSessionStatus`），未定主次；
- 没有文件级分工、没有可判定的测试用例、没有审查门禁。

### 1.2 目标

| 编号 | 目标 |
|---|---|
| G-1 | 交付一个可安装、可禁用、可回滚的持久化插件包，功能覆盖 v0.3 的 F1–F10 |
| G-2 | 结果桥在「后台会话（未 retain）」上也能区分完成/失败/中断/用户取消 |
| G-3 | 最小化场景下系统通知必达（权限允许时），拒绝时恢复窗口补弹 |
| G-4 | 每个功能点有可自动化的测试用例；每个工作包有明确 DoD |
| G-5 | 代码审查可执行：36 条清单 + 4 道门禁 + 缺陷分级 |

### 1.3 非目标

- 托盘气泡、任务栏闪烁、声音。
- 应用完全退出后的提示（需宿主进程级方案，v0.3 方案 C）。
- 通知历史中心、按会话静音、免打扰时段。
- zh/en 之外的语言包。
- 新增任何第三方运行时依赖、任何前端构建链。

### 1.4 约束

| 类型 | 约束 |
|---|---|
| 插件形态 | 只能是 workspace bundle：`package.json` + `cordis.patch.yml` + 宿主 `index.js` + 客户端 `client.js` |
| 改动范围 | 不改 `app.asar`、不改 profile 的 `package.json`/`cordis.patch.yml`、不改 DSH 源码 |
| 客户端形态 | 单个 `client.js`，`window.__ModuleLoader__.load`，React 由模块表提供，无打包 |
| 宿主形态 | `export function apply(ctx, config)`，资源全部 `ctx.effect`/`ctx.on` 注册并返回清理 |
| 数据 | 不写会话日志、不新增会话事件类型、不落盘用户内容 |
| 安装 | 只能由开发代理用 `plugin_manager install_bundle` 执行 |

---

## 2. 验收标准

### 2.1 可度量验收

| 编号 | 指标 | 判定方式 |
|---|---|---|
| A-1 | 完成 → 首帧可见 P95 ≤ 500 ms，P99 ≤ 800 ms | 20 次真实任务打点，`performance.now()` 差值 |
| A-2 | 结果桥拉取超时预算 200 ms，超时不影响弹窗 | 注入延迟路由（本地代理桩）验证 |
| A-3 | 后台会话用户取消（`aborted/user`）不弹窗，成功率 100% | V23 手测 + I05 集成 |
| A-4 | 最小化且权限 `granted` 时通知到达率 100% | V13 连续 10 次 |
| A-5 | 明细行格式匹配 `^.+\[.+\] · (待执行\|执行中\|等待回答\|等待审批\|Idle\|Running\|Awaiting answer\|Awaiting approval)$` | V03 脚本化检查 |
| A-6 | 插件包运行时体积 < 60 KB（不含图标与测试） | 目录合计 |
| A-7 | 100 次完成后监听器数恒定（1 个 `$on` + 1 个 list 订阅 + 1 条路由） | P04 |
| A-8 | 禁用插件后无计时器、无监听、无控制台报错 | V25 + 断点检查 |
| A-9 | 自动化基线 109/109（R2 后新增用例全绿）、手测 V01–V28 通过 | 测试报告 |
| A-10 | 审查 36 条全部勾选，无未决 P1/P2 缺陷 | 评审记录 |

### 2.2 需求追溯矩阵

| 需求（v0.3） | 工作包 | 测试 |
|---|---|---|
| F1 完成判定 | WP2 | U02–U07、V02、V08 |
| F2 文案格式 | WP3 | U15、V03、V04 |
| F3 完成标题 | WP5 | U12–U14、I04–I05、V22、V23 |
| F4 位置 | WP3 | V15 |
| F5 自动消失 | WP3 | U07、V02 |
| F6 可回溯 | WP3/WP4 | V07、V13 |
| F7 多会话 | WP2/WP3 | U07、V10 |
| F8 不误报 | WP2 | U01、U04–U06、U11、V11 |
| F9 最小化仍提示 | WP4 | I06、V13、V14 |
| F10 语言跟随 | WP6 | U16、V17、V18、V24 |

---

## 3. 现状与证据

### 3.1 核对范围

本次核对在**当时的当前安装版本**上执行（2026-10-26，Web GUI `http://127.0.0.1:26529`；P0 当前实例为 `http://127.0.0.1:62714`），手段为 `cordis_inspect_query` 与已安装包源码。v0.3 标注的 `0.2.1-rc.3` / `55406` 已过期，其 API 结论不能直接沿用，逐条复核见附录 A。

### 3.2 证据表

| 编号 | 结论 | 证据 | 备注 |
|---|---|---|---|
| E1 | `shell.overlay` 是 `list` / `root` 插槽，注册需 `id`，可选 `order`、`label` | Client `Slots.listSubTree(root:"shell.overlay")` | 现有 11 个占位者，含 4 个 toast 类 |
| E2 | 浮层整体 click-through，条目自行恢复指针事件 | 同 E1 的 catalog 文本 | 卡片必须 `pointer-events:auto` |
| E3 | `shell.overlay` 标准 props 含 `useSessions`、`useSessionStatus`、`useWorkspaces`、`useSessionRetainInfo`、`useSessionAccess`、`useWorkspaceAccess`、`useRemoteAccess`、`useResource`、`usePanelInfo` | 同 E1 的 `standardProps` | 名称解析走 props，判定不走 |
| E4 | `turn/end` 的 `reason` 是 7 元联合：`completed`、`aborted{reason}`、`blocked`、`error{error}`、`max-tokens`、`interrupted`、`forked` | Host `Event.listEvents("session/event")` 的 `TurnEndReasonMap` | `aborted.reason` 为 `user`/`parent`/`hook{reason}`/`disposed`/`legacy` |
| E5 | `session/event` 为 `emit`、提交后触发、观察者异常被隔离、按作用域过滤 | 同上 | 适合只做有界记录，不做重扫 |
| E6 | `webserver/index-inject` 为 `emit`，监听者向可变表追加行，行类型含 `{kind:'global', name, value}` | Host `Event.listEvents("webserver/index-inject")` | 配置注入的官方口子 |
| E7 | `webServer.register({kind, path, handler})` 返回 disposer，重复 `(kind,path)` 抛错；`handler(req,res)` | Host `Service.listService("webServer")` | `kind` 为 `exact` / `prefix` |
| E8 | `ctx.remote.$on("api-session/status", (id, running) => …)` 返回 disposer | `@deepseek-ai/dsh-client-ui-session/lib/client.js:814-816` | 官方同款消费方式 |
| E9 | `ctx.sessions.list` 是 ObservableSnapshot：`{phase:'pending'\|'ready', ids, byId}`，行含 `running`、`retainedBy.mainView` | 同文件 915–975 | 未在 Service 目录声明，按内部面使用；本方案只依赖 `phase` 与 `byId` 的存在性 |
| E10 | 客户端 `locale` 服务：`register(ns,locale,dict)`、`bind(ns)`、`getSnapshot/subscribe`、回退链 | Client `Service.listService("locale")` | 纯 JS 用三参非类型化形式 |
| E11 | `ctx.uiWorkspace.openSession(target): void` | Client Service 目录 | 点击回跳 |
| E12 | 客户端事件目录只有 `connection/reset`、`locale/change`、`slots/changed`、`theme/change` | Client `Event.listEvents` | 运行状态必须走 `remote` |
| E13 | `ctx.remote` 不是目录中的 Client Service，是 Context 成员；`inject` 里要写 `'remote'` | Client Service 目录 + E8 的 `inject` 数组 | 写进 `inject: ['remote']` |

### 3.3 未能证实、需在 WP0 钉住的点

| 编号 | 待证 | 若证伪的替代 |
|---|---|---|
| V-1 | `byId[id].title` 存在且为会话标题 | 用 `retainInfo`/`binding` 快照的标题，或只显示「未命名会话」 |
| V-2 | `byId[id]` 上有子代理标记 | 关闭子代理过滤，接受噪音并在文档标注 |
| V-3 | `useWorkspaces()` 快照形状（`byId`/数组、`sessionIds` 字段） | 遍历数组按 `sessionIds.includes(id)` 反查 |
| V-4 | 自注册路由是否被连接层鉴权拦截 | 改 `prefix` 或改走 SSE（ADR-001 的降级路径） |

> 这 4 项都是「读一次 d.ts / 发一次请求」就能定的，安排在 WP0，不阻塞 WP1 之后的排期。

---

## 4. 方案选型：宿主 → 客户端的结果通道

### 4.1 候选对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **S1** Remote 事件 | 宿主注册自定义远程事件，客户端 `$on` 订阅 | 复用既有 RPC，零新增鉴权、自动重连 | 需要 Typert schema 与代码生成，纯 JS 包难以自证；跨版本风险最高 | ⚠️ 可行则最优，但不作基线 |
| **S2** 按需拉取 | 宿主只记录，客户端判定瞬间 `GET` 一次 | 无长连接生命周期、无补发/丢事件问题、`fetch` 可加请求头、易测 | 每次完成多一个本机请求（约 1–3 ms） | ✅ **推荐基线** |
| **S3** SSE 长连接 | v0.3 原案：`text/event-stream` 广播 | 推送即时、天然多客户端扇出 | `EventSource` 不能带请求头，鉴权只能靠 Cookie；断线重连、补发、页面隐藏节流都要自建 | ⚠️ 备选，S2 不通时启用 |
| **S4** 否决 | 客户端轮询宿主、读 `document.title`、宿主写会话日志、抓 DOM | 看似省事 | 违反零轮询、不改源码、不写日志、不读他人 DOM 四条硬约束 | ❌ 否决 |

### 4.2 推荐：S2 + 本地快路径

- **快路径**：会话已被 retain（通常是当前打开的会话）时，直接读 `binding(id).eventSource` 的最后一条 `turn/end`，零请求。
- **慢路径**：未 retain 的后台会话，`GET {routePath}?sessionId=…`，预算 200 ms。
- **降级**：404 / 超时 / 非 2xx → 按启发式给「任务完成」，不阻塞弹窗。

### 4.3 为什么改掉 v0.3 的 SSE

| 维度 | SSE | S2 |
|---|---|---|
| 鉴权 | 只能 Cookie；URL 带令牌的方案下不可用 | 每次请求可控，未来可加头 |
| 连接生命周期 | 需处理重连、`Last-Event-ID` 补发、页面隐藏节流 | 无 |
| 多标签 | 每个标签一条连接，扇出放大 | 各拉各的，天然幂等 |
| 失败影响 | 连接断 → 全部丢结果 | 单次失败 → 单条退化 |
| 实现量 | 路由 + 心跳 + 客户端状态机 | 路由 + 一次 `fetch` |

> 代价：每次完成多一次本机请求。按 6 次/分钟的节流上限，代价可忽略。

---

## 5. 总体架构

### 5.1 组件图

```text
┌───────────────────────── DSH Desktop（Electron） ─────────────────────────┐
│                                                                          │
│  Host（Node）                                  Renderer（Web GUI）        │
│  ┌──────────────────────────────┐              ┌───────────────────────┐  │
│  │ AgentLoop                    │              │ client.js             │  │
│  │  └ api-session/status ───────┼──remote─────▶│  Store（纯状态机）     │  │
│  │                              │              │   ├ 基线/观察窗/冷却   │  │
│  │ index.js                     │              │   ├ 队列/上限/补弹     │  │
│  │  ├ session/event(turn/end)   │              │   └ 认领（BC）         │  │
│  │  │    └ 有界结果表 ──────────┼──HTTP GET───▶│  Resolver（快/慢路径） │  │
│  │  └ webServer 路由            │   (S2)       │  ToastHost（overlay）  │  │
│  │      └ index-inject 配置行 ──┼──页面加载───▶│  Notifier（系统通知）  │  │
│  └──────────────────────────────┘              └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 三条数据链

**链 A — 判定（决定「有没有完成」）**

1. Agent 起停 → 宿主发 `api-session/status(sessionId, running)`。
2. 客户端 `$on` 收到 → store 更新该会话状态。
3. `true → false` → 进入 250 ms 观察窗。
4. 观察窗内回弹或出现待发送消息 → 取消。
5. 观察窗结束 → 进入判定 → 队列。

**链 B — 结果（决定「完成还是失败」）**

1. 宿主 `session/event` 收到 `turn/end` → 写入有界表（按会话覆盖）。
2. 客户端判定时：已 retain → 读本地 `eventSource`；否则 `GET` 一次。
3. 映射为 `completed | error | interrupted | blocked | stopped | ignored`。
4. `ignored`（forked）与 `aborted/user` 直接抑制；超时/404 → `completed`。

**链 C — 呈现（决定「在哪弹」）**

1. 入队 → 80 ms 认领窗（多标签去重）。
2. 页面可见 → `shell.overlay` 渲染卡片；鼠标移入取消计时，移出后重新 5 s（ADR-013）。
3. 页面不可见 → 系统通知；拒绝/异常 → 进 `deferred`，恢复可见时补弹。
4. 点击 → `window.focus()` + `uiWorkspace.openSession(id)`。

### 5.3 职责边界

| 组件 | 负责 | 明确不负责 |
|---|---|---|
| `index.js`（宿主） | 记录 `turn/end`、暴露只读路由、注入配置行、生命周期清理 | 判定完成、渲染、发通知 |
| `Store` | 状态机、基线、去重、节流、队列、认领 | 名称解析、DOM、通知 |
| `Resolver` | 快路径回溯、慢路径拉取、结果映射、超时 | 决定是否弹 |
| `ToastHost` | 注册插槽、名称解析、卡片渲染、错误边界 | 业务语义 |
| `ToastCard` | 文案格式、动画、a11y、点击/关闭 | 状态判定 |
| `Notifier` | 权限、可见性、发送、点击回跳、补弹 | 决定是否算完成 |

---

## 6. 文件与模块分解

### 6.1 目标包结构

```text
task-complete-toast/
├─ package.json          # 清单：bundle.patch + dsh.client + 导出
├─ cordis.patch.yml      # 插入一行宿主 entry
├─ index.js              # 宿主半区（结果表 + 路由 + 配置注入）
├─ client.js             # 客户端半区（store + resolver + 视图 + 通知 + 测试钩子）
├─ locale/zh.json        # 仅插件元数据 meta
├─ locale/en.json
├─ icon.svg
├─ README.md
└─ test/                 # 不随包发布，仅本地跑
   ├─ harness.js         # 用 vm 装载 client.js，取 __test__
   ├─ store.test.js
   └─ resolve.test.js
```

> `files` 只列运行时文件；本地目录安装是链接形式，测试目录不会被 `files` 过滤掉，但也不会被加载。

### 6.2 工作包与文件映射

| WP | 交付 | 主要文件 | 人日 | 依赖 |
|---|---|---|---|---|
| WP0 | 契约钉住报告 `*-契约验证.md` | — | 0.5 | 无 |
| WP1 | 宿主半区 | `index.js`、`cordis.patch.yml`、`package.json` | 1.0 | WP0（V-4） |
| WP2 | Store 与判定 | `client.js`（store 段） | 1.5 | WP0（V-1/V-2） |
| WP3 | 渲染层 | `client.js`（视图段）、`icon.svg` | 1.5 | WP2 |
| WP4 | 系统通知与补弹 | `client.js`（notifier 段） | 1.0 | WP3 |
| WP5 | 结果桥接入 | `client.js`（resolver 段）、`index.js` | 0.5 | WP1、WP2 |
| WP6 | i18n 与配置 | `client.js`（i18n/config 段）、`locale/*.json` | 0.5 | WP1、WP3 |
| WP7 | 测试与自测 | `test/*`、手测记录 | 1.5 | WP2–WP6 |
| WP8 | 评审与修复 | — | 1.0 | WP7 |
| WP9 | 安装与验收取证 | — | 0.5 | WP8 |

> R2 多标签原为 §6.7 的编码步骤 8，不在 WP0–WP9 的 WP 编号内；P1 已将其纳入 v1.1，排在 R1a 后、R1b 前（见 [`P1-设计裁决与验收基线.md`](P1-设计裁决与验收基线.md) §6）。

### 6.3 宿主 `index.js`

**职责**：只做三件事，且全部幂等可清理。

**内部结构（按顺序）**

| 单元 | 单行签名 | 说明 |
|---|---|---|
| `Config` | 零依赖手写 Standard Schema（`~standard.validate`）+ `type/properties/default` 描述字段 | 见 §7.1；Cordis 只调用 `Config["~standard"].validate`，纯 JSON Schema 会在激活时抛错（ADR-008） |
| `createOutcomeTable(limit, ttlMs, now)` | `→ { put(entry), get(sessionId), size() }` | 有界 LRU + 读取时惰性过期 |
| `classify(reason)` | `→ { outcome, reasonKind, cancelCause }` | 纯函数，映射表见 §7.4 |
| `readSessionId(req)` | `→ string \| undefined` | 只接受 `?sessionId=`，长度 ≤ 200，拒绝控制字符 |
| `sendJson(res, status, body, extraHeaders)` | `→ void` | 统一 `no-store`、`nosniff` |
| `apply(ctx, config)` | `→ void` | 装配三个 effect |

**算法（按序）**

1. 解析并合并默认配置；`enabled === false` 时只注册配置注入行，不注册事件与路由。
2. `ctx.effect` 注册 `session/event` 监听：仅当 `event.type === 'turn/end'` 时写入表；写入键为 `session.id`；表满时淘汰最旧。
3. `ctx.effect` 注册路由：`kind` 取配置（默认 `exact`），`path` 取配置；处理器只做「查表 → 200 / 404 / 400」，不做任何会话内容读取。
4. `ctx.effect` 注册 `webserver/index-inject` 监听：向 `table` 追加 `{kind:'global', name:'__DSH_TASK_COMPLETE_TOAST__', value: 公开配置子集}`。
5. 三个 effect 的清理函数分别注销监听与路由。

**边界与失败**

- 路由路径冲突：`webServer.register` 抛错 → 让激活失败（可见错误优于静默降级）；配置里改 `routePath` 即可。
- `session/event` 在插件卸载后仍可能已入队回调：处理器先判 `disposed` 标志。
- 表项过期：`get` 时判断 `now - at > ttlMs` 返回未命中，后台不跑定时器。

### 6.4 客户端 `client.js`

**顶部结构（模块内分区，顺序即阅读顺序）**

| 分区 | 单行签名 | 说明 |
|---|---|---|
| `zh` / `en` | 常量对象 | 见 §7.6 |
| `DEFAULTS` | 常量对象 | 见 §7.2；仅兜底 |
| `createStore(env, config)` | `→ StoreApi` | 纯逻辑，`env` 注入 `now/setTimeout/clearTimeout/list/subscribeStatus/getBinding` |
| `createResolver(env, config)` | `→ { resolve(sessionId, signal) }` | 快路径 + 慢路径 |
| `createLease(tabId, channel, windowMs)` | `→ { claim(sessionId) }` | 80 ms 认领 |
| `createNotifier(env, t, config)` | `→ { notify(item), onVisible(), dispose() }` | 系统通知与补弹 |
| `formatLine(t, workspace, session, status)` | `→ string` | 纯函数 |
| `titleOf(t, outcome)` | `→ string` | 纯函数 |
| `ToastHost` | 组件 | 订阅 store、解析名称、渲染 |
| `apply(ctx)` | `→ void` | 装配 |
| `__test__` | `{ createStore, classify, formatLine, titleOf, createLease }` | 仅供 Node 测试装载，不参与运行时 |

**`apply` 步骤（按序）**

1. 读配置：`window.__DSH_TASK_COMPLETE_TOAST__`，与 `DEFAULTS` 浅合并；缺省即兜底。
2. `ctx.effect` 注册 zh/en 字典；失败只记警告，不阻断其他能力。
3. `createStore`，`ctx.effect` 启动：订阅 `ctx.sessions.list`、`ctx.remote.$on('api-session/status')`、`ctx.on('connection/reset')`；清理时清所有计时器与队列。
4. `ctx.effect` 注册 `shell.overlay` 占位：`{id:'task-complete-toast', order:100, label: () => t('meta.title')}`。
5. 注册 `visibilitychange`/`focus`/`blur`/`pagehide` 监听（`ctx.effect`），驱动 `Notifier.onVisible()`。

**性能与资源约定**

- 全插件只有 1 个 `$on`、1 个 list 订阅、1 个 `connection/reset`、1 条路由、最多 1 个 `BroadcastChannel`。
- 每个会话最多 1 个 settle 计时器；`dismiss`、`connection/reset`、卸载时清空。
- 不做任何轮询；不遍历会话日志；不读其他插件 DOM。

### 6.5 `ToastHost` 渲染层

**输入**：`props.useWorkspaces`（形状见 V-3）、store 快照。
**输出**：固定定位容器 + 若干 `ToastCard` + 一个内联 `<style>`。

**步骤**

1. 用 `useSyncExternalStore` 订阅 store 快照与 `ctx.locale` 快照。
2. 每次渲染把 store 条目映射为展示模型：`{key, title, line, tone, at}`。
3. 名称解析：先按 `sessionIds` 找工作区 `title`，空则取 `path` 末段，再空则回退文案；会话名取 `byId[id].title`，空则回退。
4. 渲染顺序：按 `at` 升序，视觉上最新在下；容器 `pointer-events:none`，卡片 `pointer-events:auto`。
5. 单个卡片包错误边界：组件抛错只吞掉该卡并在控制台留一条记录，不让 overlay 整体空白。

**视觉与 a11y 规格**

| 项 | 规格 |
|---|---|
| 容器 | `position:fixed; bottom:24px; display:flex; flex-direction:column; gap:8px; pointer-events:none`；`bottom-right` 取 `right:24px`，`bottom-left` 镜像为 `left:24px` |
| 卡片 | `width:360px; max-width:calc(100vw - 48px); padding:12px 14px; border-radius:12px; pointer-events:auto` |
| 背景/描边 | `var(--dsw-alias-bg-overlay)` / `1px solid var(--dsw-alias-border-l1)` |
| 标题/明细 | `13px/1.45 600 var(--dsw-alias-label-primary)` / `12px/1.4 400 var(--dsw-alias-label-secondary)` |
| 状态色 | 成功 `var(--dsw-alias-state-success-primary)`；失败 `var(--dsw-alias-state-error-primary)` |
| 文案 | 两行：标题 + `{工作区}[{会话}] · {状态}`；`showTitle:false` 只留第二行 |
| 截断 | 单行 `nowrap + ellipsis`；完整文本进 `title` 与 `aria-label` |
| 动效 | 进入 `translateY(6px)→0` + 淡入 160 ms；退出 120 ms；`prefers-reduced-motion` 只保留透明度 |
| 消失计时 | 出现起 `durationMs`（默认 5 s）；鼠标移入/焦点进入取消；移出/失焦后**重新完整 5 s**（ADR-013） |
| 语义 | 容器 `role="status"`、`aria-live="polite"`；关闭按钮有可访问名称；Esc 关闭最新一条（视觉最下，见 ADR-010） |

> 样式以 React 元素内联注入（卸载即移除），不写 `document.body`，不引外部 CSS 文件。

### 6.6 `Notifier`

| 步骤 | 说明 |
|---|---|
| 1 | 判定是否走系统通知：`always`，或 `auto` 且 `visibilityState!=='visible' \|\| hidden \|\| !hasFocus()` |
| 2 | `Notification` 不存在或 `permission==='denied'` → 直接进 `deferred` |
| 3 | `default` 时只在页面可见且由用户手势触发才申请，不在隐藏时申请 |
| 4 | 发送：标题 `titleOf`，正文与浮层第二行完全一致，`tag='dsh-task-'+sessionId+'-'+item.key`（**每条唯一**，ADR-014），`renotify:false` |
| 5 | `onclick`：`window.focus()` → `openSession` → `close()` |
| 6 | 异常或构造失败 → 进 `deferred`，恢复可见时补弹并清空该条 |
| 7 | `dispose`：移除监听、关闭已发通知（尽力而为） |

### 6.7 编码顺序与提交粒度

| 序 | 内容 | 完成即具备的能力 | 建议提交粒度 |
|---|---|---|---|
| 1 | 清单 + 空 `apply` + 空插槽占位 | 可安装、可禁用、可回滚 | 1 次 |
| 2 | 宿主结果表 + 路由 + 注入行 | I01–I08 可跑 | 1 次 |
| 3 | store 纯函数（基线/观察窗/冷却/队列） | U01–U11 可跑 | 1–2 次 |
| 4 | 解析器与结果映射 | U12–U14、I04–I05 可跑 | 1 次 |
| 5 | 视图与样式 | V01–V07 可看 | 1–2 次 |
| 6 | 通知与补弹 | V13–V14 可验 | 1 次 |
| 7 | i18n 与配置读取 | V17–V18 可验 | 1 次 |
| 8 | 多标签认领（R2，P1 纳入 v1.1） | U19、V21 可验 | 1 次 |
| 9 | 离场计时（ADR-013） | D05–D08、V28 可验 | 1 次 |

> 第 1 步就要能装上并干净禁用，后续每一步都不破坏「可禁用」这条底线。

---

## 7. 接口契约

### 7.1 宿主 `Config`

| 字段 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `enabled` | boolean | `true` | — | 关时只注入配置行 |
| `bridge.enabled` | boolean | `true` | — | 关时客户端总走启发式 |
| `bridge.routePath` | string | `/dsh-task-complete/outcome` | 以 `/` 开头，长度 8–120 | 冲突时改这里 |
| `bridge.routeKind` | `'exact' \| 'prefix'` | `'exact'` | — | `exact` 足够 |
| `bridge.ringSize` | number | `256` | 32–1024 | 结果表容量 |
| `bridge.entryTtlMs` | number | `600000` | 60000–3600000 | 结果表 TTL |
| `bridge.exposeReason` | boolean | `true` | — | 关时响应只含 `outcome` |

### 7.2 客户端配置（注入行的值）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 总开关 |
| `routePath` | string | `/dsh-task-complete/outcome` | 与宿主 `bridge.routePath` 一致，客户端据此发 `GET`（ADR-009） |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | 浮层位置 |
| `maxVisible` | number | `3` | 1–5 |
| `durationMs` | number | `5000` | 自动消失 |
| `minRunMs` | number | `1500` | 短任务不弹 |
| `coalesceMs` | number | `250` | 观察窗 |
| `cooldownMs` | number | `3000` | 同会话去重 |
| `showTitle` | boolean | `true` | 是否显示第一行 |
| `systemNotification` | `'auto' \| 'always' \| 'never'` | `'auto'` | 见 §6.6 |
| `suppressWhenFocused` | boolean | `false` | `true` 时窗口聚焦且有焦点则整体不弹（浮层与通知都不发） |
| `maxPerMinute` | number | `6` | 风暴保护 |
| `resolveBudgetMs` | number | `200` | 拉取预算 |
| `claimWindowMs` | number | `80` | 多标签认领窗 |
| `bridge` | `'auto' \| 'off'` | `'auto'` | 客户端侧桥开关 |

**注入行契约**：`{ kind:'global', name:'__DSH_TASK_COMPLETE_TOAST__', value: 上述对象 }`；客户端缺失时用 `DEFAULTS`，不报错。

**下发范围（ADR-009）**：宿主只投影三项——`enabled`、`bridge`（`bridge.enabled ? 'auto' : 'off'`）、`routePath`；`position`、`maxVisible`、时长与通知类字段是客户端默认值，v1.1 不从 patch 调整。客户端合并顺序：`DEFAULTS` ← 注入值，缺项不报错。

### 7.3 宿主路由

`GET {routePath}?sessionId=<id>`

| 场景 | 状态码 | 响应体 | 头 |
|---|---|---|---|
| 命中 | 200 | `{sessionId, outcome, reasonKind, cancelCause, at, seq}` | `cache-control:no-store`、`content-type:application/json; charset=utf-8`、`x-content-type-options:nosniff` |
| sessionId 缺失/非法 | 400 | `{error:'invalid-session-id'}` | 同上 |
| 未记录/已过期 | 404 | `{error:'unknown-session'}` | 同上 |
| 非 GET | 405 | `{error:'method-not-allowed'}` + `allow:GET` | 同上 |

- `exposeReason:false` 时只返回 `{sessionId, outcome, at}`。
- 不返回标题、路径、模型输出、工具参数；不写访问日志到会话。
- 单次处理上限：查表 O(1)，响应 < 1 KB。

### 7.4 `turn/end` 映射

| `reason.kind` | `reason.reason` | `outcome` | 标题 key | 是否弹 |
|---|---|---|---|---|
| `completed` | — | `completed` | `titleCompleted` | 是 |
| `error` | — | `error` | `titleError` | 是 |
| `max-tokens` | — | `interrupted` | `titleInterrupted` | 是 |
| `blocked` | — | `blocked` | `titleBlocked` | 是 |
| `interrupted` | — | `interrupted` | `titleInterrupted` | 是 |
| `aborted` | `user` | `suppressed` | — | 否 |
| `aborted` | `parent`/`hook`/`disposed`/`legacy` | `stopped` | `titleStopped` | 是 |
| `forked` | — | `ignored` | — | 否 |

### 7.5 客户端内部契约（单行签名）

| 单元 | 契约 |
|---|---|
| `createStore` | `(env, config) → { start(): Disposer, subscribe(fn): Disposer, get(): readonly Item[], dismiss(key): void, ingest(list): void }` |
| `Item` | `{ key: string, sessionId: string, at: number, outcome: Outcome \| 'pending' }` |
| `decide(id)` | `→ 'emit' \| 'suppress'`（纯函数，规则见 §8.3） |
| `resolve(sessionId, signal)` | `→ Promise<{ outcome, source: 'binding' \| 'route' \| 'fallback' }>` |
| `claim(sessionId)` | `→ Promise<boolean>`（80 ms 窗内是否胜出；无 BC 时恒 true） |
| `notify(item)` | `→ Promise<'delivered' \| 'deferred' \| 'skipped'>` |
| `formatLine` | `(t, workspace, session, status) → string`；缺值必须落到回退文案 |
| `titleOf` | `(t, outcome) → string`；未知 outcome 归 `completed` |

### 7.6 多标签消息（ADR-011）

频道 `dsh-task-complete-toast/v1`；消息 `{v:1, type:'claim', sessionId, tabId, at}`。

- `tabId` 是页面加载时生成一次的字符串（`crypto.randomUUID()`，不可用时 `Date.now().toString(36)+'-'+随机串`）；同一会话的胜者是认领窗内 `tabId` **字典序最小**者。
- 认领在 `settling` 起点与 resolver 并行发起，窗口 `claimWindowMs`（默认 80 ms），不串行、不新增轮询。
- `decide` 时：claim 明确失败 → 不入队、不通知、不更新冷却/发射计数；claim 成功/未注入/无 `BroadcastChannel` → 继续；claim 仍在途 → 按胜出处理（降级，记录诊断）。
- 自己的 claim 消息忽略；无 `BroadcastChannel` 视为单标签，恒胜出。
- `connection/reset`、卸载、页面销毁时关闭通道；迟到结果由 generation/state 守卫丢弃。
- 不设常驻 leader，不写存储。

### 7.7 文案键

| key | zh | en |
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
| `format` | `{workspace}[{session}] · {status}` | 同左 |

---

## 8. 状态机与判定规则

### 8.1 每会话状态

```text
unknown ──status(true)──────────────▶ running(startedAt)
unknown ──list(phase=pending)───────▶ baseline（只记，不弹）
running ──status(false)─────────────▶ settling(250ms)
settling ──status(true)─────────────▶ running（取消）
settling ──超时──────────────────────▶ deciding（解析结果，≤200ms）
deciding ──ignored/suppressed───────▶ cooling
deciding ──emit─────────────────────▶ queued ──▶ cooling(3000ms)
any ──connection/reset──────────────▶ unknown（清空队列与计时器）
```

### 8.2 转移表

| 当前 | 事件 | 守卫 | 动作 | 次态 |
|---|---|---|---|---|
| unknown | `status(true)` | — | `startedAt=now` | running |
| unknown | `status(false)` | list.phase=`pending` | 记基线 | baseline |
| unknown | `status(false)` | 其他 | 丢弃 | unknown |
| running | `status(false)` | — | 起 settle 计时器 | settling |
| settling | `status(true)` | — | 清计时器 | running |
| settling | 计时器到期 | `decide` 通过 | 起解析 | deciding |
| settling | 计时器到期 | `decide` 拒绝 | 丢弃 | cooling |
| deciding | 结果为 `ignored`/`suppressed` | — | 丢弃 | cooling |
| deciding | 结果可弹 | 认领胜出 | 入队 | queued |
| queued | `durationMs`/关闭 | — | 移除 | cooling |
| any | `connection/reset` | — | 全清 | unknown |

### 8.3 `decide` 规则（顺序短路）

| # | 条件 | 结果 | 理由 |
|---|---|---|---|
| 1 | 从未观察到 `running=true`（只有基线） | suppress | 防加载/重连误报 |
| 2 | 会话不在 `byId` | suppress | 已移除/不可见 |
| 3 | 行标记为子代理（V-2 可证时） | suppress | 子代理完成不等于用户任务完成 |
| 4 | 观察窗内回弹 | suppress | 任务继续 |
| 5 | `binding(id).session.getSnapshot().pendingSubmissions.length > 0` | suppress | 有排队输入 |
| 6 | `now - startedAt < minRunMs` | suppress | 快速问答不打扰 |
| 7 | 距上次弹窗 `< cooldownMs` | suppress | 抖动合并 |
| 8 | 本分钟已弹 ≥ `maxPerMinute` | suppress | 风暴保护 |
| 9 | 其他 | emit | 正常路径 |

### 8.4 时延预算

| 阶段 | 预算 | 备注 |
|---|---|---|
| 状态事件 → 观察窗结束 | 250 ms | `coalesceMs` |
| 结果解析 | 快路径 0；慢路径 ≤ 200 ms | 与认领窗并行 |
| 认领窗 | ≤ 80 ms | 与解析并行，不叠加 |
| 渲染 | ≤ 32 ms | 一次 React 事务 |
| **合计（P95 目标）** | **≤ 500 ms** | 最坏 `250+200+32≈482` |

> 若实测超预算，先降 `resolveBudgetMs` 到 120 ms，再考虑把解析提前到 `status(false)` 到达时并发发起（当前设计已在 settle 起点发起，见 WP5）。

---

## 9. 横切要求

### 9.1 失败路径矩阵

| 触发 | 检测 | 降级 | 用户可见 |
|---|---|---|---|
| 路由 404（表已过期/宿主未记录） | 响应码 | 启发式 `completed` | 正常弹「任务完成」 |
| 路由超时/网络错 | `AbortSignal` 200 ms | 同上 | 同上，无报错 |
| 路由 400（id 非法） | 响应码 | 同上，记 debug | 同上 |
| 宿主未装桥（v1 环境） | 404/连接拒绝 | 快路径或启发式 | 同上 |
| 通知权限 `denied` | `permission` | 进 `deferred` | 恢复窗口后补弹 |
| 通知构造抛错 | try/catch | 进 `deferred` | 同上 |
| 界面隐藏期间条目过期 | 计时器暂停 | 不启动计时 | 恢复后补弹 |
| `BroadcastChannel` 不可用 | 能力检测 | 单标签假设 | 双标签可能各弹一次 |
| 名称解析缺字段 | 兜底 | 回退文案 | 显示「未分组/未命名会话」 |
| 语言键缺失 | `t()` 回退 | 显示 key 或英文 | 不空白 |
| 卡片渲染抛错 | 错误边界 | 丢弃该卡 | 其余卡片正常 |
| 插件卸载时有在途请求 | `disposed` 标志 | 丢弃结果 | 无变化 |
| 路由重复注册 | `register` 抛错 | 激活失败 | 插件页显示失败，需改 `routePath` |
| 会话被归档/移除 | 不在 `byId` | 抑制 | 不弹 |

### 9.2 权限与隐私

| 项 | 结论 |
|---|---|
| 通知内容 | 仅工作区名、会话标题、状态词；不含模型输出、路径、工具参数 |
| 路由响应 | 仅枚举值 + 时间戳；不含标题与内容 |
| 路由暴露面 | 仅本机回环；无 CORS 头；`no-store` |
| 存储 | 不写 localStorage/IndexedDB；`tabId` 只在内存 |
| 网络 | 除同源路由外零请求 |
| 日志 | 不打印会话标题；错误只打印错误码与 sessionId 前 8 位 |
| 权限申请 | 页面隐藏时不申请，避免静默拦截 |

### 9.3 性能预算

| 指标 | 预算 |
|---|---|
| 常驻监听器 | 3（status、list、reset）+ 1 路由 + 4 个可见性监听 |
| 常驻计时器 | 0（空闲时）；每会话最多 1 |
| 每次完成的开销 | 1 次查表 + 0/1 次 HTTP + 1 次渲染 |
| 结果表内存 | ≤ 1024 条 × ~120 B ≈ 120 KB 上限 |
| 100 次完成 | 内存增长 < 2 MB，监听器数不变 |
| 路由 CPU | 单次 < 1 ms |

### 9.4 无障碍

| 项 | 要求 |
|---|---|
| 语义 | 容器 `role="status"`，`aria-live="polite"`，`aria-atomic="false"` |
| 焦点 | 卡片不抢焦点；关闭按钮可 Tab 到达且有名称 |
| 键盘 | Esc 关闭最上一条；Enter/Space 在按钮上生效 |
| 动效 | 尊重 `prefers-reduced-motion` |
| 对比度 | 只用主题 token；不写死明暗色 |
| 缩放 | 125%/150% 不裁切；480 px 窄窗不溢出 |

### 9.5 国际化

- 全部可见文本走 `ctx.locale.bind(ns)`，组件订阅 `getSnapshot/subscribe` 即时更新。
- 回退链：zh/en 之外回退 en；缺 key 显示 key，不显示 `undefined`。
- 数字/时间如需展示走 `Intl`，不手写单位。
- `locale/*.json` 只放 `meta.title`/`meta.description`，与运行时字典分离。

### 9.6 兼容、升级与回滚

| 场景 | 处理 |
|---|---|
| 旧版无 `useWorkspaces` | 名称回退，功能不中断 |
| 旧版无 `$on` | 插件不激活（`inject` 缺依赖即不启动），不半死 |
| 桥不可用 | 自动退化为 v1 行为 |
| 升级 | 替换已安装包需重启才能加载新 JS 代际；新增 bundle 可 HMR |
| 回滚 | `plugin_manager` 禁用/移除 bundle；插件不写任何持久状态，回滚即干净 |
| 路由冲突 | 改 `bridge.routePath` 后重启 |

---

## 10. 测试方案

### 10.1 分层与工具

| 层 | 范围 | 工具 | 是否可自动化 |
|---|---|---|---|
| 单测 | store 状态机、`decide`、映射、格式化、认领 | Node 内置 `node --test` | 是 |
| 集成 | 路由契约、事件映射、配置注入 | Node `node --test` + 本地 HTTP | 是 |
| 手测 | 视觉、通知、多标签、最小化 | 人工 + 检查表 | 否 |
| 性能 | 时延、内存、监听器 | 打点 + 检查表 | 部分 |

**测试装载方式**：`test/harness.js` 用 `vm` 提供伪 `window.__ModuleLoader__.load`，捕获 factory，用最小 `require` 桩调用，取 `__test__` 的纯函数。这样单测不需要 DOM、不需要构建，也不需要把客户端拆成多文件。

> 实际落地为 **109 条 / 9 个套件**（WP6b）。下表 U01–U20 是设计期用例编号，表达覆盖意图，不要求编号与数量一一对应；验收以 P1 的「109 基线 + R2 新增 + V01–V28」为准。

### 10.2 单元测试用例

| 编号 | 输入 | 期望 |
|---|---|---|
| U01 | 列表 `phase=pending`，收到 `status(false)` | 只记基线，不弹 |
| U02 | `status(true)` → 2 s → `status(false)`，无回弹 | 250 ms 后入队，`outcome=completed` |
| U03 | 运行 800 ms 后结束 | 抑制（`minRunMs`） |
| U04 | `status(false)` 后 100 ms 又 `status(true)` | 取消，不入队 |
| U05 | 结束时 `pendingSubmissions` 非空 | 抑制 |
| U06 | 两次完成间隔 2 s | 冷却合并，只保留一条 |
| U07 | 4 条同时有效 | 最多 3 条，最旧被移除 |
| U08 | 一分钟内 10 次完成 | 第 7 次起抑制 |
| U09 | 会话不在 `byId` | 抑制 |
| U10 | 行标记子代理 | 抑制（字段可证时） |
| U11 | `connection/reset` | 状态与队列清空，重新基线 |
| U12 | 结果为 `aborted/user` | 抑制，不入队 |
| U13 | 结果为 `error` | 入队，标题 `titleError` |
| U14 | 结果为 `forked` | 抑制 |
| U15 | `formatLine` 中英文 + 缺值 | 严格匹配 `工作区[会话] · 状态`，缺值落回退 |
| U16 | 缺工作区/缺会话名 | 「未分组」「未命名会话」/ 英文对应 |
| U17 | 超长名称 | 返回完整文本，截断交给样式（纯函数不截断） |
| U18 | 通知拒绝 → `deferred` → 恢复可见 | 补弹一次且只一次 |
| U19 | 两标签 claim，`tabId` 一大小 | 小者胜出，大者丢弃 |
| U20 | `dispose` 时有挂起计时器与在途解析 | 全部清理，无后续回调 |
| D05–D08 | 移入取消、移出重新 5 s、焦点同理（ADR-013） | 见 ADR-013；旧“恢复剩余”断言必须移除 |

### 10.3 集成测试用例

| 编号 | 场景 | 期望 |
|---|---|---|
| I01 | 已知会话写入 `turn/end(completed)` 后 GET | 200，`outcome=completed`，头齐全 |
| I02 | 未知会话 GET | 404 `unknown-session` |
| I03 | 缺参/超长/控制字符 | 400 `invalid-session-id` |
| I04 | `error` 与 `max-tokens` | 分别映射 `error` / `interrupted` |
| I05 | `aborted(user)` 与 `aborted(hook)` | `suppressed` / `stopped` |
| I06 | 触发 `webserver/index-inject` | 表中出现 `global` 行，值等于配置子集 |
| I07 | TTL 过期后 GET | 404 |
| I08 | 表满 257 条 | 最旧被淘汰，容量不变 |

### 10.4 手动验收用例

| 编号 | 场景 | 期望 | 对应 |
|---|---|---|---|
| V01 | 安装后刷新 | overlay 出现 `task-complete-toast`，不弹 | T1 |
| V02 | 5 s 任务后切走（不悬停） | ≤500 ms 两行提示，5 s 后消失 | T2 |
| V03 | 文案格式 | 中英文严格匹配正则 | T3 |
| V04 | `showTitle:false` | 只剩明细行 | T4 |
| V05 | 名称缺失 | 回退文案，无 `undefined`/空括号 | T5 |
| V06 | 超长名称 | 省略号，hover 全量，不换行 | T6 |
| V07 | 点击卡片 | 聚焦并打开会话 | T7 |
| V08 | 1 s 内问答 | 不弹 | T8 |
| V09 | 连续两次完成 | 合并 | T9 |
| V10 | 两会话先后完成 | 堆叠 ≤3 | T10 |
| V11 | 重启宿主/刷新页面 | 不误报，任务结束后正常提示 | T11 |
| V12 | 当前会话点停止 | 不弹 | T12 |
| V13 | 最小化后完成 | 系统通知，内容一致，点击回跳 | T13 |
| V14 | 最小化 + 权限拒绝 | 不崩溃，恢复后补弹 | T14 |
| V15 | 深浅色/缩放/窄窗 | 不溢出、不裁切 | T15 |
| V16 | 减少动效 | 仅淡入淡出 | T16 |
| V17 | 切 English | `Task completed` / `Plugins[Toast popup] · Idle` | T17 |
| V18 | 系统语言非 zh/en | 回退英文 | T18 |
| V19 | 禁用插件 | 浮层消失、无计时器、无报错 | T19 |
| V20 | 100 次压测 | 内存/监听器稳定 | T20 |
| V21 | 双标签同时完成 | 只一个标签弹（含通知） | 新增 |
| V22 | 杀掉宿主路由（桥不可用） | 退化为「任务完成」，不报错 | 新增 |
| V23 | 后台会话点停止 | 不弹（桥生效） | 新增 |
| V24 | 删一个语言键 | 显示 key 或英文，不空白 | 新增 |
| V25 | 卸载后检查 | 无残留 DOM/计时器/通知 | 新增 |
| V26 | 断网/宿主重启中途完成 | 不崩溃；恢复后不重复弹 | 新增 |
| V27 | patch 配置 `enabled:false` | 无浮层/无客户端通知；恢复后正常 | P1 新增 |
| V28 | 悬停 6 s 后移出；再移入/移出 | 悬停不消失；移出后重新 5 s 消失；再次移入取消，再移出重新 5 s | ADR-013 |

### 10.5 性能与稳定性

| 编号 | 方法 | 通过线 |
|---|---|---|
| P01 | 20 次真实任务打点 | P95 ≤ 500 ms |
| P02 | 人为把路由延迟到 500 ms | 200 ms 超时后按启发式弹，总时延 ≤ 800 ms |
| P03 | 100 次连续完成 | 内存增长 < 2 MB |
| P04 | 100 次后查监听器与计时器 | 数量与冷启动一致 |
| P05 | 路由单次耗时 | < 1 ms |

### 10.6 夹具与测试数据

- 会话 id 用固定假值（如 `s-0001`…`s-0010`），不依赖真实会话。
- `turn/end` 序列用 8 条覆盖 §7.4 全部分支。
- 时延用假时钟（注入 `now`/`setTimeout`），不 `sleep`。
- 通知用伪 `Notification` 类，记录构造参数与 `close` 次数。
- 认领用伪 `BroadcastChannel`，可注入发送顺序与延迟。

### 10.7 无法自动化的部分

| 项 | 原因 | 替代 |
|---|---|---|
| Windows 通知的真实落点与归属应用 | OS/Electron 决定 | V13 人工截图 + 记录 AUMID 现象 |
| 专注助手/企业策略吞通知 | 系统行为 | 记录为环境限制，不计缺陷 |
| 主题切换的真实观感 | 需人眼 | V15 + 主题 token 使用审查 |
| `app.asar` 内版本差异 | 不可 mock | WP0 契约验证 |

### 10.8 缺陷分级与退出标准

| 级别 | 定义 | 退出要求 |
|---|---|---|
| P1 | 误报、崩溃、隐私泄露、通知必达失败 | 0 |
| P2 | 文案/格式错误、点击不回跳、多标签重复弹 | 0 |
| P3 | 视觉细节、动画、长文本截断 | ≤2 且记录 |
| P4 | 建议、重构 | 记录即可 |

**退出标准**：自动化基线 109/109（R2 后新增用例全绿、0 失败 0 跳过）、V01–V28 全过、P01–P05 达标、审查 36/36；P1/P2 = 0，P3 ≤ 2 挂账。

---

## 11. 代码审查方案

### 11.1 流程与门禁

| 门 | 时点 | 检查 | 通过条件 |
|---|---|---|---|
| G0 提交前 | 开发代理自测后 | 跑 U+I 套件、自查清单 | 全绿 + 自查表 |
| G1 宿主评审 | WP1/WP5 完成后 | §11.2 的 A/B/F 组 | 无 P1/P2 |
| G2 客户端评审 | WP3/WP4 完成后 | B/C/D/E 组 | 无 P1/P2 |
| G3 架构签核 | R4 结束 | 契约一致性、ADR 偏离 | 无未批准偏离 |
| G4 验收 | R3 | 手测 V01–V28 | 达到 §10.8 |

**审查方式**：逐文件走读 + 契约对照 + 抽查 3 个测试用例是否真能失败（把实现改坏一处，测试必须红）。只看 diff 不算完成审查。

### 11.2 审查清单

**A 契约一致（6）**

| 编号 | 检查点 |
|---|---|
| C01 | 路由 `kind/path` 与 §7.3 一致；重复注册会让激活失败而非静默吞掉 |
| C02 | 响应字段、状态码、头与 §7.3 逐项对齐；`exposeReason:false` 分支存在 |
| C03 | `turn/end` 映射覆盖 §7.4 全部 8 行，含 `aborted` 的 5 种 cause |
| C04 | 配置注入行名 `__DSH_TASK_COMPLETE_TOAST__` 与客户端读取名一致 |
| C05 | 客户端 `inject` 数组含 `sessions/remote/slots/locale/uiWorkspace` |
| C06 | 插槽注册 `id` 唯一、`order` 合理、`label` 随语言变化 |

**B 生命周期与资源（6）**

| 编号 | 检查点 |
|---|---|
| C07 | 所有注册都在 `ctx.effect`/`ctx.on` 内，返回清理 |
| C08 | 卸载后无计时器、无在途 fetch、无 BC 通道、无通知回调 |
| C09 | `connection/reset` 清空状态与队列，不重复弹 |
| C10 | 结果表有界 + TTL，不无限增长 |
| C11 | 组件卸载移除内联样式与错误边界 |
| C12 | 事件处理器有 `disposed` 守卫，迟到的回调不写状态 |

**C 状态机与正确性（6）**

| 编号 | 检查点 |
|---|---|
| C13 | 基线规则不可绕过：从未 running 的会话绝不弹 |
| C14 | 观察窗内回弹取消计时器，无双重入队 |
| C15 | 冷却与每分钟上限按会话/全局分别生效，不互相顶掉 |
| C16 | 队列按 `at` 升序、超限淘汰最旧、关闭/超时都走同一移除路径 |
| C17 | 结果为 `ignored/suppressed` 时不留空卡片 |
| C18 | 认领失败时既不入队也不发通知 |

**D 渲染、a11y 与样式（6）**

| 编号 | 检查点 |
|---|---|
| C19 | 容器 `pointer-events:none`，卡片 `auto`（click-through 不被破坏） |
| C20 | `role=status`、`aria-live=polite`、关闭按钮有名称、Esc 可用 |
| C21 | 只用 `--dsw-alias-*`，无字面色与硬编码明暗 |
| C22 | 单行截断 + `title`/`aria-label` 完整文本；窄窗不溢出 |
| C23 | `prefers-reduced-motion` 分支存在 |
| C24 | 错误边界只吞单卡，不影响其他卡片与 overlay |

**E 国际化（4）**

| 编号 | 检查点 |
|---|---|
| C25 | 无中英文写死在组件里；全部走 `t()` |
| C26 | 语言切换即时重渲染（订阅 `locale` 快照） |
| C27 | 缺 key 有回退，不显示 `undefined`/空白 |
| C28 | `locale/*.json` 只有 `meta.*`，与运行时字典不混用 |

**F 安全与隐私（4）**

| 编号 | 检查点 |
|---|---|
| C29 | 路由只回枚举值，不含标题/路径/模型输出 |
| C30 | 无第三方请求；同源路由之外零网络 |
| C31 | 不写 localStorage/IndexedDB，不落盘会话内容 |
| C32 | 日志不含标题；错误只留码与前 8 位 id |

**G 性能与可测性（4）**

| 编号 | 检查点 |
|---|---|
| C33 | 常驻监听器 ≤3 + 路由 1 + 可见性 4 |
| C34 | 无轮询、无全量日志扫描、无每帧计算 |
| C35 | 纯函数可从 `__test__` 取到，测试不依赖 DOM |
| C36 | 时延预算与 §8.4 一致，解析在 settle 起点发起 |

> 合计 36 条：主干 32 条（A–F 组）+ 性能与可测性 4 条（G 组）。

### 11.3 Top 8 高风险点

| # | 风险点 | 审查问题 |
|---|---|---|
| 1 | 基线判断 | `phase` 的读取时机是否可能早于就绪，导致把「本来在跑」当基线？ |
| 2 | 双计时器 | settle 与冷却是否共用同一个计时器槽，导致互相覆盖？ |
| 3 | 认领窗 | 认领期间用户点关闭，是否还能正确清理？ |
| 4 | deferred | 补弹是否绕过了自动消失计时，导致永不消失？ |
| 5 | 通知点击 | 会话已归档时 `openSession` 抛错是否被吞掉？ |
| 6 | 结果映射 | `aborted` 的 `hook` 是否被误判为 `user` 而不弹？ |
| 7 | 语言切换 | 已入队条目是否在切换后仍用旧文案？ |
| 8 | 卸载 | 在途 fetch 返回后是否还会 `setState`？ |

### 11.4 评审记录模板

| 字段 | 内容 |
|---|---|
| 评审对象 | 文件 + 提交范围 |
| 评审人 | 客户端 / 宿主 / 架构 |
| 结论 | 通过 / 有条件通过 / 退回 |
| 问题清单 | `{编号, 级别 P1–P4, 文件:行, 描述, 建议, 责任人, 状态}` |
| 契约偏离 | 有/无；有则附 ADR 编号 |
| 测试抽查 | 改了哪一处、哪条测试变红 |
| 签署 | 日期 + 角色 |

### 11.5 结论等级

- **通过**：无 P1/P2，P3 ≤2 且已挂账，清单全勾。
- **有条件通过**：仅剩 P3/P4，且不影响 A-1/A-3/A-4 三项指标。
- **退回**：出现 P1/P2、契约未批准偏离、测试抽查不红。

---

## 12. 交付计划

### 12.1 里程碑

| 里程碑 | 内容 | 门 | 工期 |
|---|---|---|---|
| M0 | 契约钉住（V-1…V-4） | G1 前置 | 0.5 d |
| M1 | 宿主可用：路由 + 表 + 注入 | G1 | 1.0 d |
| M2 | 客户端可弹：store + overlay | G2 前半 | 3.0 d |
| M3 | 通知与桥：最小化 + 结果 | G2 | 1.5 d |
| M4 | i18n + 配置 | — | 0.5 d |
| M5 | 测试与评审 | G0/G3 | 2.5 d |
| M6 | 安装与验收 | G4 | 0.5 d |

### 12.2 依赖与并行

```text
WP0 ─┬─▶ WP1 ─┬─▶ WP5 ─┐
     └─▶ WP2 ─┴─────────┼─▶ WP7 ─▶ WP8 ─▶ WP9
          └─▶ WP3 ─▶ WP4 ─┴─▶ WP6
```

- WP2 与 WP1 可并行；WP3 依赖 WP2 的 store 契约而非实现。
- WP6 只依赖注入行与文案键，可与 WP4 并行。
- WP7 的最后 0.5 天专门做「把测试改红」的验证。

### 12.3 人力与角色

| 角色 | 职责 | 投入 |
|---|---|---|
| 开发代理 | 实现、自测、安装、取证 | 9.5 d（含 WP8 修复；评审工时另计） |
| 客户端评审 | C13–C28 走读 | 0.5 d |
| 宿主评审 | C01–C12、C29–C32 走读 | 0.5 d |
| 架构（本文档） | 契约签核、ADR 裁决、验收口径 | 0.5 d |

---

## 13. 风险

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 自注册路由被连接层鉴权拦截 | 中 | 高 | WP0 先验；失败走 S3；仍失败则退 v1 启发式 |
| `byId[id].title` 字段不存在 | 中 | 低 | 回退「未命名会话」；不影响判定 |
| `sessions.list` 属内部面，未来改名 | 低 | 高 | 封装 `ListSource`，一处适配；锁版本回归 |
| 子代理标记不可得 | 中 | 低 | 关闭过滤，接受噪音，文档标注 |
| 通知被 OS 吞 | 中 | 中 | 记录环境限制；补弹兜底 |
| 多标签认领窗口导致偶发重复 | 低 | 低 | 80 ms 窗 + 最小 tabId；V21 覆盖 |
| 结果表与真实 finish 顺序错位 | 低 | 中 | 只按会话覆盖写；读取时以最后一条 `turn/end` 为准 |
| 语言切换后旧卡片文案不更新 | 中 | 低 | 渲染期取 `t()`，不缓存字符串 |
| 路由路径冲突导致激活失败 | 低 | 中 | 配置化 `routePath`；激活失败可见 |
| 替换包后旧 JS 仍生效 | 中 | 中 | 文档写明需重启；验收前确认代际 |

---

## 14. 开放问题

| # | 问题 | 需谁决定 | 默认 |
|---|---|---|---|
| Q1 | 是否批准 ADR-001：v1.1 用「按需拉取」替代 v0.3 §5.11 的 SSE | 需求方 | 批准（否则按 S3 排期 +1.5 d） |
| Q2 | 通知权限的首次引导是否纳入本期（原 M5 可选） | 需求方 | 不纳入，仅做降级 |
| Q3 | 多标签 80 ms 合并窗带来的延迟是否可接受 | 需求方 | 可接受 |
| Q4 | 失败标题是否要区分 `interrupted` 与 `blocked` 两种文案 | 需求方 | 区分（已入 §7.7） |
| Q5 | 后台 job 仍在跑时也提示，是否符合预期 | 需求方 | 是（沿用 v0.3 口径） |
| Q6 | 子代理完成是否需要提示 | 需求方 | 否 |

> 以上 Q1–Q6 已由 P1 裁决（2026-10-26）：Q1 批准、Q2 不纳入、Q3 接受、Q4 区分、Q5 是、Q6 否；见 [`P1-设计裁决与验收基线.md`](P1-设计裁决与验收基线.md)。

---

## 15. 交接说明

### 15.1 给开发代理的硬约束

1. 只改 `task-complete-toast/` 包内文件；不动 profile、不动 `app.asar`、不动本目录的 Markdown。
2. 契约以本文 §7 为准；要改先提 ADR，评审通过再改，不许「实现时顺手改契约」。
3. 客户端保持单文件，不引第三方依赖，不引构建链；样式用内联 React 元素。
4. 测试先写夹具与时延假时钟，再写实现；U 套件必须能在实现改坏时变红。
5. 安装只用 `plugin_manager install_bundle`，装完读 `application`/`warnings` 判定是否生效，不看日志猜。
6. 替换已安装包后必须重启再验；HMR 只保证新增 bundle。
7. 验收顺序：U → I → V01/V02 → V13/V14 → 其余 V → P 套件。
8. 交付报告必须含：包路径、版本、安装结果、U/I/V/P 通过数、P3 挂账、未验证项。

### 15.2 交接清单

| # | 交付物 | 形态 |
|---|---|---|
| 1 | 插件包目录 | `task-complete-toast/`（可安装） |
| 2 | 测试套件 | `test/` + 运行命令与输出 |
| 3 | 手测记录 | V01–V28 逐条结果与截图（通知场景） |
| 4 | 性能记录 | P01–P05 原始数据 |
| 5 | 契约验证报告 | WP0 的 `*-契约验证.md` |
| 6 | 评审记录 | 按 §11.4 模板，含抽查用例 |
| 7 | 已知限制 | 通知系统行为、子代理过滤、版本差异 |

### 15.3 回滚步骤

1. `plugin_manager` 禁用该 bundle → 刷新页面。
2. 若无效应移除 bundle 并重启。
3. 确认 overlay 中不再有 `task-complete-toast`、无常驻通知、无路由残留。
4. 插件不写持久状态，无需数据清理。

---

## 附录 A：本次证据索引

| 证据 | 取得方式 | 位置 |
|---|---|---|
| `shell.overlay` 拓扑、props、占位者 | Client `Slots.listSubTree(root:"shell.overlay")` | §3.2 E1–E3 |
| `session/event` 与 `TurnEndReasonMap` | Host `Event.listEvents("session/event")` | E4–E5 |
| `webserver/index-inject` | Host `Event.listEvents("webserver/index-inject")` | E6 |
| `webServer.register` 契约 | Host `Service.listService("webServer")` | E7 |
| `locale` 服务方法 | Client `Service.listService("locale")` | E10 |
| `remote.$on` 用法与 disposer | `dsh-client-ui-session/lib/client.js` 814–816 行 | E8 |
| `sessions.list` 形状与基线 | 同文件 915–975 行 | E9 |
| `uiWorkspace.openSession` | Client Service 目录 | E11 |
| 客户端事件目录 | Client `Event.listEvents` | E12 |
| 客户端 Service 目录（无 `remote`） | Client `Service.listService` | E13 |

## 附录 B：与 v0.3 的差异

| 编号 | v0.3 | 本方案 | 理由 |
|---|---|---|---|
| R1 | §5.11 用 SSE 广播 | 改为按需 `GET`（ADR-001） | 鉴权、重连、扇出三项成本过高 |
| R2 | 客户端用 `useSessions`/`useSessionStatus` props | `apply` 内订阅 `sessions.list` + `$on`（ADR-002） | 判定不应依赖渲染树；组件只订阅 store |
| R3 | 基线来自 `ctx.sessions.list.byId` | 基线用 `phase` + 首次 `running:false` 双重判定（ADR-003） | 与官方 ui-session 同款，抗重连 |
| R4 | 配置经 `webserver/index-inject` 注入 | 保留，且客户端只留兜底（ADR-006） | 单一真源，防漂移 |
| R5 | 多标签「尽力去重」 | 80 ms 认领窗 + 最小 `tabId`（ADR-005） | 可判定、可测试 |
| R6 | 结果桥参与「标题纠正」但未定失败路径 | 明确 404/超时/异常三态退化（ADR-004） | 不阻塞弹窗 |
| R7 | 未定测试装载方式 | `__test__` + `vm` 装载（ADR-007） | 单文件客户端也能单测 |
| R8 | 未定审查方式 | 36 条清单 + 4 门禁 + 改坏抽查 | 可执行、可追责 |

## 附录 C：契约复核步骤（WP0 用）

1. `cordis_inspect_query` Client `Service.listService("sessions")` 与已装 `dsh-client-ui-session/lib/client.js`，确认 `list` 与 `$on` 仍存在。
2. 读已装 `dsh-client-ui-workspace` 的客户端产物，确认 `useWorkspaces` 快照形状（V-3）。
3. 读 `dsh-client-ui-session` 中列表行的构造处，确认 `title` 与子代理字段（V-1/V-2）。
4. 在临时 bundle 里注册一条测试路由，用页面 `fetch` 打一次，确认不被鉴权/fallback 拦截（V-4）；验完删除。
5. 把以上四项写成 `*-契约验证.md`，逐条给「成立/不成立/替代」，作为 M1 的开工依据。

## 附录 D：ADR 清单

| 编号 | 决策 | 理由 | 代价 | 被否决的替代 |
|---|---|---|---|---|
| ADR-001 | 结果通道用按需 `GET`（S2），不用 SSE | 鉴权只受 Cookie 限制、断线补发与多标签扇出都要自建；拉取幂等、失败面小 | 每次完成多一次本机请求 | SSE（S3）、Remote 事件（S1） |
| ADR-002 | 状态采集放 `apply`：`remote.$on` + `sessions.list`，组件只订阅 store | 判定不能被渲染树生命周期绑住；与官方 ui-session 同构 | 依赖 `sessions.list` 这个内部面，需一处适配封装 | 全放组件 hooks（v0.3 写法） |
| ADR-003 | 基线 = `phase` + 「首次 `running:false` 只记录」 | 防页面加载/重连误报 | 加载时就已完成的会话不提示（可接受） | 仅凭列表快照判断 |
| ADR-004 | 桥 404/超时/异常 → 退化 `completed` | 不阻塞提示；最坏与 v1 等价 | 后台失败可能被标成「任务完成」 | 桥失败即不提示（可用性差） |
| ADR-005 | 多标签 80 ms 认领窗 + 最小 `tabId` 胜出 | 无常驻 leader、无存储、结果确定可测 | 增加 0–80 ms 延迟 | leader 选举 / localStorage 锁 |
| ADR-006 | 配置单一真源在宿主 `Config`，经 `index-inject` 下发 | 防两端默认值漂移 | 改配置需要重新加载页面 | 客户端常量为准 |
| ADR-007 | 客户端单文件 + `__test__` 测试钩子 | 不引构建链也能单测纯函数 | 多导出一个键；测试需 `vm` 装载 | 拆模块 + 打包工具 |
| ADR-008 | 宿主 `Config` 用零依赖手写 Standard Schema（`~standard.validate`）+ 描述字段 | Cordis 只接受 Standard Schema，纯 JSON Schema 无 `~standard`，激活即抛错 | 默认值与范围校验要自己实现并补测试 | 引 `@deepseek-ai/schemastery`（新增依赖） |
| ADR-009 | 注入行只投影 `{enabled, bridge:'auto'\|'off', routePath}` | 客户端需要 `routePath`；`ringSize`/TTL 等内部字段不该外泄；其余字段本就是客户端默认值 | §7.2 增加 `routePath` 一个字段，两端须同步 | 注入完整宿主 Config（A）/ 只注 §7.2 子集不注 `routePath`（C） |
| ADR-010 | Esc 关闭**最新一条**（视觉最下），不反转渲染顺序 | §5.3 已定「按 `at` 升序、最新在下」；Esc 是「我刚看到的那条」的快捷操作 | 「最上」在视觉上指最旧一条，与用户预期相反，故不采用字面解释 | 关闭视觉最上（最旧）/ 反转渲染顺序让最新在上 |
| ADR-011 | R2 多标签：`tabId` 字符串、字典序最小胜出；`settling` 起点与 resolver 并行；`decide` 检查 | 无 leader、无存储、可测；80 ms < 250 ms 观察窗 | 增加 0–80 ms 延迟；pending 时降级为胜出 | leader 选举 / 持久锁 |
| ADR-012 | v1.1 验收改为 109 基线 + R2 + V01–V28 + P01–P05 + C01–C36；状态固定 `statusIdle`；Config 面板不支持接受 | 与实际实现和 P0 事实对齐；避免用不存在的 U20/I8 计数 | 配置只能走 patch；动态状态延后 | 坚持旧 U20/I8/V26 数字 |
| ADR-013 | 弹窗消失计时：移入/焦点取消，移出/失焦后重新完整 5 s | 用户确认的新需求；不保留剩余时间 | 每次移出都延后最多 5 s；旧验证作废 | 暂停/恢复剩余（旧） |
| ADR-014 | 系统通知 `tag` 改为每条唯一（`dsh-task-<sessionId>-<item.key>`） | Windows 对已用过的 tag 只做静默更新，`renotify:true` 也不恢复横幅；V13 两版修复方向有误 | 通知中心同会话可多条；OS 层不再「只留最新」 | 固定 tag + renotify / 去掉 tag |
