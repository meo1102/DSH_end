# AGENTS.md · task-complete-toast

本目录是真实 DSH 插件产品代码，不是 `DSH_end` 指南示例；根 `DSH_end/AGENTS.md` 中「不是产品代码」的说明**不适用于本目录**。

## 开工前

1. 读 [`docs/宪章.md`](docs/宪章.md)——项目总约束，冲突时以它为准。
2. 读 [`docs/设计.md`](docs/设计.md)（v1.1.0 发布契约 + G2/G3 工作树契约）、[`docs/决策记录.md`](docs/决策记录.md)、[`docs/验收报告.md`](docs/验收报告.md)。
3. 看 [`docs/取证/台账.md`](docs/取证/台账.md) 与最近一道门禁；当前阶段状态以门禁检查单为准。

## 硬约束

- **只告知**：不批准/拒绝/确认/回复，不点击工具，不改会话状态，不向 agent 注入消息或信号。
- **只读最小元数据**：显示名、会话 id、状态、outcome、时间；不读消息正文、工具参数、文件内容、模型输出、密钥。
- **零第三方运行时依赖、无构建链**；不修改 DSH 源码/安装目录；不联网外发、不做遥测。
- **不写 localStorage/IndexedDB/cookie**；不持久化通知历史；不跨工作区/用户泄漏。
- **UTF-8 纪律**：改文件用编辑器或显式 UTF-8；写回后断言无 `U+FFFD`。不要用 PowerShell 默认编码改写中文文件。
- **测试桩按真实签名抛错**：不得比真实宿主宽松（历史两次真机崩溃的教训）。

## 测试

```powershell
node --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js test/resolver.test.js test/wiring.test.js test/presentation.test.js test/interaction.test.js
```

期望 `tests 158 / pass 158 / fail 0`。受限沙箱内**必须** `--test-isolation=none`（默认模式 spawn EPERM）。

## 完成定义

- 行为变更：先改 `docs/设计.md`，同步 `docs/决策记录.md`，再改代码与测试。
- 证据：事实写进台账；阶段结束更新门禁检查单；验收必须列失败/未测项，禁止「全绿」话术。
- 基线：阶段结束提交 commit/tag，记录源码/测试哈希与验收基线版本。
- 不声称 G2/G3 已发布；真机未验前只称「代码完成、未发布」。
