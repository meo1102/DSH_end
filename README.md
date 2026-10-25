# 从零开始使用 Harness 开发软件

这个仓库只做一件事：把“我想做个东西”变成“代理能执行、你能验收”的软件工程流程。

## 先读哪个

| 你的情况 | 从这里开始 |
| --- | --- |
| 第一次接触 Harness | [指南正文](从零开始使用Harness开发软件指南.md)，从第 0 章顺序读 |
| 想马上动手 | [examples/taskflow](examples/taskflow/README.md) 的“快速开始”，再回读指南第 7 章 |
| 当手册查 | 指南第 5 章（工具）、第 9 章（排障与反模式）、第 10 章（附录模板） |

## 仓库结构

```text
DSH_end/
├─ 从零开始使用Harness开发软件指南.md   主指南：10 章 + 附录
├─ README.md                            你正在看的导航
├─ AGENTS.md                            仓库约定（给代理看的）
└─ examples/taskflow/                   配套示例：零依赖 Node CLI + 19 个测试
```

## 5 分钟跑通示例

在 `examples/taskflow` 目录下：

```powershell
node bin/taskflow.js add "写周报" --due 2026-10-31 --tag work
node bin/taskflow.js list
node bin/taskflow.js stats
node --test --test-isolation=none "test/*.test.js"
```

预期：前三条命令分别打印新增结果、任务表、统计行；最后一条显示 19 个测试全部通过。

若 `node` 不在 PATH 里，用 Harness 自带 Node 的完整路径，取法见指南 3.4 节。

## 环境

- Windows 10/11，已安装 DeepSeek Harness 桌面版
- 示例代码本身只需 Node 20+；验收命令用了 `--test-isolation`，需要 Node 22.8 以上（本机 PATH 上是 24.22.1，Harness 自带 24.21.0）
- 本机已装 Node 24.22.1、npm 11.19.1、git 2.56.0，都在 PATH 上；PowerShell 里包管理器命令建议写成 `pnpm.cmd` / `npm.cmd`，原因见指南 3.4 节
- 无第三方依赖，不需要联网

## 本仓库的验收

```powershell
# 在 examples/taskflow 下
node --test --test-isolation=none "test/*.test.js"
```

全部通过（0 失败）即视为示例可用；主指南中出现的每条命令都在编写时实际执行过。