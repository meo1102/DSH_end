# workspace/work

任务产物、草稿、候选。候选不得当作已验收事实；当前状态见 [`../../STATUS.md`](../../STATUS.md)。

## 本项目的特殊约定

- 这是 DSH 插件：`package.json`、`index.js`、`client.js`、`lib/`、`locale/`、`cordis.patch.yml` 必须留在**仓库根**（安装入口要求），所以“已发布产品代码”不在本目录。
- 本目录用于：候选补丁、一次性脚本、实验记录、尚未过门禁的草稿。
- 任何候选进入产品代码，必须走：任务板 → 实现/测试 → 证据进 `../evidence/` → 门禁 → 人类接受。
- 本阶段（`steward-1`）明确**不改产品代码**；如果出现候选，先记 `cluster/board.md`，不直接合并。
