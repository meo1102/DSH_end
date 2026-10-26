# P2-B / P2-B2 实现报告（含 P2 收口统一测试）

| 项目 | 值 |
|---|---|
| 日期 | 2026-10-26 22:05（Asia/Shanghai） |
| 执行 | 新开发代理 `fcc9fc95-a5c7-4a42-8998-8dbe5c53b708` |
| 评审 | 架构代理只读走查 |
| 范围 | R2 多标签认领（ADR-011）+ ADR-013 离场计时 |
| 结论 | **P2 代码开发完成；P2-B 121/121，R1b-D1 修复后 124/124；V13 真机待复测** |

## 1. 改动文件

| 文件 | 改动 |
|---|---|
| `client.js` | `createTabId` / `createClaimLease`；store 接入 claim；`createDismissTimer` 改 enter/leave；`ToastCard` 改 ADR-013 交互；apply 接线租约 |
| `store.test.js` | R2-T0、T1、T1b、T2、T3、T4、T5、T6、T7（9 条） |
| `dismiss.test.js` | 删除 D02 旧“恢复剩余”断言；保留 D01/D03/D04；新增 D05–D08（4 条） |
| `harness.js` | `createBroadcastBus` 伪 BC（同步投递，记录频道/消息/关闭数） |

仅改包内代码与测试；未改 `package.json`、version、profile、`../` 文档；未安装/重启/调用 `plugin_manager`。

## 2. 自动化结果

命令与 R1a 相同（9 个测试文件，`--test-isolation=none`），Node `v24.21.0`：

```text
tests 121 / pass 121 / fail 0 / skip 0 / cancelled 0 / todo 0
EXITCODE=0
```

构成：原 109 − D02(1) + D05–D08(4) + R2(9) = 121。D02 是**契约变更后删除并由更严格用例替代**，不是放宽。

### 2.1 P2 收口统一测试（2026-10-26 22:08）

- 全量 9 个测试文件复跑：`tests 121 / pass 121 / fail 0 / cancelled 0 / skipped 0 / todo 0`，`duration 79.3445ms`，`EXITCODE=0`。
- `node --check`：`client.js`、`index.js`、`lib/classify.js`、`lib/config.js`、`lib/host.js`、`lib/outcome-table.js` 全部 `EXIT=0`。
- 静态核对：
  - `dismiss.test.js`：D02 计数 0，`.pause(`/`.resume(` 计数 0，旧“恢复剩余”断言不存在；D05–D08 各 1 条。
  - `store.test.js`：R2-T0、T1、T1b、T2、T3、T4、T5、T6、T7，共 9 条。
  - `package.json` 版本仍为 `1.1.0`，收口前后 hash 一致；profile link 仍指向代码包。
  - 变更仅 `client.js`、`test/store.test.js`、`test/dismiss.test.js`、`test/harness.js`；`package.json`/`lib`/`index.js`/`cordis.patch.yml`/locale/icon 未改。
- 结论：**P2 代码开发完成（自动化门禁）**；不等于真机验收通过，R1b 仍必需。

## 3. R2 实现评审（ADR-011）

- 频道/消息/胜者规则与 ADR-011 一致：`dsh-task-complete-toast/v1`；`{v:1,type:'claim',sessionId,tabId,at}`；`tabId` 字符串、字典序最小；无 BC 恒胜。
- `tabId` 在页面加载生成一次；`settling` 起点与 resolver 并行；`decide` 时 lost/pending/won 处理符合契约。
- 输家不入队、不通知、不更新冷却/发射计数；通知只由队列驱动。
- 频道在页面加载打开，并加 ≤`claimWindowMs` 的“最近 claim”缓存，用于覆盖窗口边界竞态。**架构评审接受**，理由：不改变频道/消息/胜者规则，只减少“早结算标签已过窗、晚结算标签看不到”导致的重复；代价是更小 tab 在 80 ms 内关闭时可能让另一方误判失败（低概率，R1b 真机观察）。
- `connection/reset`、卸载、dispose 关闭频道并清理在途；迟到结果由 generation/state 守卫丢弃。

## 4. ADR-013 实现评审

- 出现起完整 `durationMs`；enter 取消；leave 从零重新完整计时；held 期间重复 enter 不重置。
- 鼠标只绑一对 `onMouseEnter`/`onMouseLeave`；焦点用 `relatedTarget` 判断卡片内移动；出现时 `:hover` 按移入；页面隐藏暂停、恢复重新计时。
- 点击/Esc/关闭行为不变。
- D05–D08 覆盖 10 s 悬停、3→8 s、3/7/9→14 s、焦点；D02 旧断言已删除。

## 5. 未覆盖与风险

- 真机 V21 双标签、V28 悬停未执行；伪 BC 同步投递比真实异步更严格，仍需真机。
- 两标签认领起点相差 >`claimWindowMs` 时仍可能双弹（ADR-011 窗口语义）。
- `:hover` 初始判断、React `focus/blur` 的 `relatedTarget` 无 DOM 级单测，需 V28。
- 若桌面端 `window.BroadcastChannel` 不可用，按无 BC 恒胜，V21 失效——需真机确认。
- 当前 GUI 页面未刷新，运行中的客户端仍是旧行为；刷新后生效。

## 6. R1b 准入

- 自动化门禁：**通过**（121/121）。
- 代码侧可进入 R1b；先刷新 GUI 页面，优先 V28（离场重新 5 s）与 V21（双标签只一个浮层/一条通知）。
- 仍需用户手测：V02/V07/V13/V14/V17/V21/V28；V19/V27 需授权。
- R1b 全量 V01–V28 通过后，才可判 P2 完成。

## 7. 合规声明

开发代理未安装/卸载、未改配置/version/profile/设计文档、未调用 `plugin_manager`、未执行 V19/V27、未重启；只改包内代码/测试并跑自动化。架构代理只读走查，未改代码。

## 8. R1b-D1 修复（2026-10-26 23:35 / 23:50）

### 8.1 第一版（124/124，真机仍失败）

- **根因判断**：通知由 `ToastHost` 渲染后的 `onRendered` 触发；遮挡时 React 不渲染，通知不发；回前台渲染时页面可见，`auto` 又 skip。
- **修复**：store 入队后同步 `onEnqueued`；`apply` 用 `textFor` 做渲染无关文案解析并直接通知；`handled` 按 key 去重；渲染路径只兜底。
- **结果**：124/124；真机完全遮挡仍无通知，证明只解决渲染依赖不够。

### 8.2 第二版（128/128，待 V13）

- **前台标志**：`createForegroundTracker` 用 `window.focus/blur`，notifier 不再只信 `hasFocus()`。
- **后台快路径**：`running:false` 且不在前台时用 `queueMicrotask` 调度 `decide`；前台保留 250 ms。
- **标题不倒退**：后台 resolution pending 时等 `resolutionPromise`，不用 `completed` 顶替 `error`。
- **测试**：新增 D1-4/5/6/7；`tests 128 / pass 128 / fail 0`；`node --check` 6/6；版本 1.1.0。
- **状态**：第二版修复完成（自动化）；V13 需带 `[task-complete-toast]` 日志复测。若 `status:false` 只在回前台出现，渲染进程被冻结，需宿主侧方案。
