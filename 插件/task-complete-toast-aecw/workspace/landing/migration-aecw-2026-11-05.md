# AECW 结构迁移记录 · 2026-11-05

> 对象：`task-complete-toast` v1.2.0 → `task-complete-toast-aecw`（本副本）。
> 依据：`D:\DSH\agent-engineering-control\prototype`（三域 / 六接口 / 单一 STATUS / 蓝图 + freeze + start / 台账 + 门禁）。
> 原则：**只搬结构、只改治理工件**；产品代码、测试、`package.json` 的版本与行为不变。

## 1. 迁移映射（旧 → 新）

| 旧位置 | 新位置 | 处理 |
|---|---|---|
| `docs/宪章.md` | `human/direction.md` | 按 AECW 方向模板重排；原文留存为 `workspace/evidence/charter-v1.0-original.md`（历史副本） |
| `docs/决策记录.md` | `human/decisions.md` + `workspace/memory/adr-001-023.md` | 人类决策与技术 ADR 分域；根因复盘留在 ADR 原文 |
| `docs/验收报告.md` | `human/acceptance.md` + `workspace/evidence/acceptance-report-v1.2.0.md` | 接受记录上表；报告详情留证据（§1–§6 历史，§14 发布口径） |
| `docs/交接说明.md` | `workspace/landing/handover-2026-11-04.md` | 交接/历史 |
| `docs/取证/台账.md` | `ledger.md` | 重排为 A/B/C 三表（异议/事实/变更）；S2 详情进 `inbox/DR-002.md` |
| `docs/取证/门禁-阶段0/1/2.md` | `gates/2026-11-04-stage-0/1/2.md` | 一页一道门，日期命名 |
| `docs/取证/真机*.md`、`G2-遮挡修复方案.md`、`阶段报告-*.md`、`试点数据-*.md`、`接手测试-*.md` | `workspace/evidence/` | 原样保留，修正相对链接 |
| `docs/设计.md` | `workspace/memory/design-contract-v1.2.0.md` | 行为契约作为项目记忆 |
| — | `STATUS.md` | 重写为唯一当前状态（AECW 模板） |
| — | `BLUEPRINT.md` | 新阶段 `steward-1` 蓝图（draft，待人类批准） |
| — | `cluster/`、`workspace/work/`、`workspace/landing/` | 新建：名册/任务板/运行/学习、产物区、落地区 |
| — | `inbox/DR-002.md`、`inbox/CR-001.md` | S2 详情 + G2 语义变更（blueprint 级） |
| — | `bin/aecw.mjs`、`core/*.md` | 从原型机复制：零依赖 CLI + 六份模板 |
| `docs/`（空目录） | — | 删除；旧路径不再存在 |

## 2. 校验（2026-11-05，本副本）

| 项 | 命令 | 结果 |
|---|---|---|
| 自动化 | `node --test --test-isolation=none test/*.test.js`（10 个文件） | **tests 160 / pass 160 / fail 0** |
| 语法 | `node --check`（17 个 JS） | **17/17** |
| 基线哈希 | `Get-FileHash`（client/config/package） | 与 F-029 完全一致 |
| 编码 | 全项目扫描 `U+FFFD` | **0** |
| 结构 | `node bin/aecw.mjs check .` | **FAIL 0｜WARN 0** |
| 链接 | 相对链接解析 | 0 个断链 |
| 产品代码 | 与原件的 22 个产品文件逐个 SHA-256 比对 | 全部一致（**迁移当时**）；迁移后 2026-11-05 的介绍文案与测试小改见 F-032 |

## 3. 负事实与边界

- **本副本未安装**：profile、junction、bundles 未改；宿主当前加载的仍是原件。任何“可用”声明都不适用于本副本，除非重新安装并探针。
- **未做真机**：迁移不改变运行行为，但也没有新增真机证据；G1/G2/G3 的 E2 结论继承自 2026-11-04 原件。
- **freeze/start 未执行**：蓝图 `draft`，人类未批准；`STATUS.md` 阶段状态为 `seed`，这是**正确的未开工状态**，不是遗漏。
- **所有者身份**：人类 2026-11-05 指令：按 **Git 提交人**记录，即 `meo1102`（`meo1102@163.com`）；不再写“待确认”。
- **图片证据仍为零**：迁移没有补截图；WP-5 负责。
- **同包名风险**：副本与原件同 id；同时安装会冲突。

## 4. 迁移后阅读顺序

1. [`STATUS.md`](../../STATUS.md)
2. [`human/direction.md`](../../human/direction.md)
3. [`BLUEPRINT.md`](../../BLUEPRINT.md)
4. [`ledger.md`](../../ledger.md)
5. [`gates/2026-11-05-adoption.md`](../../gates/2026-11-05-adoption.md)
6. [`workspace/landing/manifest.md`](manifest.md)
