# P2-A R1a 基线报告

| 项目 | 值 |
|---|---|
| 日期 | 2026-10-26 21:55（Asia/Shanghai） |
| 执行 | 新开发代理 `fcc9fc95-a5c7-4a42-8998-8dbe5c53b708`；架构代理复核 overlay |
| 范围 | P2-A / R1a 冒烟（不实现 R2/ADR-013） |
| 结论 | **有条件通过**：自动化 109/109；V01 已由架构复核确认；5 个手测项与 V19/V27 授权待用户 |

> **P2-B 后续（2026-10-26 22:05）**：R2 与 ADR-013 已代码完成，自动化 121/121；本报告是 R1a 快照，R2/ADR-013 当前状态见 [`P2-B-实现报告.md`](P2-B-实现报告.md)。

## 1. 包与安装

- 代码包：`D:\DSH_end\插件\开发\task-complete-toast`，版本 `1.1.0`。
- 安装路径：`C:\Users\meo11\.dsh\profiles\desktop\node_modules\@local\task-complete-toast` 为 ReparsePoint，Target 指向代码包（link 安装，与 P0 一致）。

## 2. 自动化基线

在 `task-complete-toast\` 下执行：

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js
```

结果：Node `v24.21.0`；`tests 109 / pass 109 / fail 0 / skip 0`；exit `0`。文档基线复现。

## 3. 环境与 overlay

- 开发代理曾连续 4 次 `Slots.listSubTree(root:"shell.overlay")` 超时（页面未连通）。
- 架构代理随后复核同一查询成功：`shell.overlay` 共 12 个占位者，`task-complete-toast` 为 `order: 100`、`active: true`。**V01 通过**。
- `Config.listConfigs(name:"@local/task-complete-toast")`：1 条，`status=unsupported`，与 P0 已知限制一致。

## 4. R1a 条目判定

| 编号 | 判定 | 说明 |
|---|---|---|
| V01 | **通过** | 架构复核 overlay：`task-complete-toast` `active: true` |
| V02 | **需用户手测** | 5 s 任务 + 切走 + 离场计时；自动层只有 D01/D02（D02 仍为旧语义） |
| V03 | **自动化通过** | U15/U16/U16b/W02/S6；真机目视可选 |
| V07 | **需用户手测** | P06 覆盖点击→dismiss+openSession；真机聚焦/回跳未证 |
| V13 | **需用户手测** | OS 通知落点、点击回跳无法自动 |
| V14 | **需用户手测** | 真实权限拒绝需站点设置；N04/N07/P04/P05 覆盖 deferred |
| V17 | **需用户手测** | W02 证 zh/en 字典；真机切换与 `Plugins[Toast popup] · Idle` 需目视 |
| V19 | **需授权/需用户** | 禁用/再启用未执行，未调用 `plugin_manager` |
| V27 | **需授权/需用户** | 改 desktop profile patch 未执行 |

## 5. 观察（未修复）

- `dismiss.test.js` 仍为 D01–D04；D02 断言“暂停不 dismiss、恢复后按剩余时间”，与 ADR-013 冲突；D05–D08 尚不存在。此状态符合 P2-B2 之前，不计失败。
- 自动化全绿，暂无 P1/P2 证据；真机缺陷需手测判定。

## 6. 结论与下一步

- **R1a = 有条件通过**：自动化 109/109；V01 通过；V02/V07/V13/V14/V17 待用户手测；V19/V27 待授权。
- 为不阻塞开发，R2 与 ADR-013 可并行启动；R1b 必须覆盖最终构建的全量 V01–V28。
- 用户仍需：手测 5 项；授权 V19（禁用/再启用）与 V27（patch `enabled:false` 并恢复）。
- 本报告由架构代理记录；开发代理未写代码、未改配置、未安装。
