# 异议与事实台账 · task-complete-toast

> 规则：S3/S4 一行；S1/S2 同时写 `inbox/` 详细记录；模型输出默认是“主张”，不是事实。
> 变更走 `change`；blueprint/charter 变更不原地改冻结基线。
> 当前状态以 [`STATUS.md`](STATUS.md) 为准。证据文件见 [`workspace/evidence/`](workspace/evidence/)。
> **编号说明**：试点期异议编号为 D-001/D-002，本表按 AECW 台账格式改为 DR-001/DR-002（一一对应，见 `STATUS.md` §6）；事实编号 F-001–F-029 沿用，新增 F-030。

## A. 异议台账

| ID | 日期 | 级别 | 类型 | 主张 | 证据 | 处理人 | 状态 | 裁决 |
|---|---|---|---|---|---|---|---|---|
| DR-001（原 D-001） | 2026-11-04 | S3 | 事实/流程 | README 与交接称「插件已安装启用」，但当前 desktop profile 未加载该插件 | F-003 / F-004 / F-008 | 集群管家 | closed | 已修复：remove_bundle + install_bundle；junction/bundle 恢复，entry active，路由 400/404；待真机完成提示复验 |
| DR-002（原 D-002） | 2026-11-04 | S2 | 质量/风险 | G2 常驻提醒遮挡授权/回答按钮，导致人类无法直接处理 | F-021 / F-025 / F-026 | 集群管家 | closed | 接受为 R2/S2；改为「进入会话即收起」；G2-1~G2-7 复验通过；G2-8 另列已接受遗留；详见 `inbox/DR-002.md` |

**反报复检查**：无；DR-001 由接管审计提出，DR-002 由人类目视提出，均不指向具体个人。
**周抽样**：2026-W45 抽样 DR-002、F-021/F-026/F-027 → G2-1 修复后 7/8、G3 6/6；人类接受遗留并升 v1.2.0。

## B. 事实台账

> 状态列：`已核验` = 可复现的 E1；`已捕获` = 记录在案（含 E2 目视/证据缺口）；`已裁决` = 人类决定。核验人为作者本人时只表示“可复现”，不表示“独立复核”。

| ID | 日期 | 陈述 | 来源 | 状态 | 核验人 | 关联 |
|---|---|---|---|---|---|---|
| F-001 | 2026-11-04 | 接管时工作树 9 个测试文件：tests 142 / pass 142 / fail 0（Node v24.22.1，--test-isolation=none）；node --check 16/16 | `node --test` / `node --check`，本目录 | 已捕获（当时可复现） | 待独立复核 | 阶段 0；DR-001 |
| F-002 | 2026-11-04 | Git 基线 bb3f7e5，工作树干净 | `git status --short` / `git rev-parse --short HEAD` | 已核验 | 本轮执行者 | 阶段 0 冻结基线 |
| F-003 | 2026-11-04 | desktop profile 的 package.json 有 link 指向本目录，但 dsh.profile.bundles 不含 @local/task-complete-toast；junction 指向已不存在的旧路径 `插件\开发\task-complete-toast`；plugin_manager list_plugins 无该插件 | profile package.json、Get-Item junction、plugin_manager | 已核验 | 本轮执行者（可复现） | 阶段 0；DR-001 |
| F-004 | 2026-11-04 | 最近一次安装日志：`@local/task-complete-toast 1.1.0 <- D:\DSH\DSH_end\插件\开发\task-complete-toast`（旧路径） | profile `.plugin-manager/logs/.../pnpm.log` | 已核验 | 本轮执行者 | DR-001 |
| F-005 | 2026-11-04 | 历史验收报告主张：自动化 142/142、node --check 16/16、真机 10 通过 / 1 部分 / 13 挂账 | 验收报告历史记录 | 部分核验（真机项未复核） | 待复核 | 阶段 0；验收声明 |
| F-006 | 2026-11-04 | 代码基线：package.json 1.1.0；client.js SHA-256 `624518317C1FDB039B0079350E31BF5C75AA2FA6278FE7A638164122E1C2E8DF` | Get-FileHash | 已捕获 | 本轮执行者 | 阶段 0 冻结基线 |
| F-007 | 2026-11-04 | 本机 Node v24.22.1；交接写 v24.21.0；DSH Desktop 0.2.1-rc.3 为文档主张，未复核 | `node --version`；交接文档 | 部分核验（Node 已核验） | 本轮执行者 | 阶段 0；STATUS §4 |
| F-008 | 2026-11-04 | 重装后插件已加载：profile bundles 含该包；junction 指向本目录；entry `include:task-complete-toast` active；客户端 `shell.overlay` order 100；宿主路由 400/404 | plugin_manager；cordis_inspect_query Slots；Invoke-WebRequest | 已核验 | 本轮执行者（可复现） | 阶段 0；DR-001 |
| F-009 | 2026-11-04 | G2 候选信号可达客户端：`approval/request` 与 `user-questions/request` 为 waterfall 事件且在转发 allowlist；官方 UI 用 `ctx.remote.$on` 监听；快照含 `pendingInteraction.key/kind`；只需事件类型 + `agent.id`，无需读内容 | cordis_inspect_query 契约；app.asar 源码 | 契约已核验；真机未验 | 本轮执行者 | 阶段 0；G2 前置 |
| F-010 | 2026-11-04 | 若 `user-questions/request` 不带 agent，则无法安全映射会话；应跳过提醒，不猜测 | F-009 契约；安全默认 | 已裁决（设计约束） | 本轮执行者 | G2 设计 |
| F-011 | 2026-11-04 | G2 已在工作树实现：只读 `uiSession.sessionStatus` 的 `pendingInteraction.key/kind`，独立提醒队列；不监听 waterfall、不回答、不读内容；解决/取消自动移除，dismiss 本轮抑制，review 回看跳过；系统通知按 key 关闭 | client.js；interaction.test.js I01–I07、W10/W11、P05b；tests 152/152 | 已捕获（可复现） | 待独立复核 | 阶段 1；G2 |
| F-012 | 2026-11-04 | G2 尚未真机触发；运行页面仍是旧客户端代码，需刷新后才加载新 client.js；只能声明“代码完成、自动化通过” | 运行页面未刷新；门禁-阶段1 | 已捕获 | 本轮执行者 | 阶段 1；验收声明 |
| F-013 | 2026-11-04 | G2 源码基线：client.js `CF6C0CA714CF1F6440A3BFC7D7B698179FD46A5BA0AD3FF6D57F03A34FDE848C`；package.json 仍 1.1.0 | Get-FileHash | 已捕获 | 本轮执行者 | 阶段 1 冻结基线 |
| F-014 | 2026-11-04 | G3 已实现：宿主 `Config.appearance` 五字段（四角/明暗/尺寸/时长/标题）+ 扁平投影；客户端枚举/范围守卫；`data-position/theme/size` 驱动渲染；显式 light/dark 用 DSH static token 作用域调色板 | lib/config.js、client.js；I06/I10/I11、W12、P14；tests 158/158 | 已捕获（可复现） | 待独立复核 | 阶段 2；G3 |
| F-015 | 2026-11-04 | G3 尚未真机验证：改宿主 Config 需重启应用，客户端需刷新页面；四角/明暗/尺寸/时长/标题矩阵未做 | 门禁-阶段2；未重启 | 已捕获 | 本轮执行者 | 阶段 2；验收声明 |
| F-016 | 2026-11-04 | G2/G3 源码基线：client.js `B9E4EDD4C320E3F07614FE910FAFB457D15DDD7515BEDC06C1B51C9248007CA9`；lib/config.js `FC378577C91DAEE7C8524C17A9696C38B2D37286C8B037F4670C4580D3861A46`；package.json 仍 1.1.0 | Get-FileHash | 已捕获 | 本轮执行者 | 阶段 2 冻结基线 |
| F-017 | 2026-11-04 | G3 宿主半区已热重载：remove + install 后 entry active，路由 400/404，junction 指向本目录；客户端页面未刷新，不等于 G3 真机 | plugin_manager；Invoke-WebRequest；Slots | 已核验（宿主） | 本轮执行者 | 阶段 2；F-015 |
| F-018 | 2026-11-04 | G2 单功能开关已补：宿主 `Config.notify.awaiting`（默认 true）→ 客户端 `awaiting`；false 时不订阅 `uiSession.sessionStatus`、不产生提醒；新增 I06d/W13 | lib/config.js、client.js、集成/接线测试 | 已捕获（可复现） | 待独立复核 | 阶段 2；O-3 |
| F-019 | 2026-11-04 | G2 系统通知跨标签去重：复用 G1 `createClaimLease`，以 `dsh-notice:<pendingKey>` 认领；输家只保留本标签浮层、不发系统通知；认领异常 fail-open | client.js `notifyNotice`；G1 租约测试 | 已捕获 | 待独立复核 | 阶段 2；O-3 |
| F-020 | 2026-11-04 | 人类批准宪章：v1.0-draft → v1.0，仅批准生效、无条款实质变更；人类方向所有者确认为本会话发起人 | 2026-11-04 会话内 ask_user_question 回答「批准 v1.0-draft」 | 已核验 | 人类本人 | 宪章生效；阶段 0 门禁 |
| F-021 | 2026-11-04 | 真机验收（16:06–16:18）：G1-1~G1-5 全通过；G2-1 不通过（常驻提醒遮挡授权/回答按钮）、G2-2/3/4/5 通过、旧 G2-6 未测；G3-1~G3-6 全部未执行 | 真机验收结果（2026-11-04）；人类目视 + 代理记录 | 已捕获（E2，人类口述，无截图） | 人类目视 | DR-002；阶段 2 |
| F-022 | 2026-11-04 | G1 系统通知点击不拉起/还原最小化窗口；`window.focus()` 无法还原，需宿主 `BrowserWindow.restore()/show()`；人类裁决接受为已知限制 | 验收结果 §5-B；会话内人类选择「接受为已知限制」 | 已裁决 | 人类本人 | 设计 §9；README 已知限制 |
| F-023 | 2026-11-04 | G2-3 的实际操作方式因遮挡未记录；本轮无截图，证据仅为人类口述 + 代理记录 | 验收结果 §3/§6；人类说明 | 已捕获（证据缺口） | 人类目视 | DR-002；复验需补截图 |
| F-024 | 2026-11-04 | G3 未执行原因：改宿主 `Config.appearance` 需改 profile patch 并重启；且 G2-1 修复可能改变定位语义，先验会作废 | 验收结果 §4/§8 | 已捕获 | 本轮执行者 | O-5；修复方案 |
| F-025 | 2026-11-04 | G2-1 修复按人类指令实施：不要求常驻；`sessionIsEntered` 读 `retainedBy.mainView`，订阅 `sessions.list`；已进入会话时不显示提醒，进入目标会话时 dismiss 并关闭系统通知；新增 W14/W15；tests 160/160 | client.js；wiring.test.js | 已捕获（可复现） | 待独立复核 | DR-002；CR-001 |
| F-026 | 2026-11-04 | G2 真机复验（17:00–17:17）：G2-1~G2-7 通过，G2-8 挂起；G2-1 遮挡已由「进入会话即收起」消除；人类接受 G2-8 为已知未测 | 真机复验-G2（2026-11-04） | 已捕获（E2，人类目视，无截图） | 人类目视 | DR-002 关闭；v1.2.0 |
| F-027 | 2026-11-04 | G3 真机（17:17–17:28）：四轮矩阵 G3-1~G3-6 通过；G3-4b（提醒卡不受 durationMs）未单独实测；patch 已还原；人类接受该未测项 | 真机验收结果-G3（2026-11-04） | 已捕获（E2，人类目视，无截图） | 人类目视 | v1.2.0 |
| F-028 | 2026-11-04 | 人类批准 v1.2.0：接受 G2-8、G3-4b 为已知未测遗留；G1 通知点击沿用 R1 已知限制；package.json 升 1.2.0 | 会话内 ask_user_question 回答「接受遗留并升 1.2.0」 | 已核验 | 人类本人 | 发布；验收报告 §14 |
| F-029 | 2026-11-04 | v1.2.0 发布基线：package.json `77C60378A6D8861749714AFB567569A2F87FCC05D2E1030DBA93F99CA779E117`；client.js `B9E4EDD4...`；lib/config.js `FC378577...`；tests 160/160 | Get-FileHash；node --test | 已捕获（可复现） | 本轮执行者 | tag v1.2.0 |
| F-030 | 2026-11-05 | AECW 副本复跑：tests 160/160、fail 0；node --check 17/17；三个基线哈希与 F-029 完全一致；无 U+FFFD；产品代码/测试未改；副本未安装（profile 仍指向原件） | node --test / node --check / Get-FileHash，本副本；`node bin/aecw.mjs check` | 已捕获（E1，可复现，作者自验） | 本会话 agent | 迁移门禁 2026-11-05 |
| F-031 | 2026-11-05 | `locale/zh.json`、`locale/en.json` 的 `meta.description` 仍是早期骨架文案（“任务完成时在浮层提示结果；当前为骨架版本，仅注册空占位。”/英文同义），与 v1.2.0 的 G1/G2/G3 实况不符 | 直接读取 `locale/*.json`；package.json 1.2.0；tests 160/160 | 已核验（E1） | 本会话 agent | 介绍修正；BLUEPRINT v2 WP-6 |
| F-032 | 2026-11-05 | 介绍文案已修正：zh/en `meta.description` 改为“任务完成或等待授权时在浮层提示结果；支持位置、明暗、尺寸、时长与标题配置。”（en 对应）；`test/smoke.test.js` S6 增加“禁止骨架/占位字样”的回归断言；smoke 7/7、全量 160/160 通过 | `locale/*.json`、`test/smoke.test.js`；`node --test` | 已捕获（E1，可复现） | 本会话 agent | F-031 关闭；CR 记录见 board/runs |
| F-033 | 2026-11-05 | DSH 客户端存在 `settings.plugins.tab` / `settings.general.item` 设置槽，`ctx.slots.register` 可注册；Theme tokens 只有颜色类、无字体/字号 token；宿主 Config 目录里 `include:task-complete-toast` 状态为 `unsupported` | `cordis_inspect_query`（client Slots / Service / Theme；host Config） | 已核验（E1，探针可复现） | 本会话 agent | `grow-2` WP-0；`workspace/memory/appearance-settings-design.md` |
| F-034 | 2026-11-05 | 人类指令：人类所有者按 **Git 提交人**记录 = `meo1102`（`meo1102@163.com`） | 2026-11-05 人类消息 | 已核验（人类决定） | 人类本人 | 所有者口径；decisions/acceptance/roster/STATUS |
| F-035 | 2026-11-05 | 人类补充外观设置约束：字体跟随系统/DSH 正文字体（不提供字体选择）；字号、卡片大小给定 min/max（本副本提案：字号 12–18 px、卡片宽度 280–480 px）；背景色/字体色去留未定 | 2026-11-05 人类消息；`appearance-settings-design.md` §4 | 已核验（人类决定 + 提案待确认） | 人类本人 / 本会话 agent | `grow-2` WP-0/WP-1；`g4-charter-impact.md` §10 |
| F-036 | 2026-11-05 | 宿主存在 `configEditor` 服务：`entries()` 返回可寻址 profile entry，`edit(entry, change)` 校验、持久化并走正常 Loader 路径（可选注入 `ctx.get("configEditor")` 或硬依赖 `inject:["configEditor"]`） | `cordis_inspect_query` host Service `configEditor` | 已核验（E1，探针可复现） | 本会话 agent | A 方案持久化；`grow-2` WP-4 |
| F-037 | 2026-11-05 | G4 外观设置代码实现：`fontSize` 12–18、`cardWidth` 280–480/null、颜色 `#RRGGBB` + 4.5:1 对比度；联动 `max(280, fontSize×18)`；设置页 `settings.plugins.tab` + 预览；`POST /dsh-task-complete/settings` → `configEditor.edit`；tests 167/167、`node --check` 17/17 | 本副本代码与测试；`node --test` | 已捕获（E1，自动化可复现；**真机未验**） | 本会话 agent | `grow-2` WP-1..WP-4；design §16；F-035/CR-004/CR-005 |
| F-038 | 2026-11-05 | 替换安装完成：desktop profile link + junction 均指向副本；plugin active 1.2.0；live 设置路由校验符合预期（合法 200、越界/联动/未知字段 400、低对比 422）；保存经 `configEditor.edit` 写入 `profiles/desktop/cordis.patch.yml`，已恢复默认 | 本机 profile、plugin_manager、Invoke-WebRequest、cordis.patch.yml | 已核验（E1；客户端 UI 未刷新） | 本会话 agent | [`evidence/2026-11-05-G4-live-host.md`](workspace/evidence/2026-11-05-G4-live-host.md)；`grow-2` WP-4/WP-5 |
| F-039 | 2026-11-05 | 重启后客户端 slot 账本：`settings.plugins.tab` occupants 含 `task-complete-toast`（order 100, active）；`shell.overlay` 含同 id；设置页注册成功。用户反馈界面未找到设置页/设置项；已加设置页错误边界与授权提醒诊断 | `cordis_inspect_query` client Slots；用户反馈 | 已核验（E1 slot）；UI 未确认 | 本会话 agent | F-038；`grow-2` WP-5 |
| F-040 | 2026-11-05 | 人类目视 G4 设置页（外观设置、预览、保存入口）后反馈“设置页效果符合预想，验收” | 人类会话反馈（E2，无截图） | 已核验（人类接受） | 人类本人 | [`human/acceptance.md`](human/acceptance.md)；`grow-2` WP-5 |
| F-041 | 2026-11-05 | G2 遮挡推送缺陷定位与修复：原逻辑在“已进入会话”时直接 dismiss，导致 DSH 被遮挡/后台时也不发系统通知；改为 hidden 条目 + 页面不可见/失焦时补发 `notifier.notify`，pending 解决时关闭。W16 覆盖“添加时已隐藏”，W17 覆盖“先可见、随后失焦补发且不重复”；全量 169/169 | `client.js`、`test/wiring.test.js`；`node --test` | 已捕获（E1 自动化；真机待验） | 本会话 agent | `human/acceptance.md` 注；`grow-2` WP-5 |
| F-042 | 2026-11-05 | G2 遮挡推送真机通过：授权弹窗出现 → 最小化 DSH 窗口 → Windows 通知出现 → 拒绝后通知消失 | 人类会话反馈（E2，无截图） | 已核验（人类目视） | 人类本人 | F-041；`grow-2` 门禁；[`human/acceptance.md`](human/acceptance.md) |

## C. 变更台账

| ID | 日期 | 类型 | 变更 | 理由 | 影响 | 提出者 | 状态 | 裁决 |
|---|---|---|---|---|---|---|---|---|
| CR-001 | 2026-11-04 | blueprint | G2 提醒语义：常驻 → 进入会话即收起 | 人类指令：从根上消除遮挡；不做定时消失，避免后台关闭通知导致漏授权 | 改 G2 验收判据与编号（旧 G2-1 拆 G2-1/3/4、旧 G2-6=新 G2-8）；重写提醒测试 W14/W15；需真机复验；不改 G1/G3 | 人类 | accepted | 接受（2026-11-04）；已实施 F-025、复验 F-026；v1.2.0；详见 `inbox/CR-001.md` |
| CR-002 | 2026-11-05 | task | 项目文档结构迁移到 AECW 三域架构（新增 bin/core、重排工件） | 人类指令：复制本项目按原型机架构改造 | 只动文档/治理工件与新增 bin/core；产品代码、测试、package.json 不变；不改验收判据 | 人类 | accepted | 接受（2026-11-05）；验证见 `gates/2026-11-05-adoption.md` |
| CR-003 | 2026-11-05 | charter | `human/direction.md` v1.1：增补 §7 工作方式原则（先相信工具、不符预期再质疑；不节省 token） | 人类指令；减少“先怀疑工具再绕开”的浪费，同时禁止为省 token 缩水证据 | 不改目的/非目标/S1–S4；当前阶段未开工，无需重开阶段；未来阶段按新原则执行 | 人类 | accepted | 接受（2026-11-05）；见 direction §7/§8 |
| CR-004 | 2026-11-05 | charter | `human/direction.md` v1.2：新增 **G4 外观自定义**；G3 样式约束改为“默认 token + 白名单字段”；明确不做任意 CSS | 人类 2026-11-05 指令：G4、A 方案、边界、最小宽度联动 | 新增设置页/预览/颜色；风险等级把“关键授权不可读”列为 S2；不改变 G1/G2 | 人类 | accepted | 接受（2026-11-05）；见 direction §1/§2/§8 |
| CR-005 | 2026-11-05 | blueprint | `BLUEPRINT.md` v1 → v2：阶段 `grow-2`（外观设置 + 实时预览）；A 方案持久化；字号 12–18、宽度 280–480、最小宽度联动、颜色 `#RRGGBB` | 人类 2026-11-05 批准；v1 `steward-1` 未执行转积压 | 新增 `settings.plugins.tab`、host 设置路由、`configEditor` 写入；旧 appearance 兼容 | 人类 | accepted | 接受（2026-11-05）；蓝图 v2 approved；见 blueprint §7 |
