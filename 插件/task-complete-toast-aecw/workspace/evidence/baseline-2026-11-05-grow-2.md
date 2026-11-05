# 基线冻结 · grow-2（2026-11-05）

> 阶段 `grow-2` 关闭后的代码/验收基线。**当前状态以 `STATUS.md` 为准**；本文件只记录冻结事实。

| 项 | 值 |
|---|---|
| Git 提交 | `4aff41a`（`DSH_end` 仓库，master） |
| Git tag | `aecw-grow-2-2026-11-05` |
| 产品版本 | `1.2.0`（G4 设置未发布） |
| 阶段 | `grow-2`（closed，有条件通过） |
| 门禁 | [`gates/2026-11-05-grow-2.md`](../../gates/2026-11-05-grow-2.md) |
| 验收 | G4 设置页（F-040，E2 无截图）；G2 遮挡推送真机（F-042，E2 无截图） |
| 自动化 | 169/169；`node --check` 17/17 |
| 结构检查 | `node bin/aecw.mjs check .` → FAIL 0｜WARN 0 |

## 代码哈希（SHA-256）

| 文件 | 哈希 |
|---|---|
| `client.js` | `351080FC7314C3214506E8042C1FAB67B964CDED7D2D4334E69A01E2E0CF515D` |
| `lib/config.js` | `7D11DC96006D81A726B8200F7AF7A0F8E345B49DD4230B0C3FD272B48D2E0A1F` |
| `lib/host.js` | `0FC37D2D10AA8559FC8C818A38795245713B726D15209CA34760F34BC5F2F5B9` |
| `index.js` | `7D90BC6CC88D12F106F268895F843B9414ABAF03BD2D367D23BBC7D291B09278` |
| `package.json` | `77C60378A6D8861749714AFB567569A2F87FCC05D2E1030DBA93F99CA779E117` |

## 未决 / 证据缺口

- 真机截图/录屏：零（G4/G2 均为人类口述 E2）。
- G4 未发布；版本号仍 1.2.0。
- G2-8、G3-4b 已接受遗留；13 项 V 项 + V01/V04/V23 未裁决。
- G2 多标签、窄窗、自定义主题一致性未验。

> 冻结后若要改产品代码/验收判据，必须新蓝图 + 新 `freeze`/`start`，不得原地改本基线。
