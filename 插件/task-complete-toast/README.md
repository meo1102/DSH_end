# 任务完成提示（task-complete-toast）

DSH 持久化插件：当 Agent 从运行变为空闲时，在窗口右下角提示任务完成；当页面不可见或被遮挡时，改发 Windows 系统通知。

| 项 | 值 |
|---|---|
| 包名 | `@local/task-complete-toast` |
| 版本 | `1.1.0` |
| 目标环境 | DSH Desktop `0.2.1-rc.3`（Cordis），Windows |
| 代码状态 | 完成 |
| 自动化 | **142/142** 通过，`node --check` 16/16 |
| 真机验收 | **10 通过 / 1 部分 / 13 挂账未验**（见 [`docs/验收报告.md`](docs/验收报告.md)） |

## 功能

- **完成判定**：`api-session/status` 的 `running: true → false`，经 250 ms 观察窗确认（不看 Goal、不等后台 job）。
- **文案**：两行；标题（任务完成/失败/已停止/已中断/被阻止）+ 明细 `<工作区>[<会话>] · 待执行`。
- **结果桥**：区分完成 / 失败 / 中断 / 被阻止 / 停止；用户主动取消不提示。宿主记录 `turn/end`，客户端按需拉取。
- **自动消失**：默认 5 s；鼠标移入或焦点进入取消计时，移出/失焦后**重新完整 5 s**（ADR-013）。
- **系统通知**：页面不可见或被遮挡时发送；每条唯一 `tag`（≤34 字符）；点击关闭通知（不激活窗口，平台限制）。
- **多标签**：80 ms 认领窗，`tabId` 字典序最小胜出；认领未决时等窗口结束再判定（ADR-015）。
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

## 配置

宿主 `Config`（写入 `cordis.patch.yml` 对应 entry 的 `config`）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；关时客户端完全不启动 |
| `bridge.enabled` | `true` | 关时客户端只走启发式（不拉结果） |
| `bridge.routePath` | `/dsh-task-complete/outcome` | 结果路由 |
| `bridge.routeKind` | `exact` | `exact` / `prefix` |
| `bridge.ringSize` | `256` | 结果表容量（32–1024） |
| `bridge.entryTtlMs` | `600000` | 结果表 TTL |
| `bridge.exposeReason` | `true` | 关时响应只含 `sessionId/outcome/at` |

客户端侧（`position`、`maxVisible`、`durationMs`、`minRunMs`、`coalesceMs`、`cooldownMs`、`showTitle`、`systemNotification`、`suppressWhenFocused`、`maxPerMinute`、`resolveBudgetMs`、`claimWindowMs`）为内置默认值，v1.1 不支持经 patch 调整。

## 测试

在本目录执行：

```powershell
node --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js
```

期望 `tests 142 / pass 142 / fail 0`。在受限沙箱内**必须**用 `--test-isolation=none`（默认模式 spawn 子进程会 `spawn EPERM`）。

## 已知限制

- 点击**系统通知**不会激活/置前窗口（Electron + Windows AUMID 限制）；应用内浮层点击可正常置前。
- `Notification.permission` 在 Electron 恒为 `granted`，`denied → deferred` 分支仅由单测覆盖。
- 状态行固定「待执行」（完成瞬间 Agent 空闲）；动态状态（执行中/等待回答）留待后续版本。
- 13 项真机验收未做（V05/V08/V09/V10/V14/V16/V18/V20/V22/V24/V25/V26/V27），逐项原因见验收报告。
- 配置面板不支持（`Config` 为手写 Standard Schema，属已知限制）。

## 目录

```text
task-complete-toast/
├─ package.json  cordis.patch.yml
├─ index.js            # 宿主：Config、结果表、路由、配置注入
├─ client.js           # 客户端：store、渲染、通知、结果桥
├─ lib/                # config / outcome-table / classify / host
├─ locale/  icon.svg
├─ test/               # 10 个测试文件
└─ docs/
   ├─ 设计.md
   ├─ 决策记录.md
   ├─ 验收报告.md
   └─ 交接说明.md
```
