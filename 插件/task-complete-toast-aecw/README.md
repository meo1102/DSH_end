# 任务完成提示（task-complete-toast）· AECW 副本

> **当前状态：以 [`STATUS.md`](STATUS.md) 为准。** 本 README 是功能/安装说明，历史细节可能滞后；冲突时以 STATUS 为准。
> **本目录是 AECW 结构副本**（2026-11-05 复制自 `DSH_end/插件/task-complete-toast` v1.2.0）：迁移时产品逻辑未改；随后按人类指令更新介绍文案与回归断言（F-031/F-032），并在 `grow-2` 实现 G4 外观设置；治理工件按 `agent-engineering-control/prototype` 的三域架构重排。
> **安装状态**：2026-11-05 按人类选择**替换原件**：desktop profile 的 link/junction 已指向本副本；原件保留在 `DSH_end/插件/task-complete-toast`，可回滚（remove_bundle 后 install_bundle 指向原件）。与原件同包名。
> **开发约束**：先读 [`human/direction.md`](human/direction.md)（v1.2-aecw，含 G4）+ [`BLUEPRINT.md`](BLUEPRINT.md)（阶段 `grow-2`，approved）。**v1.2.0 发布**：G1 完成提示、G2 授权/确认提醒、G3 弹窗样式自定义；G4 设置未发布；已知遗留见文末。

DSH 持久化插件：当 Agent 从运行变为空闲时，在窗口右下角提示任务完成；当轮次等待人类授权/确认时，提示处理；当页面不可见或被遮挡时，改发 Windows 系统通知。

| 项 | 值 |
|---|---|
| 包名 | `@local/task-complete-toast` |
| 版本 | `1.2.0`（与原件同一基线） |
| 目标环境 | DSH Desktop `0.2.1-rc.3`（Cordis），Windows |
| 代码状态 | G1/G2/G3 已发布；G4 设置页**已由人类验收（E2，无截图）**；G2 遮挡推送修复**真机通过**；已知未测：G2-8、G3-4b |
| 自动化 | **169/169** 通过，`node --check` 17/17（2026-11-05 本副本） |
| 真机验收 | G1 5/5；G2 7/8（G2-8 挂起）；G3 6/6（G3-4b 未单独实测）；**G4 设置页人类验收（无截图）**；**G2 遮挡推送真机通过（最小化 → 通知 → 拒绝消失）** |
| 治理结构 | AECW 三域：`human/`、`cluster/`、`workspace/`；门禁 `gates/`；异议/变更 `inbox/`；台账 `ledger.md` |

## AECW 项目结构（本副本新增）

```text
task-complete-toast-aecw/
├─ STATUS.md                  # 唯一当前状态（先读）
├─ BLUEPRINT.md               # 阶段 grow-2 施工蓝图（approved）
├─ human/                     # 人类域：方向/决策/验收
├─ cluster/                   # 集群域：名册/任务板/运行/学习
├─ workspace/                 # 工作区：work/evidence/memory/landing
├─ gates/                     # 每道门一页（历史）
├─ inbox/                     # S1/S2 详情 + CR 详情
├─ ledger.md                  # 异议/事实/变更台账
├─ bin/aecw.mjs               # 零依赖 CLI（复制自原型机）
├─ core/                      # 六份模板（复制自原型机）
└─ 产品代码 …                 # package.json / index.js / client.js / lib/ / locale/ / test/ …
```

常用命令（在本目录执行）：

```powershell
node bin/aecw.mjs status .
node bin/aecw.mjs check .
node bin/aecw.mjs gate . --name <门禁名> [--decision 通过|有条件通过|退回补证|暂停]
node bin/aecw.mjs fact . --statement "..." --source "..." --status 已核验 --verifier "..."
node bin/aecw.mjs dissent . --severity S2 --type 风险 --claim "..." --evidence "..."
node bin/aecw.mjs change . --type blueprint --title "..." --reason "..." --impact "..."
```

**没有 `freeze` 不开工**：蓝图未获人类批准前，`check` 允许停在 `seed`；冻结/开工步骤见 `STATUS.md` §6。

> **下一阶段（`grow-2`，代码完成、真机未验）**：插件设置页可调字号（12–18 px）、卡片宽度（280–480 px，最小宽度随字号联动）、背景色/文字色（对比度守卫），并即时预览；字体跟随系统正文。见 [`BLUEPRINT.md`](BLUEPRINT.md) v2 与 [`workspace/memory/design-contract-v1.2.0.md`](workspace/memory/design-contract-v1.2.0.md) §16。**真机未验，暂不对外称“可用/已发布”。**

## 功能

- **完成判定**：`api-session/status` 的 `running: true → false`，经 250 ms 观察窗确认（不看 Goal、不等后台 job）。
- **文案**：两行；标题（任务完成/失败/已停止/已中断/被阻止）+ 明细 `<工作区>[<会话>] · 待执行`。
- **结果桥**：区分完成 / 失败 / 中断 / 被阻止 / 停止；用户主动取消不提示。宿主记录 `turn/end`，客户端按需拉取。
- **自动消失**：默认 5 s；鼠标移入或焦点进入取消计时，移出/失焦后**重新完整 5 s**（ADR-013）。
- **系统通知**：页面不可见或被遮挡时发送；每条唯一 `tag`（≤34 字符）；点击尝试聚焦/打开，最小化时不还原（平台限制，已接受）。
- **多标签**：80 ms 认领窗，`tabId` 字典序最小胜出；认领未决时等窗口结束再判定（ADR-015）。
- **G2 授权/确认提醒（v1.2.0）**：只读 `uiSession.sessionStatus` 的 `pendingInteraction`；等待授权/回答时显示提醒，进入会话/解决/关闭后收起；页面不可见时发系统通知。不拦截 waterfall、不代替人类回答。**G2-8（双会话上限）未测，已接受为已知遗留。**
- **G3 弹窗样式自定义（v1.2.0）**：`appearance.position` 四角、`theme` 跟随/亮/暗、`size` 紧凑/标准、`durationMs` 2–15 s、`showTitle`；纯 token，无任意 CSS。**G3-4b（提醒卡不受时长影响）未单独真机实测，已接受为已知遗留。**
- **G4 外观设置（grow-2，代码完成、真机未验）**：设置 → 插件 → “任务完成提示”，可调字号 12–18 px、卡片宽度 280–480 px（最小宽度随字号联动）、背景色/文字色（`#RRGGBB`，对比度 <4.5:1 拒绝），右侧即时预览；字体固定跟随系统正文字体。保存经宿主 `configEditor` 写入 Config（A 方案，预期刷新后仍生效，**真机待验**）。**未真机验证前不称可用。**
- **语言**：跟随 DSH 当前语言（内置 zh / en，其他回退 en）。

## 安装

任选其一（原件在本机用第 3 种；**本副本未安装**）：

1. **界面**：插件页 → 添加 → 从文件夹安装 → 选本目录。
2. **plugin_manager**：`install_bundle`，`target` 传本目录绝对路径。
3. **手工 link**：在 `<DSH_HOME>/profiles/<profile>/package.json` 中：

```json
{
  "dependencies": { "@local/task-complete-toast": "link:<本目录绝对路径，正斜杠>" },
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "@local/task-complete-toast"
  ] } }
}
```

生效规则：客户端改动刷新页面即生效；宿主改动与替换包需**重启应用**。

> **同包名冲突**：本副本与原件包名相同。若要安装本副本，先卸载/移除原件，或先改 `package.json` 的 `name` 与 `cordis.patch.yml` 的 `name`（同时需调整测试夹具中的包名断言）。

**2026-11-04 接管复核（原件历史）**：目录搬动后 junction 仍指向旧路径、bundle 列表也缺条目，插件曾静默消失。用 `plugin_manager` `remove_bundle` + `install_bundle` 重新安装后：junction 指向本目录，`include:task-complete-toast` 为 `active`，客户端 `shell.overlay` 有 `task-complete-toast`（order 100），`GET /dsh-task-complete/outcome` 返回预期 400/404。证据见 [`gates/2026-11-04-stage-0.md`](gates/2026-11-04-stage-0.md)。

## 配置

宿主 `Config`（写入 `cordis.patch.yml` 对应 entry 的 `config`）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；关时客户端完全不启动 |
| `notify.awaiting` | `true` | G2 授权/确认提醒开关；关时不订阅 `pendingInteraction` |
| `bridge.enabled` | `true` | 关时客户端只走启发式（不拉结果） |
| `bridge.routePath` | `/dsh-task-complete/outcome` | 结果路由 |
| `bridge.routeKind` | `exact` | `exact` / `prefix` |
| `bridge.ringSize` | `256` | 结果表容量（32–1024） |
| `bridge.entryTtlMs` | `600000` | 结果表 TTL |
| `bridge.exposeReason` | `true` | 关时响应只含 `sessionId/outcome/at` |
| `appearance.position` | `bottom-right` | `top-left` / `top-right` / `bottom-left` / `bottom-right` |
| `appearance.theme` | `system` | `system` 跟随；`light` / `dark` 只作用于弹窗 |
| `appearance.size` | `standard` | `compact` / `standard` |
| `appearance.durationMs` | `5000` | 完成卡停留 2000–15000 ms；G2 提醒不受影响 |
| `appearance.showTitle` | `true` | 完成卡标题；G2 提醒始终显示标题 |
| `appearance.fontSize` | `12` | 字号 12–18 px；标题 = 字号 +1；compact 明细 = −1 |
| `appearance.cardWidth` | `null` | `null` 跟随 `size`；或 280–480 px；最小宽度随字号联动 `max(280, fontSize×18)` |
| `appearance.backgroundColor` | `null` | `null` 跟随主题；或 `#RRGGBB`；与文字色对比度须 ≥4.5:1 |
| `appearance.textColor` | `null` | `null` 跟随主题；或 `#RRGGBB`；同上 |

客户端侧（`maxVisible`、`minRunMs`、`coalesceMs`、`cooldownMs`、`systemNotification`、`suppressWhenFocused`、`maxPerMinute`、`resolveBudgetMs`、`claimWindowMs`）仍为内置默认值，不支持经 patch 调整；G2/G3 的 `appearance` 已由宿主 `Config` 投影。**G3 无任意 CSS/主题引擎/配置面板**；这些需另行过门禁。

## 测试

在本目录执行：

```powershell
node --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js test/interaction.test.js
```

期望 `tests 169 / pass 169 / fail 0`。在受限沙箱内**必须**用 `--test-isolation=none`（默认模式 spawn 子进程会 `spawn EPERM`）。

## 已知限制

- 点击**系统通知**不会激活/还原最小化窗口（Electron + Windows；已接受为已知限制，见验收结果 §5-B）；应用内浮层点击可正常置前。
- `Notification.permission` 在 Electron 恒为 `granted`，`denied → deferred` 分支仅由单测覆盖。
- 状态行固定「待执行」（完成瞬间 Agent 空闲）；动态状态（执行中/等待回答）留待后续版本。
- **G2 v1.2.0**：进入会话即收起卡片；**页面不可见/被遮挡时仍发系统通知**（2026-11-05 真机通过：最小化 → 通知 → 拒绝后消失）；G2-8 双会话上限未测（已接受）；多标签浮层各显示一次、系统通知已认领单发；可用 `notify.awaiting:false` 单独关闭。
- **G3 v1.2.0**：改 `appearance` 需重启宿主（config 半区）；显式 light/dark 是作用域调色板，不改变全局主题；G3-4b 未单独真机实测（已接受，结构由 `sticky`/不传 `durationMs` 保证）。
- 13 项历史真机验收未做（V05/V08/V09/V10/V14/V16/V18/V20/V22/V24/V25/V26/V27），逐项原因见 `workspace/memory/v-baseline-v01-v28.md`。
- 配置面板不支持（`Config` 为手写 Standard Schema，属已知限制）。
- **G4 设置（grow-2）**：**已由人类验收（E2，无截图）**。设置页在 **设置 → 插件 → 任务完成提示设置**（侧边栏“插件”页的插件卡片只显示插件信息，不是设置页）。保存依赖宿主 `configEditor`，不可用时提示“无法保存”。G2 遮挡推送修复待真机；未发布前不称“正式发布”。
- 2026-11-04 G3 真机验收后 profile patch 已还原；若当前进程仍显示最后一轮的 `compact/无标题`，重启一次回到默认。

## 目录

```text
task-complete-toast-aecw/
├─ README.md  AGENTS.md
├─ STATUS.md  BLUEPRINT.md  ledger.md
├─ human/                  # direction / decisions / acceptance
├─ cluster/                # roster / board / runs / learning
├─ workspace/
│  ├─ work/                # 候选/草稿（产品代码在根）
│  ├─ evidence/            # E1/E2 原始证据与历史快照
│  ├─ memory/              # 设计契约、ADR、历史映射、V 项对账
│  └─ landing/             # 落地清单/交接/迁移记录
├─ gates/                  # 门禁一页（含 2026-11-05-adoption）
├─ inbox/                  # DR-002 / CR-001
├─ bin/aecw.mjs  core/     # AECW CLI + 模板
├─ package.json  cordis.patch.yml
├─ index.js                # 宿主：Config、结果表、路由、配置注入
├─ client.js               # 客户端：store、渲染、通知、结果桥
├─ lib/                    # config / outcome-table / classify / host
├─ locale/  icon.svg
└─ test/                   # 10 个测试文件
```
