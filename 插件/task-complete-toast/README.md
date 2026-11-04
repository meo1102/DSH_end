# 任务完成提示（task-complete-toast）

> **开发约束**：先读 [`docs/宪章.md`](docs/宪章.md)。它是项目总约束；已发布 `1.1.0` 只交付 **G1（完成提示）**，工作树另含 **G2（授权/确认提醒）** 与 **G3（弹窗样式自定义）**（未发布，待真机）。

DSH 持久化插件：当 Agent 从运行变为空闲时，在窗口右下角提示任务完成；当页面不可见或被遮挡时，改发 Windows 系统通知。

| 项 | 值 |
|---|---|
| 包名 | `@local/task-complete-toast` |
| 版本 | `1.1.0`（发布基线）；工作树含 G2/G3，验证后升 `1.2.0` |
| 目标环境 | DSH Desktop `0.2.1-rc.3`（Cordis），Windows |
| 代码状态 | G1 已发布；G2/G3 代码完成、待真机； |
| 自动化 | **158/158** 通过，`node --check` 17/17（2026-11-04 复核） |
| 真机验收 | 历史 **10 通过 / 1 部分 / 13 挂账**（未复验）；2026-11-04 已重新安装并加载，见 [`docs/取证/门禁-阶段0.md`](docs/取证/门禁-阶段0.md) |

## 功能

- **完成判定**：`api-session/status` 的 `running: true → false`，经 250 ms 观察窗确认（不看 Goal、不等后台 job）。
- **文案**：两行；标题（任务完成/失败/已停止/已中断/被阻止）+ 明细 `<工作区>[<会话>] · 待执行`。
- **结果桥**：区分完成 / 失败 / 中断 / 被阻止 / 停止；用户主动取消不提示。宿主记录 `turn/end`，客户端按需拉取。
- **自动消失**：默认 5 s；鼠标移入或焦点进入取消计时，移出/失焦后**重新完整 5 s**（ADR-013）。
- **系统通知**：页面不可见或被遮挡时发送；每条唯一 `tag`（≤34 字符）；点击关闭通知（不激活窗口，平台限制）。
- **多标签**：80 ms 认领窗，`tabId` 字典序最小胜出；认领未决时等窗口结束再判定（ADR-015）。
- **G2 授权/确认提醒（工作树，未发布）**：只读 `uiSession.sessionStatus` 的 `pendingInteraction`；等待授权/回答时显示常驻提醒，解决后自动移除；页面不可见时发系统通知。不拦截 waterfall、不代替人类回答。
- **G3 弹窗样式自定义（工作树，未发布）**：`appearance.position` 四角、`theme` 跟随/亮/暗、`size` 紧凑/标准、`durationMs` 2–15 s、`showTitle`；纯 token，无任意 CSS。
- **语言**：跟随 DSH 当前语言（内置 zh / en，其他回退 en）。

## 安装

任选其一（本机用第 3 种）：

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

**2026-11-04 接管复核**：目录搬动后 junction 仍指向旧路径、bundle 列表也缺条目，插件曾静默消失。本次用 `plugin_manager` `remove_bundle` + `install_bundle` 重新安装：junction 已指向本目录，`include:task-complete-toast` 为 `active`，客户端 `shell.overlay` 有 `task-complete-toast`（order 100），`GET /dsh-task-complete/outcome` 返回预期的 400/404。证据见 [`docs/取证/门禁-阶段0.md`](docs/取证/门禁-阶段0.md)。

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
| `appearance.durationMs` | `5000` | 完成卡停留 2000–15000 ms；G2 常驻提醒不受影响 |
| `appearance.showTitle` | `true` | 完成卡标题；G2 提醒始终显示标题 |

客户端侧（`maxVisible`、`minRunMs`、`coalesceMs`、`cooldownMs`、`systemNotification`、`suppressWhenFocused`、`maxPerMinute`、`resolveBudgetMs`、`claimWindowMs`）仍为内置默认值，不支持经 patch 调整；G2/G3 的 `appearance` 已由宿主 `Config` 投影。**G3 无任意 CSS/主题引擎/配置面板**；这些需另行过门禁。

## 测试

在本目录执行：

```powershell
node --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js test/interaction.test.js
```

期望 `tests 158 / pass 158 / fail 0`。在受限沙箱内**必须**用 `--test-isolation=none`（默认模式 spawn 子进程会 `spawn EPERM`）。

## 已知限制

- 点击**系统通知**不会激活/置前窗口（Electron + Windows AUMID 限制）；应用内浮层点击可正常置前。
- `Notification.permission` 在 Electron 恒为 `granted`，`denied → deferred` 分支仅由单测覆盖。
- 状态行固定「待执行」（完成瞬间 Agent 空闲）；动态状态（执行中/等待回答）留待 v1.2。
- **G2 已进入工作树但未发布**：需一次真实授权/提问触发验证；多标签会各显示一次提醒；可用 `notify.awaiting:false` 单独关闭。
- **G3 已进入工作树但未发布**：需重启宿主（config 半区）+ 刷新页面；显式 light/dark 是作用域调色板，不改变全局主题。
- 13 项真机验收未做（V05/V08/V09/V10/V14/V16/V18/V20/V22/V24/V25/V26/V27），逐项原因见验收报告；2026-11-04 重新安装后待复验。
- 配置面板不支持（`Config` 为手写 Standard Schema，属已知限制）。

## 目录

```text
task-complete-toast/
├─ AGENTS.md            # 本目录开发约定（先读宪章）
├─ package.json  cordis.patch.yml
├─ index.js            # 宿主：Config、结果表、路由、配置注入
├─ client.js           # 客户端：store、渲染、通知、结果桥
├─ lib/                # config / outcome-table / classify / host
├─ locale/  icon.svg
├─ test/               # 11 个测试文件（含 interaction.test.js）
└─ docs/
   ├─ 宪章.md           # 项目总约束（先读）
   ├─ 设计.md
   ├─ 决策记录.md
   ├─ 验收报告.md
   ├─ 交接说明.md
   └─ 取证/
      ├─ 台账.md
      ├─ 真机验收清单.md
      ├─ 阶段报告-2026-11-04.md
      ├─ 门禁-阶段0.md
      ├─ 门禁-阶段1.md
      └─ 门禁-阶段2.md
```
