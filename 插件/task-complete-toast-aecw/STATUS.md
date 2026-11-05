# STATUS · task-complete-toast（AECW 副本）

> **唯一当前状态页。** 最后更新：2026-11-05｜版本：1.2.0｜人类所有者：meo1102
> 所有者口径：按 **Git 提交人**记录（`meo1102@163.com`，2026-11-05 人类指令）。
> 规则：本页是当前状态；其他文档是证据/历史。冲突以本页为准；每次门禁/冻结/发布先更新本页。
> 证据等级：**E1** 运行事实（可复现）｜**E2** 人类目视（无截图）｜**E3** 文档主张（未复核）。
> **副本说明**：本目录是 `task-complete-toast` v1.2.0 的 **AECW 结构副本**（复制于 2026-11-05）；迁移时产品逻辑未改，2026-11-05 按 `grow-2` 实现 G4 外观设置。**已替换安装**：desktop profile 的 link/junction 指向本副本；原件保留在原路径，可回滚。结构迁移见 [`workspace/landing/migration-aecw-2026-11-05.md`](workspace/landing/migration-aecw-2026-11-05.md)。

---

## 1. 当前阶段

- 阶段：grow-2（closed）
- 阶段状态：closed
- 版本：1.2.0（产品基线；G4 设置未发布）
- 当前目标：`grow-2` 已关闭；阶段外进化 **EV-001 运行态探针已激活**（门禁/交付前必跑）；等人类决定发布/下一阶段
- 当前门禁：2026-11-05-grow-2（有条件通过）

## 2. 当前证据

### 2.1 E1（运行事实，可复现）

> 2026-11-05 在本副本复跑（作者自验；只表示可复现，不表示独立复核）：

- 自动化：10 个测试文件 → **tests 169 / pass 169 / fail 0**；`node --check` **17/17**；含介绍文案回归断言、G4 边界/联动/对比度/设置页/`configEditor` 合并测试、G2 遮挡推送（W16/W17）。
- G4 改动后源码哈希（2026-11-05）：
  - `client.js` `351080FC7314C3214506E8042C1FAB67B964CDED7D2D4334E69A01E2E0CF515D`
  - `lib/config.js` `7D11DC96006D81A726B8200F7AF7A0F8E345B49DD4230B0C3FD272B48D2E0A1F`
  - `lib/host.js` `0FC37D2D10AA8559FC8C818A38795245713B726D15209CA34760F34BC5F2F5B9`
  - `index.js` `7D90BC6CC88D12F106F268895F843B9414ABAF03BD2D367D23BBC7D291B09278`
  - `package.json` `77C60378A6D8861749714AFB567569A2F87FCC05D2E1030DBA93F99CA779E117`（未升版）
- 介绍文案：`locale/zh.json`、`locale/en.json` 已与 v1.2.0 能力对齐（F-031/F-032）。
- 设置探针：客户端有 `settings.plugins.tab` 槽；宿主有 `configEditor`（A 方案）；Theme tokens 只有颜色、无字体 token（F-033/F-036）。
- 编码：全项目 `.md/.js/.json/.yml/.svg` 无 `U+FFFD`。
- 结构：`node bin/aecw.mjs check .` → **FAIL 0｜WARN 0**。
- 安装态：**已替换安装**（2026-11-05）：profile link/junction → 本副本；plugin `include:task-complete-toast` active；live 设置路由校验 200/400/422 符合预期；A 方案写入 `profiles/desktop/cordis.patch.yml`（F-038；[`2026-11-05-G4-live-host.md`](workspace/evidence/2026-11-05-G4-live-host.md)）。
- **客户端 UI 未确认**：重启后 `settings.plugins.tab` occupants 已含 `task-complete-toast`（order 100, active，F-039），设置页注册成功；但用户界面尚未找到设置页/设置项。已加设置页错误边界与“授权提醒诊断”，需刷新后人工复测。

### 2.2 E2（人类目视，无截图）

- G1：**5/5**；G2：**7/8**（G2-8 挂起）；G3：**6/6**（G3-4b 未单独，计入 G3-4）。
- **G4 设置页**：人类目视后验收（“设置页效果符合预想”，2026-11-05，E2，无截图，F-040）。
- **G2 遮挡推送修复**：授权弹窗 → 最小化 DSH → Windows 通知出现 → 拒绝后消失（2026-11-05，E2，无截图，F-042）。
- 证据：[`真机复验-G2`](workspace/evidence/真机复验-G2-2026-11-04.md)、[`真机验收结果-G3`](workspace/evidence/真机验收结果-G3-2026-11-04.md)、[`2026-11-05-G4-live-host.md`](workspace/evidence/2026-11-05-G4-live-host.md)；均为人类口述 + 代理记录，**零截图**。

### 2.3 E3（文档主张，未复核）

- v1.1.0 历史：142/142、`node --check` 16/16、真机 10 通过 / 1 部分 / 13 挂账。
- DSH Desktop `0.2.1-rc.3`、Node v24.22.1（Node 已核验，DSH 版本未复核）。
- 100 次压测、13 项历史 V 项未验。

## 3. 已接受遗留

| 项 | 内容 | 接受者 | 证据 |
|---|---|---|---|
| G2-8 | 双会话并发/上限/顺序未测 | meo1102（F-028） | [`human/acceptance.md`](human/acceptance.md)；F-026 |
| G3-4b | 提醒卡不受 `durationMs` 未单独真机；结构由 `sticky`/不传 duration 保证 | meo1102（F-028） | [`human/acceptance.md`](human/acceptance.md)；F-027、P15 |
| G1 通知点击 | 不拉起/还原最小化窗口（R1 已知限制） | meo1102（F-022） | [`human/acceptance.md`](human/acceptance.md)；设计 §9 |

## 4. 未测 / 开放

| # | 项 | 状态 | 下一步 |
|---|---|---|---|
| 1 | G4 真机截图/录屏 | **零**（人类已验收设置页效果，E2 无截图） | 补设置页/预览截图，或登记证据缺口 |
| 2 | 颜色对比度：只设一色或跟随 token 时无法计算 | 已用 4.5:1 守卫但仅双色场景 | 真机目视；必要时调阈值/提示 |
| 3 | **G2 遮挡推送修复** | **真机通过**：授权弹窗 → 最小化 → Windows 通知出现 → 拒绝后消失（2026-11-05，E2，F-042） | 补截图或登记缺口；多标签未验 |
| 4 | 13 项历史 V 项（V05、V08–V10、V14、V16、V18、V20、V22、V24–V27） | 未测；**无人裁决**（积压，不属 grow-2） | 后续阶段逐项做/接受/删除 |
| 5 | V01、V04、V23 | **账上缺失**（原始清单未定义） | 人类裁决删除或补定义 |
| 6 | DSH 版本 | 未复核 | 版本探针 |
| 7 | `notify.awaiting:false` 真机效果 | 仅单测 | 重启 + 真机一次 |
| 8 | G2 多标签浮层各显示一条 | 设计接受，未真机 | 双标签一次 |
| 9 | G3 窄窗 <300 px | 未测（只到 360 px） | 与 G4 设置页/预览一起窄窗验证 |
| 10 | 本副本安装/回滚 | **已替换安装**（profile link/junction → 副本） | 回滚 = remove_bundle 后 install_bundle 指向原件；已验证 host 路由 |
| 11 | 设置页在旧版 DSH 无 `settings.plugins.tab` 时 | 代码上不影响浮层主功能 | 真机/版本探针；文档写明版本要求 |

**已闭合**：

- **G4 设置页人类验收**：人类反馈“设置页效果符合预想，验收”（2026-11-05，E2 无截图，F-040）。
- **G2 遮挡推送真机通过**：最小化后 Windows 通知出现，拒绝后消失（2026-11-05，E2 无截图，F-042）。
- **`grow-2` 阶段关闭**：`gates/2026-11-05-grow-2.md`（有条件通过）。
- 人类所有者口径：按 Git 提交人记录 `meo1102`（2026-11-05，F-034）。
- charter G4/G3 修订：`direction.md` v1.2-aecw（2026-11-05 人类指令）。
- 蓝图 v2 批准、`freeze`、`start`：见 `gates/2026-11-05-charter-freeze.md`、`2026-11-05-start-order.md`。
- 旧 D/G2 编号与哈希映射：见 [`workspace/memory/history-mapping.md`](workspace/memory/history-mapping.md)。

## 5. 文档时效

| 文档 | 时效 | 说明 |
|---|---|---|
| `STATUS.md`（本页） | **当前** | 唯一当前状态 |
| `human/direction.md` | 当前（v1.2-aecw） | 方向/边界/S1–S4/停止；§7 工作方式原则；G4/G3 修订 |
| `human/decisions.md` | 当前 | 人类决策（含阶段门禁时事项） |
| `human/acceptance.md` | 当前 | 人类验收/遗留接受 |
| `cluster/evolution.md` | 当前 | 进化台账（EV-001 trial） |
| `BLUEPRINT.md` | 当前（v2，approved；阶段 closed） | 阶段 `grow-2`：外观设置 + 实时预览 |
| `workspace/evidence/blueprint-v1-steward-1.md` | 历史（未执行） | v1 `steward-1` 草案 |
| `ledger.md` | 当前 | 异议/事实/变更（DR/F/CR） |
| `cluster/` | 当前 | 名册/任务板/运行记录/学习账 |
| `gates/` | 历史 | 每道门当时的记录；含 charter-freeze / start-order / adoption / grow-2 |
| `workspace/evidence/` | 证据 | 原始记录与历史快照；单份文件头标 SUPERSEDED/HISTORICAL |
| `workspace/memory/` | 当前/参考 | 设计契约（§16 G4）、ADR、历史映射、V 项对账、设置方案 |
| `workspace/landing/` | 当前/历史 | 落地清单、交接说明、迁移说明 |
| `README.md` | 当前摘要 + 历史细节 | 功能/安装说明；状态以本页为准 |
| `AGENTS.md` | 当前 | 开发约定（AECW 版） |

## 6. 下一步

**阶段 `grow-2` 已关闭（2026-11-05，有条件通过）。基线 commit `4aff41a` / tag `aecw-grow-2-2026-11-05`。停在这里，等人类决定发布或下一阶段。**

1. **EV-001 已激活**：`node scripts/probe.mjs` 写入 AGENTS，门禁/交付前必跑；正控 7/7、负控 fail。分布外验证/真实回滚演练仍待做。
2. **已闭合**：G4 设置页人类验收（F-040）；G2 遮挡推送真机通过（F-042）；A 方案持久化（F-038）；自动化 169/169；基线冻结（F-043）。
3. **仍开放（不阻塞本次关闭）**：
   - 真机截图/录屏：**零**（设置页/G2 均为 E2 口述）；
   - G2-8、G3-4b 仍为已接受遗留；13 项 V 项 + V01/V04/V23 未裁决；
   - G4 未发布（版本仍 `1.2.0`），发布门禁另行；
   - G2 多标签、窄窗、自定义主题一致性未验。
4. **下一阶段/发布**：由人类决定；若进入下一阶段，先写新 `BLUEPRINT` 版本、`freeze`、`start`；不得沿用本阶段授权自动续跑。
5. 未发布前**不得**声明“G4 正式发布/全部通过”。

## 7. 阶段授权（冻结）

- 阶段：grow-2
- 蓝图：v2（批准：meo1102）
- 范围：外观设置：字体跟随系统正文；字号 12–18 px；卡片宽度 280–480 px；最小宽度联动；背景色/字体色 #RRGGBB + 对比度守卫；实时预览；不含 G2-8/G3-4b/V
- 预算：2 周 / 15 个有效 agent 回合
- 停止：S1 / 预算耗尽 / 需新增依赖或改宿主 / configEditor 不可用且人类不接受降级 / 连续两道门禁失败
- 验收：WP-0 有结论；设置页可调；字号/宽度边界与联动生效；颜色对比度守卫；预览即时；保存经 configEditor 可复现；160 项不回归；真机截图
- 冻结：2026-11-05；宪章确认：meo1102
- 集群只可执行本阶段；阶段结束必须停、报告、等下一道门。

## 8. 开工令

- 下达人：meo1102
- 日期：2026-11-05
- 首次报告点：WP-0 方案与 configEditor 探针后，或触发 S2 时
- 依据：2026-11-05-charter-freeze.md + BLUEPRINT.md v2
- 只授权本阶段；阶段结束或触发停止条件必须停、报告、等下一道门。
