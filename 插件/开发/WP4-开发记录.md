# WP4 开发记录 — WP3 补遗 + 通知与补弹

| 项目 | 内容 |
|---|---|
| 包 | `@local/task-complete-toast` `1.1.0` |
| 范围 | WP3 补遗 A1–A5；开发方案 §6.6、§5.5 的通知与补弹 |
| 时间 | 2026-10-26 16:39（Asia/Shanghai） |
| 状态 | 补遗与 notifier 纯逻辑完成；**未接 apply、未重启、未在页面观察** |
| 测试结果 | S 7/7、I 18/18、U 11/11、F 6/6、D 4/4、N 10/10，共 56/56 通过，0 失败 0 跳过 |

## 1. 改动文件清单

| 文件 | 行数 | 说明 |
|---|---:|---|
| `task-complete-toast/client.js` | 905 | `createDismissTimer`、卡片自动消失/暂停/图标/阴影/关闭命中区、Esc 最新、`createNotifier` |
| `task-complete-toast/test/dismiss.test.js` | 116 | D01–D04，假计时器 |
| `task-complete-toast/test/notifier.test.js` | 261 | N01–N10，假 Notification/document |
| `task-complete-toast/test/smoke.test.js` | 214 | S5 结构更新（图标/body/阴影）；S4 增加新纯函数断言 |
| `task-complete-toast/README.md` | 99 | WP3 补遗 + WP4 阶段说明 |
| `task-complete-toast/test/store.test.js` | 288 | 未改 |
| `task-complete-toast/test/format.test.js` | 134 | 未改 |
| `task-complete-toast/test/harness.js` | 360 | 未改（React 测试桩沿用） |

未改动：`index.js`、`lib/*.js`、`package.json`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、profile、`app.asar`。

行数按 `[System.IO.File]::ReadAllLines().Length` 统计，不把末尾换行算成额外一行。

## 2. WP3 补遗清单（A1–A5）

| # | 要求 | 落地 | 测试/证据 |
|---|---|---|---|
| A1 | `durationMs` 到期 dismiss；悬停/聚焦/页面隐藏暂停，恢复按剩余时间；计时器可注入 | `createDismissTimer(env, durationMs, onExpire)`；`ToastCard` 接收 `timers`/`durationMs`，`pauseFor('hover'/'focus'/'hidden')` 与 `resumeFor`；`visibilitychange` 驱动 hidden 暂停 | D01 到期、D02 暂停/恢复剩余、D03 dispose、D04 start 前无操作；均为假计时器；页面隐藏分支在代码中，DOM 未验 |
| A2 | 成功/失败图标 20px 圆底 + 对勾/感叹号 | `dtt-icon-success` / `dtt-icon-error`，20×20 圆底用 state token，字形 `✓`/`!` | S5 断言 `dtt-icon-success`、`✓`；图标 `aria-hidden` |
| A3 | 卡片阴影 | `box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18)` | S5 断言 CSS 含该值；§5.3 明文允许 rgba；未发现可用阴影 token |
| A4 | 关闭按钮 20×20 命中区 | `.dtt-close { width:20px; height:20px; padding:0; display:inline-flex; ... }` | S5 断言 class；尺寸在 CSS 中 |
| A5 | Esc 语义对齐 | Esc 关闭 `items[items.length - 1]`（队列最新） | ADR-010 已裁定，见下 |

### A5 裁定（ADR-010）

ADR-010 已裁定按「队列最新」实现；§6.5 措辞改为「最新一条（视觉最下）」。因此无需反转渲染顺序，代码保持不变。

## 3. Notifier 用例表（N01–N10）

| 编号 | 场景 | 期望 | 断言点 |
|---|---|---|---|
| N01 | `auto` + 隐藏 + `granted` | 发送 | 标题/正文、`tag='dsh-task-s-1'`、`renotify:false` |
| N02 | `auto` + 可见 | 不发送 | 返回 `skipped`，无 Notification 实例 |
| N03 | `always` 可见发送；`never` 不发送 | 分别发送/跳过 | `always` 1 个实例；`never` 不新增 |
| N04 | `denied` → 隐藏 | 进 deferred；可见后补弹一次 | 首次 deferred；改 granted + 可见后 1 个实例；第二次 `onVisible` 不再新增 |
| N05 | `default` + 隐藏 | 当前：不申请权限，deferred | `requestCount=0`；**D1 后需改为尝试构造发送** |
| N06 | `default` + 可见但无手势 | 当前：不申请权限，deferred | `requestCount=0`；**D1 后需改为尝试构造发送** |
| N07 | 构造抛错 | deferred | 无实例，返回 `deferred` |
| N08 | 点击通知 | focus → openSession → close | 调用顺序与 `closed` 标志 |
| N09 | `dispose` | 关闭已发通知、移除监听、之后不发送 | `closed=true`、监听数 0、后续 `notify` 返回 skipped |
| N10 | dispose 后可见性监听 | 不再补弹 | dispatch `visibilitychange` 无新实例 |

## 4. §6.6 / §5.5 对照

| 要求 | 落地 | 状态 |
|---|---|---|
| `always`，或 `auto` 且 `visibilityState!=='visible' \|\| hidden \|\| !hasFocus()`；`never` 不发 | `isPageVisible()` + `notify()` 分支 | ✅ N01/N02/N03 |
| `denied` → deferred | `send()` 权限分支 | ✅ N04 |
| `default` 只在可见且用户手势时申请，隐藏不申请 | `hasUserActivation()`（env 注入）+ 可见性检查 | ✅ N05/N06；真实手势需 WP6 提供 |
| 内容与浮层第二行完全一致 | `body = item.line`；标题 `item.title ?? t('titleCompleted')` | ✅ N01；由调用方传同一 `line` |
| `tag='dsh-task-'+sessionId`、`renotify:false` | 构造 options | ✅ N01 |
| 点击 focus → openSession → close | `notification.onclick` | ✅ N08 |
| 异常/构造失败 → deferred | `deliver` try/catch；requestPermission catch | ✅ N07 |
| 恢复可见补弹且只补一次 | `deferred` Map，`onVisible` 清空后逐条发送 | ✅ N04/N10 |
| 补弹条目重新计时，隐藏期间不过期 | notifier 不持有时长计时器；补弹条目没有隐藏期 TTL | ⚠️ 由 WP6 在补弹时重置浮层计时；本地无计时可过期 |
| `dispose` 移除监听、关闭通知、清空队列 | `dispose()` | ✅ N09/N10 |

## 5. 测试变更

### 5.1 S5（WP3 补遗，契约推进）

在 WP3 的「可渲染」基础上继续断言：

- 有 item 时卡片结构变为 `[icon, body, close]`；
- `outcome='completed'` 渲染 20px 成功图标与 `✓`；
- `body` 内保留两行 `title`/`line`；
- 内联 CSS 包含阴影 `0 10px 30px rgba(0, 0, 0, 0.18)`；
- 关闭按钮仍为 `button.dtt-close` 且 `aria-label='actionClose'`。

这是 WP3 补遗要求的契约推进，不是放宽。

### 5.2 S4

S4 增加 `createDismissTimer`、`createNotifier` 的函数断言；`__test__` 键仍被严格检查。

### 5.3 新增文件

- `test/dismiss.test.js`：D01–D04。
- `test/notifier.test.js`：N01–N10。

## 6. 测试命令与统计

工作目录：`D:\DSH\DSH_end\插件\开发\task-complete-toast`

```powershell
& 'C:\Users\meo11\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test/smoke.test.js test/integration.test.js test/store.test.js test/format.test.js test/dismiss.test.js test/notifier.test.js
```

```text
✔ D01 durationMs 到期触发 dismiss (1.5599ms)
✔ D02 暂停不 dismiss，恢复后按剩余时间 dismiss (0.1697ms)
✔ D03 dispose 后不再触发 (0.0903ms)
✔ D04 挂载前 pause/resume 为无操作，start 才计时 (0.1006ms)
✔ N01 auto + 隐藏 + granted：发送通知，内容与 tag 正确 (0.4298ms)
✔ N02 auto + 可见：不发送 (0.096ms)
✔ N03 always：可见也发送；never：不发送 (0.0986ms)
✔ N04 denied → deferred；可见后补弹一次，第二次不再发 (0.1533ms)
✔ N05 default + 隐藏：不申请权限；可见且有手势后才申请并发送 (0.1298ms)
✔ N06 default + 可见但无用户手势：不申请权限 (0.0847ms)
✔ N07 构造失败 → deferred (0.1119ms)
✔ N08 点击：focus → openSession → close (0.121ms)
✔ N09 dispose：关闭已发通知、移除监听、清空补弹，之后不再发送 (0.1108ms)
✔ N10 dispose 后可见性监听不再补弹 (0.1381ms)
ℹ tests 56
ℹ suites 0
ℹ pass 56
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.7194
EXITCODE=0
START=2026-10-26 16:39:55 +08:00
END=2026-10-26 16:39:56 +08:00
```

> 上面只贴 D/N 行；S1–S7、I01–I17、U01–U11、F 的原始行见 `WP3-开发记录.md`（初版 42 条 + D 补遗 4 条），与本节合计 56 条。

| 套件 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|
| S（smoke） | 7 | 0 | 0 |
| I（integration） | 18 | 0 | 0 |
| U（store） | 11 | 0 | 0 |
| F（format） | 6 | 0 | 0 |
| D（dismiss） | 4 | 0 | 0 |
| N（notifier） | 10 | 0 | 0 |
| 合计 | **56** | **0** | **0** |

## 7. 测试桩与边界

- Notification/document/window 全部为测试桩；不碰真实浏览器权限与 OS 通知。
- `env.hasUserActivation` 为可选注入；缺省 false，避免在无手势时申请权限。WP6 应接 `navigator.userActivation` 或等价信号。
- 假 document 支持 `visibilitychange`/`focus`/`pagehide` 监听与 `dispatch`，验证 dispose 移除。
- `dispose` 后 `notify` 返回 `skipped`；`onVisible` 不补弹。
- 通知正文由调用方传入 `item.line`，与浮层第二行必须同源；本阶段未接 store，由 WP6 保证。

## 7.1 遗留缺陷（WP6 必修，本轮不改代码）

| # | 级别 | 缺陷 | WP6 修法 |
|---|---|---|---|
| D1 | P1（影响 F9） | `permission === 'default'` 时当前直接 `defer`，从不尝试发送；Electron 权限常为 `default`，会导致最小化场景永远不弹通知 | `default` 也尝试构造并发送；只有构造抛错才 `defer`；「可见且有用户手势时申请权限」是升级路径，不是发送前置 |
| D2 | P2 | `suppressWhenFocused` 全链路未使用 | §7.2 为 true 时浮层与系统通知都不发；WP6 在 store/overlay/notifier 统一判定 |
| D3 | P3 | `issued` Set 只增不减，长会话会累积 Notification 对象 | 关闭/`onclose`/`dispose` 时从 `issued` 移除 |
| D4 | P2 | `deferred` 恢复时只重试系统通知 | §5.5 要求补弹应用内浮层并重新计时；WP6 接回 store/overlay 时实现 |

## 8. 未覆盖与风险

| 项 | 说明 |
|---|---|
| notifier 未接 apply | 真实 `ctx.remote` / store / overlay 尚未调用 notifier；WP6 统一接线 |
| 真实 Notification 与权限 | OS 通知、权限弹窗、用户手势、专注助手未验证 |
| deferred 重新计时 | notifier 无隐藏期 TTL；补弹时浮层重新计时的接线在 WP6 |
| 自动消失/暂停真实 DOM | D01–D04 验证纯计时器；React 的 `useEffect`/鼠标/焦点事件未在页面验证 |
| 关闭命中区 20×20 | CSS 已设；实际触屏/缩放未验 |
| 图标对比度 | 图标底色用 state token，字形用 label-primary；实际对比度未验 |
| 阴影 token | 未发现可用主题阴影 token，使用 §5.3 明文 rgba；主题切换未验 |
| Esc 视觉顺序 | ADR-010 已裁定按队列最新；§6.5 改为「最新一条（视觉最下）」，无需反转 |
| 系统通知内容 | 依赖调用方传 `line`；未在真实通知里对照浮层第二行 |
| 通知点击回跳 | 只单测 focus/openSession/close 顺序；真实会话/窗口行为未验 |

## 9. 下一步

1. **WP5 结果桥**：把 `outcome` 从 `pending` 替换为解析结果，并接真实状态文案。
2. **WP6 真实接线**：`apply` 用真实 env 创建并 `start()` store；用真实 `ctx.remote`/`ctx.sessions`/`connection/reset`；把 notifier 接进完成流程，补 `line` 同源与 deferred 重新计时；注册 locale 字典与 ADR-009 配置。
3. 真实权限：按 D1 修复 `default` 分支——先尝试构造/发送，只有异常才 deferred；「仅可见且有用户手势时申请权限」作为升级路径。
4. 页面验证：自动消失/悬停暂停、20×20 关闭、图标/阴影/主题、通知点击回跳、deferred 补弹。
5. 按 ADR-010 保持 Esc 关闭队列最新；§6.5 措辞已改为「最新一条（视觉最下）」。

## 10. 声明

补遗与 notifier 纯逻辑完成；**未接 apply、未重启、未在页面观察**。本记录不包含可用性结论。
