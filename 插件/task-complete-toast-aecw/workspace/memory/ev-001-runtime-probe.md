# EV-001 · 运行态探针（已激活）

> 状态：**active（2026-11-05 人类激活）**｜风险：低（只读脚本，无产品改动）｜日期：2026-11-05
> 来源候选：[`../../cluster/learning.md`](../../cluster/learning.md) “把运行态探针（安装/路由/slot/版本）做成只读脚本，每道门前跑一次”。

## 1. 假设

把“文档说已安装 / 实际未加载”的运行态检查从**多轮手工探针**变成**一条只读命令**，在每道门/接手前跑：

- 预期观察量：一次运行得到 7 项结论（包版本、profile link、bundles、junction 目标、patch 配置、outcome 路由、settings 路由）；
- 手工步骤从 5+ 轮降到 1 条命令；
- 对当前绿色基线：7/7 PASS；对断开的路由：FAIL 且退出码 1。

## 2. 证据

| 证据 | 内容 |
|---|---|
| F-003/F-008 | 接管时 README 称“已安装启用”，实际 bundle 缺失 + junction 指向旧路径；修复后仍需探针 |
| F-033/F-036 | 设置页/`configEditor` 能力只能靠多轮 inspect/HTTP 探针确认 |
| F-038/F-039 | 替换安装后需要 profile/junction/plugin active/slot 多步核对 |
| 本次正控 | `node scripts/probe.mjs` → **7/7 PASS**，exit 0（2026-11-05，当前 GUI `36574`） |
| 本次负控 | `node scripts/probe.mjs --url http://127.0.0.1:1` → **5/7**，两条 HTTP FAIL，exit 1 |

> 局限：这是**单一项目**的证据；不能证明对其它插件/其它 profile 同样有效（需分布外验证）。

## 3. 影响面

- 新增：`scripts/probe.mjs`（只读、零依赖）、本提案、进化台账、证据记录。
- 不改：产品代码、`Config`、门禁判据、权限、角色、验收基线。
- 影响角色：集群管家/接手者（少做手工探针）；人类（可在门禁前看一条 PASS/FAIL）。
- 不替代：人类真机目视、截图、G2 行为测试；只做运行态结构检查。

## 4. 评估计划

- 在接下来 **2 道门/2 周**（先到为准）中，每道门前跑一次，记录 PASS/FAIL 与实际是否一致；
- 对照：与手工 `plugin_manager` + `cordis_inspect_query` + HTTP 探针结果比对；
- 分布外：至少换一个 profile 或另一个插件目录跑一次（当前未做，列为下一步）；
- 中止条件：出现 false PASS（已知漂移却 PASS）、false FAIL（绿色基线 FAIL）、单次 >5 s，或 2 周内 0 次实际拦截 → 降级/退役；
- 最长时限：2 周。

## 5. 回滚

- 回滚单元：删除 `scripts/probe.mjs`、本提案、进化台账行、证据文件；无产品代码/配置/记忆写入需要恢复。
- 回滚触发：false PASS、误报阻断门禁、维护成本高于手工。
- 演练：脚本不被产品代码 import（可 `git grep scripts/probe` 验证）；删除后产品/测试不受影响。**未做真实删除演练**，列为下次评估项。

## 6. 可证伪声明

- 必须捕获当前 7 项事实；若任一已知事实漏检，或绿色基线上出现 FAIL，或坏 URL 仍 PASS，则本提案失败；
- 承诺：每道门节省至少 3 轮手工探针；未达到则降级；
- 分布外任务上若出现 false PASS/FAIL，则不得推广到其他项目。

## 7. 本次试用结果（2026-11-05）

```text
PASS  宿主 package.json — @local/task-complete-toast@1.2.0
PASS  profile dependency link — link:D:/DSH/DSH_end/插件/task-complete-toast-aecw
PASS  profile bundles — @local/task-complete-toast
PASS  junction target — D:\DSH\DSH_end\插件\task-complete-toast-aecw
PASS  profile patch config — task-complete-toast + appearance
PASS  HTTP outcome route (expect 400) — 400
PASS  HTTP settings route (expect 400/422, no write) — 400

AECW EV-001 probe: 7/7 passed · http://127.0.0.1:36574
exit=0
```

负控（坏 URL）：

```text
FAIL  HTTP outcome route (expect 400) — fetch failed
FAIL  HTTP settings route (expect 400/422, no write) — fetch failed
AECW EV-001 probe: 5/7 passed · http://127.0.0.1:1
exit=1
```

结论：**试用通过**（正控全绿、负控能拦住）。**未激活**：尚未写入 AGENTS“每道门必跑”，也未推广到其它项目。

## 8. 进化门

- 风险：低；只读；可回滚；不改判据/权限。
- 授权：人类 2026-11-05 “先做个进化试试” → 试用；**2026-11-05 “激活”** → 写入 `AGENTS.md` 门禁/交付前必跑。
- 激活内容：`AGENTS.md` 开工前第 5 条 + 硬约束 + 测试命令；FAIL 时不得开门禁/交付。
- 当前边界：仅本项目单机单 profile；分布外验证与真实回滚演练仍列在评估计划中，未完成前不得推广到其它项目。
