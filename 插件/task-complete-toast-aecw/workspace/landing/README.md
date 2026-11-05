# workspace/landing

落地清单/交接/退役：可用、可运维、可交接、可审计、成本、遗留接受、照护者。

| 文件 | 内容 | 时效 |
|---|---|---|
| [`manifest.md`](manifest.md) | v1.2.0 落地清单（可用/可运维/可交接/可审计/遗留/照护者/退役） | 当前 |
| [`handover-2026-11-04.md`](handover-2026-11-04.md) | 2026-11-04 交接说明（安装历史、回滚、已知坑） | 历史/参考 |
| [`migration-aecw-2026-11-05.md`](migration-aecw-2026-11-05.md) | 本次 AECW 结构迁移的映射与验证记录 | 当前 |

## 规则

- 没有**具名照护者**不算落地；遗留必须有人接受（见 `../../human/acceptance.md`）。
- 落地清单不是发布公告；发布口径仍看 `../evidence/acceptance-report-v1.2.0.md` §14。
- 退役路径必须可执行：卸载 bundle / 移除 profile link / 还原 patch；不修改宿主。
