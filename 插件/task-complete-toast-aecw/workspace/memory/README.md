# 项目记忆 · task-complete-toast

> 项目记忆：行为契约、决策（ADR）、历史编号映射、负记忆/根因、V 项对账。
> 写法：判断/规范必须引用事实（`ledger.md` F 编号）；过期条目标 `SUPERSEDED`；当前状态只看 `../STATUS.md`。

## 内容

| 文件 | 内容 | 时效 |
|---|---|---|
| [`design-contract-v1.2.0.md`](design-contract-v1.2.0.md) | v1.2.0 行为契约 + §16 G4 增量（字号/宽度/颜色/设置页/预览） | 当前（G4 未发布、未真机） |
| [`adr-001-023.md`](adr-001-023.md) | ADR-001–023 + 真机缺陷根因复盘（A–E） | 当前 |
| [`history-mapping.md`](history-mapping.md) | 版本/发布/G2 编号/哈希的 11 条矛盾裁决；D→DR 映射 | 当前（防旧文档污染） |
| [`v-baseline-v01-v28.md`](v-baseline-v01-v28.md) | V01–V28 逐项状态与建议处置 | 当前（待人类逐项裁决） |
| [`appearance-settings-design.md`](appearance-settings-design.md) | G4 外观设置 + 预览：探针、A 方案、字段契约、实施状态 | 已实现（代码+单测）；真机未验 |
| [`g4-charter-impact.md`](g4-charter-impact.md) | G4 / G3 约束放宽的 charter 级影响分析 | 已批准（2026-11-05）；留档 |
| [`ev-001-runtime-probe.md`](ev-001-runtime-probe.md) | EV-001 运行态探针进化提案（假设/证据/影响/回滚/可证伪） | trial（试用通过，未激活） |

## 负记忆（本项目真实踩过的坑）

- **文档声称 ≠ 运行事实**：README/交接说已安装，实际静默未加载（F-003/F-004）。
- **常驻浮层会遮挡授权按钮**：单测覆盖不到，真机才发现（DR-002 / ADR-023）。
- **同名通知 tag 会被 Windows 静默吞掉**：V13 两次修错方向（ADR-014）。
- **测试替身比真实宽松**：两次真机崩溃（ADR-016 / AGENTS 规则）。
- **PowerShell 默认编码会破坏中文**：explicit UTF-8 + 无 `U+FFFD` 断言。
- **同一事实多份文档 = 多个时间切片**：11 个分叉；用 STATUS + SUPERSEDED + 映射表收敛。
