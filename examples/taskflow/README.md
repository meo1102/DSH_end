# TaskFlow

零依赖的命令行任务管理工具，是《从零开始使用 Harness 开发软件指南》第 7 章的配套示例。

它故意做得很小：一个数据文件、六个命令、两层代码（命令层 + 存储层）、19 个测试。看懂它，就掌握了“用代理把一个想法做成可验收软件”的最小骨架。

## 环境

- Node.js 20 及以上（Harness 自带 Node 24.21.0，取路径的方法见指南 3.4 节）
- 没有第三方依赖，不需要联网，也不需要 `npm install`

## 快速开始

在 `examples/taskflow` 目录下执行：

```powershell
node bin/taskflow.js add "写周报" --due 2026-10-31 --tag work
node bin/taskflow.js add "读一本书"
node bin/taskflow.js list
node bin/taskflow.js done 1
node bin/taskflow.js list --all
node bin/taskflow.js stats
```

`list` 的真实输出：

```text
ID  S    DUE         TITLE
 1  [ ]  2026-10-31  写周报  [work]
 2  [ ]  -           读一本书
```

## 命令与选项

| 命令 | 作用 | 关键选项 |
| --- | --- | --- |
| `add <标题>` | 新增任务 | `--due YYYY-MM-DD`、`--tag <名称>` |
| `list` | 列出任务，默认只看未完成 | `--open`、`--done`、`--all`、`--json` |
| `done <编号>` | 标记完成（重复执行不报错） | — |
| `rm <编号>` | 删除任务 | — |
| `stats` | 统计总数、待办、已完成、逾期 | — |
| `help` | 显示用法 | — |

全局选项：`--data <路径>` 指定数据文件，默认 `./.taskflow/tasks.json`（相对当前工作目录）。

## 数据文件

```json
{
  "version": 1,
  "nextId": 3,
  "tasks": [
    {
      "id": 2,
      "title": "读一本书",
      "tag": null,
      "due": null,
      "done": false,
      "createdAt": "2026-10-24T08:30:00.000Z",
      "completedAt": null
    }
  ]
}
```

写入策略是“临时文件 + rename”：进程在写入中途崩溃时，旧文件仍然完整。

## 退出码

| 退出码 | 含义 | 例子 |
| --- | --- | --- |
| `0` | 成功 | 正常的增删改查 |
| `1` | 业务失败 | 任务不存在、标题为空、日期非法、数据文件损坏 |
| `2` | 用法错误 | 未知命令或选项、缺少参数、`--open/--done/--all` 冲突 |

区分 1 和 2 的目的：脚本可以据此判断“是我的参数写错了”还是“业务上不允许”。

## 测试

```powershell
node --test --test-isolation=none "test/*.test.js"
```

19 个测试，覆盖存储层与命令行两层，包含失败路径。

`--test-isolation=none` 让测试在同一个进程内运行。原因：Harness 的沙箱禁止命名管道，测试运行器默认会为每个测试文件启动子进程并通过管道回收输出，会报 `EPERM: spawn`。在普通终端里，`node --test test/` 也能跑通。

## 目录结构

```text
taskflow/
├─ bin/taskflow.js      可执行入口，只负责取 argv、设置退出码
├─ src/store.js         存储层：读写 JSON、校验、统计（不碰命令行）
├─ src/cli.js           命令层：解析参数、调度、格式化输出
├─ test/store.test.js   存储层单元测试
├─ test/cli.test.js     命令层集成测试
├─ AGENTS.md            给代理看的项目约定
└─ README.md            本文件
```

## 设计取舍

- **零依赖**：示例要能离线跑、随时复制，不把时间花在装包和版本冲突上。
- **注入时钟**：`createStore(file, { now })` 让“逾期”可测，不依赖当天日期。
- **两层分离**：`store.js` 不知道 `argv`，`cli.js` 不知道文件格式，测试才能各测各的。
- **默认只看未完成**：日常使用里，已完成的任务是噪音。
- **错误分类**：用法错误和业务失败用不同退出码，给调用方留判断依据。

## 已知限制

- 单进程、无锁：同时开两个命令写同一个文件，后写的赢。
- 只有增删改查：没有提醒、重复任务、优先级、搜索。
- 时间只精确到日：逾期判断按本地时区的日期比较。

这些限制是刻意的——它们是第 7 章复盘里“下一轮可以做什么”的素材。