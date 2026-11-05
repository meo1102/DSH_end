# 任务板 · task-complete-toast

> 当前阶段：`grow-2`（**已冻结/已开工**，2026-11-05）。按 WP 执行；阶段结束必须停、报告、等下一道门。
> 产品代码在开工后按工作包修改；本阶段不做 G2-8/G3-4b/V 项（见积压）。

| ID | 任务 | 负责人 | 状态 | 输入 | 输出 | 验收 |
|---|---|---|---|---|---|---|
| T-000 | AECW 结构迁移（副本初始化） | 单代理（人类指令） | done | 原件 v1.2.0；原型机 `agent-engineering-control/prototype` | 三域结构 + `bin/aecw.mjs` + 迁移门禁 | `gates/2026-11-05-adoption.md`；F-030 |
| T-001 | WP-0 设置可行性探针与方案裁决 | 集群管家 + 人类 | done | DSH Slots/Service/Theme 探针；F-033/F-036 | 方案结论：A（`configEditor`） | 宿主服务存在；真机行为待 WP-5 |
| T-002 | WP-1 设置契约与配置模型 | 实现者 | done | WP-0；现有 `appearance` | `lib/config.js` + 投影 + 单测 | 边界/联动/颜色校验；旧字段不回归 |
| T-003 | WP-2 设置页 UI（`settings.plugins.tab`） | 实现者 | done（tab 已注册；UI 待确认） | WP-1；slots/locale | 设置页组件 + zh/en 文案 | 渲染测试通过；真机 tab occupant 已确认（F-039）；内容待人工确认 |
| T-004 | WP-3 实时预览 | 实现者 | done（未真机） | WP-2 | 设置页内样例卡预览 | 渲染测试含 preview；真机未确认 |
| T-005 | WP-4 持久化与生效（A 方案） | 实现者 | done（host 已验证） | WP-0；WP-1 | host 路由 + `configEditor.edit` | I22 + live 200/400/422 + `cordis.patch.yml`（F-038） |
| T-006 | WP-5 测试与真机矩阵 | 实现者 + 人类目视 | done（阶段关闭） | WP-2..4 | 真机记录 + 截图 | G4 验收（E2）+ G2 遮挡推送真机（E2）；截图仍为零，已在门禁列为缺口 |
| T-007 | WP-6 文档与介绍一致性 | 工作区策展 | done | 上述输出 | 契约 §16、README、AGENTS、STATUS | 无“骨架/占位”旧文案 |
| T-008 | 插件介绍文案修正（任务级，2026-11-05） | 单代理 | done | F-031 旧文案；v1.2.0 能力 | `locale/zh.json`、`locale/en.json`、README；smoke 回归断言 | F-032；当时 smoke 7/7、全量 160/160 |

## 积压（不进 `grow-2`，后续阶段处理）

| ID | 项 | 状态 | 说明 |
|---|---|---|---|
| B-001 | G2-8 双会话并发/上限/顺序 | 已接受遗留（F-028） | 后续补真机 |
| B-002 | G3-4b 提醒卡时长未单独真机 | 已接受遗留（F-028） | 后续补真机 |
| B-003 | 13 项历史 V 项 + V01/V04/V23 | 未裁决 | 需人类逐项做/接受/删除 |
| B-004 | 真机截图/录屏 | 零 | `grow-2` WP-5 会补设置页/预览/提示卡截图 |

## 说明

- 任务级变更（同一工作包内换实现/补测试）记 `cluster/runs.md`；改验收/范围/顺序必须走 `change --type blueprint`。
- S1/S2 一出现就停高风险动作，先 `dissent` 进 `inbox/`，再等人类裁决。
- 本阶段的前置：charter 级变更（G4/约束放宽）+ 蓝图 v2 批准 + `freeze` + `start`，四者缺一不可。
