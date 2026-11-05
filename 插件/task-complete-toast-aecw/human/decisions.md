# 人类决策记录 · task-complete-toast

> 只记“决定 / 理由 / 影响”。S1/S2 见 `ledger.md` 与 `inbox/`；技术决策（ADR-001–023）见 [`workspace/memory/adr-001-023.md`](../workspace/memory/adr-001-023.md)。
> **署名口径（2026-11-05 人类指令）**：人类按 **Git 提交人**记录 = `meo1102`（`meo1102@163.com`）。原记录中的「本会话发起人 / 人类本人」统一对应此人，不再写“待确认”。

| 日期 | 决策 | 理由 | 影响 |
|---|---|---|---|
| 2026-11-04 | 批准宪章 **v1.0**（仅批准生效，无条款实质变更） | 提供项目总约束：方向/边界/停止/红线 | 阶段 0 门禁；F-020 |
| 2026-11-04 | G1 系统通知点击**不承诺**拉起/还原最小化窗口，接受为 R1 已知限制 | 还原窗口需宿主 `BrowserWindow.restore()/show()`，越界「不改宿主」 | 设计 §9 与 README 口径收窄；F-022 |
| 2026-11-04 | G2 **不要求常驻**：进入会话即收起卡片并关闭系统通知；不引入 `noticePosition` | 从根上消除遮挡；不做定时消失，避免后台关闭通知导致漏授权 | **CR-001**（blueprint 级）；G2 编号重排；F-025；G2 7/8 |
| 2026-11-04 | 接受 **G2-8**（双会话并发/上限/顺序）未测 | 构造成本 > 当前收益；已写清不可外推 | 作为已接受遗留；F-028 |
| 2026-11-04 | 接受 **G3-4b**（提醒卡不受 `durationMs`）未单独真机 | 结构由 `sticky`/不传 duration 保证，P15 有断言 | 作为已接受遗留；F-028 |
| 2026-11-04 | 批准发布 **v1.2.0** | 核心项通过；遗留已写明，不称「全绿」 | `package.json` 1.2.0；tag `v1.2.0`；F-028/F-029 |
| 2026-11-05 | 指令：复制本项目，并按 AECW 原型机（`agent-engineering-control/prototype`）架构改造副本 | 用真实项目验证原型结构：三域、单一 STATUS、蓝图/冻结/开工、台账/门禁 | 本副本 `task-complete-toast-aecw`；迁移门禁 `gates/2026-11-05-adoption.md`；CR-002 |
| 2026-11-05 | 人类所有者口径：**按 Git 提交人记录**（`meo1102` / `meo1102@163.com`） | 避免“未具名/待确认”阻断冻结与发布声明 | `STATUS.md`、`human/acceptance.md`、`cluster/roster.md` 统一口径；F-034 |
| 2026-11-05 | 宪章增补 §7 **工作方式原则**：先相信工具、不符预期时再质疑；不节省 token | 人类指令；减少“先怀疑工具再绕开”的浪费，也禁止为省 token 缩水证据 | `human/direction.md` v1.1-aecw；CR-003 |
| 2026-11-05 | 后续升级计划：① 插件介绍改为与 v1.2.0 相符的文案（当前 locale 仍是“骨架/空占位”旧文案）；② 新增外观设置（字体、字号、卡片大小、背景色、字体色），手动调整可实时预览 | 人类指令；旧介绍与事实不符；外观配置目前只能改 patch + 重启 | 介绍文案已修正（F-031/F-032）；设置计划写入 `BLUEPRINT.md` v2（`grow-2`，draft）；需 charter 级确认（G4 + G3 约束放宽） |
| 2026-11-05 | 外观设置约束：**字体跟随系统/DSH 正文字体**（不提供字体选择）；**字号、卡片大小给定 min/max**（提案：字号 12–18 px、卡片宽度 280–480 px）；背景色/字体色去留未定 | 收窄字体与尺寸风险；把“任意颜色”留作单独决定 | 写入 [`appearance-settings-design.md`](../workspace/memory/appearance-settings-design.md) §4、[`g4-charter-impact.md`](../workspace/memory/g4-charter-impact.md) §10、`BLUEPRINT.md` v2；F-035 |
| 2026-11-05 | **批准 `grow-2`**：走 **G4**；持久化 **A 方案**（宿主 `configEditor`）；边界就用 **字号 12–18 px、卡片宽度 280–480 px**；**最小宽度随字号联动**（`max(280, fontSize×18)`） | 人类明确选择；A 方案有宿主服务支持（F-036） | `direction.md` v1.2-aecw；`BLUEPRINT.md` v2 **approved**；进入 `freeze` + `start`；CR-004/CR-005 |
| 2026-11-05 | **安装方式：替换原件**——把 desktop profile 的 link/junction 指向本副本（原件保留在原路径，可回滚） | 人类选择 1；不新增第二个包名 | profile/junction 已指向副本；plugin active；回滚 = remove_bundle 后 install_bundle 指向原件；F-038 |
| 2026-11-05 | **同意做一次进化试验**：EV-001 运行态探针，低风险只读试用；**不自动晋升**为每道门必跑/共享规则 | 人类“基线冻结，先做个进化试试” | 正控 7/7、负控 fail；见 [`cluster/evolution.md`](../cluster/evolution.md)、[`ev-001-runtime-probe.md`](../workspace/memory/ev-001-runtime-probe.md)；激活待人类批准 |
| 2026-11-05 | **激活 EV-001**：`node scripts/probe.mjs` 写入 AGENTS，作为门禁/交付前必跑；FAIL 不得开门禁 | 人类“激活” | 进化台账状态 active；只读、可回滚；分布外验证/回滚演练仍待做 |

## 待人类（阶段门禁时，不阻塞开工）

| # | 事项 | 时点 | 说明 |
|---|---|---|---|
| 1 | `grow-2` 阶段验收与遗留接受 | 阶段末 | 设置页/预览/边界/真机截图是否验收；遗留由人类书面接受 |
| 2 | 真机目视：设置页、12/18 px、280/480 px、联动、颜色对比度 | WP-5 | 代理记录 + 截图；E2 不得写成 E1 |
| 3 | 对比度阈值 4.5:1（提案）是否接受 | WP-1 前可改 | 低于阈值拒绝保存并提示；如需放宽，改蓝图验收 |
