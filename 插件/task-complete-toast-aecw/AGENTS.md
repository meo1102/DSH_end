# AGENTS.md · task-complete-toast（AECW 副本）

本目录是真实 DSH 插件产品代码 + AECW 治理结构，不是 `DSH_end` 指南示例；根 `DSH_end/AGENTS.md` 中「不是产品代码」的说明**不适用于本目录**。
产品代码基线 = v1.2.0；本副本于 2026-11-05 从原件复制并按 `agent-engineering-control/prototype` 结构重排，**产品逻辑未改**；同日按人类指令更新介绍文案与回归断言（F-031/F-032）。

## 开工前

0. 先读 [`STATUS.md`](STATUS.md)——**唯一当前状态**；其他文档是证据/历史，冲突时以 STATUS 为准。
1. 读 [`human/direction.md`](human/direction.md)——方向/边界/S1–S4/停止（继承试点宪章 v1.0）。
2. 读 [`BLUEPRINT.md`](BLUEPRINT.md)——阶段 `grow-2`（外观设置 + 实时预览，**已关闭/有条件通过**）；下一阶段须新蓝图 + 重新 `freeze`/`start`，不自动续跑。
3. 读 [`ledger.md`](ledger.md)、最近的 [`gates/`](gates/)；设计契约与 ADR 在 [`workspace/memory/`](workspace/memory/)；原始证据在 [`workspace/evidence/`](workspace/evidence/)。
4. 旧文档编号（D-001/D-002、旧 G2-6、`8D034A…`）先查 [`workspace/memory/history-mapping.md`](workspace/memory/history-mapping.md)，不要按字面理解。

## 硬约束

- **只告知**：不批准/拒绝/确认/回复，不点击工具，不改会话状态，不向 agent 注入消息或信号。
- **只读最小元数据**：显示名、会话 id、状态、outcome、时间；不读消息正文、工具参数、文件内容、模型输出、密钥。
- **零第三方运行时依赖、无构建链**；不修改 DSH 源码/安装目录；不联网外发、不做遥测。
- **不写 localStorage/IndexedDB/cookie**；不持久化通知历史；不跨工作区/用户泄漏。
- **不跳过门禁**：没有 `freeze` 不 `start`；没有 `start` 不执行阶段任务；阶段结束必须停、报告、等下一道门。
- **不原地改冻结基线**：方向/蓝图/验收变更走 `change`，升版本 + 影响分析 + 人类裁决；新版本重新 freeze/start。
- **未开工前不改产品代码**：`freeze` + `start` 之前只做只读/规划；开工后按蓝图工作包改代码，不在 `grow-2` 内静默扩范围。
- **UTF-8 纪律**：改文件用编辑器或显式 UTF-8；写回后断言无 `U+FFFD`。不要用 PowerShell 默认编码改写中文文件。
- **测试桩按真实签名抛错**：不得比真实宿主宽松（历史两次真机崩溃的教训）。
- **未测就写未测**：E2 不得写成 E1；禁止「全绿」话术；没有截图就标“证据缺口”。

## 测试

```powershell
node --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js test/interaction.test.js
```

期望 `tests 169 / pass 169 / fail 0`。受限沙箱内**必须** `--test-isolation=none`（默认模式 spawn EPERM）。

## AECW CLI

```powershell
node bin/aecw.mjs status .
node bin/aecw.mjs check .
node bin/aecw.mjs gate . --name <门禁名> --decision 有条件通过
node bin/aecw.mjs fact . --statement "..." --source "..." --status 已核验 --verifier "..."
node bin/aecw.mjs dissent . --severity S2 --type 风险 --claim "..." --evidence "..."
node bin/aecw.mjs change . --type task|blueprint|charter --title "..." --reason "..." --impact "..."
node bin/aecw.mjs freeze . --charter-confirmed --stage grow-2 --scope ... --budget ... --stop ... --acceptance ...
node bin/aecw.mjs start . --by meo1102 --first-report "..."
```

## 完成定义

- 行为变更：先改 [`workspace/memory/design-contract-v1.2.0.md`](workspace/memory/design-contract-v1.2.0.md) 与 [`workspace/memory/adr-001-023.md`](workspace/memory/adr-001-023.md)，再改代码与测试。
- 证据：事实写进 `ledger.md`（F 编号）；阶段结束更新门禁；验收必须列失败/未测项。
- 基线：阶段结束提交 commit/tag，记录源码/测试哈希与验收基线版本。
- 当前发布口径：v1.2.0；G2-8、G3-4b 等已知未测见 `STATUS.md` §3/§4，不写「全绿」。
- 每道门/发布先更新 `STATUS.md`，再更新其他文档；旧文档标 `SUPERSEDED`。
