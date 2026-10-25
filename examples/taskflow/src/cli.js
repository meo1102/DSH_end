// TaskFlow 命令层：解析参数、调用存储层、把结果格式化后交给 stdout。
import { resolve } from 'node:path';
import { createStore, TaskError } from './store.js';

const USAGE = `TaskFlow —— 零依赖命令行任务管理

用法：
  node bin/taskflow.js <命令> [参数] [选项]

命令：
  add <标题>                 新增任务
  list                       列出未完成任务（默认）
  done <编号>                标记完成
  rm <编号>                  删除任务
  stats                      统计
  help                       显示本帮助

选项：
  --due <YYYY-MM-DD>         截止日期（add）
  --tag <名称>               标签（add）
  --all | --open | --done    list 的过滤条件
  --json                     以 JSON 输出（list）
  --data <路径>              数据文件，默认 ./.taskflow/tasks.json
`;

const VALUE_FLAGS = new Set(['data', 'due', 'tag']);
const BOOLEAN_FLAGS = new Set(['json', 'all', 'open', 'done', 'help']);

/** 用法错误：退出码 2，与“业务失败”区分开。 */
class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv) {
  const parsed = { command: null, positional: [], flags: new Set(), values: {} };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--') {
      parsed.positional.push(...argv.slice(index + 1));
      break;
    }
    if (token === '-h') {
      parsed.flags.add('help');
      continue;
    }
    if (!token.startsWith('--')) {
      if (parsed.command === null) parsed.command = token;
      else parsed.positional.push(token);
      continue;
    }

    const equals = token.indexOf('=');
    const name = equals === -1 ? token.slice(2) : token.slice(2, equals);
    const inline = equals === -1 ? undefined : token.slice(equals + 1);

    if (VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[++index];
      if (value === undefined || value === '') {
        throw new UsageError(`选项 --${name} 需要一个值`);
      }
      parsed.values[name] = value;
      continue;
    }
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined) throw new UsageError(`选项 --${name} 不接受值`);
      parsed.flags.add(name);
      continue;
    }
    throw new UsageError(`未知选项：--${name}`);
  }

  return parsed;
}

function positionalTitle(parsed) {
  return parsed.positional.join(' ').trim();
}

function parseId(parsed, command) {
  const raw = parsed.positional[0];
  if (raw === undefined) {
    throw new UsageError(`${command} 需要任务编号，例如：taskflow ${command} 1`);
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new UsageError(`任务编号必须是正整数：${raw}`);
  }
  return Number(raw);
}

function formatTable(tasks) {
  const idWidth = Math.max(2, ...tasks.map((task) => String(task.id).length));
  const lines = [`${'ID'.padStart(idWidth)}  ${'S'.padEnd(3)}  ${'DUE'.padEnd(10)}  TITLE`];
  for (const task of tasks) {
    const id = String(task.id).padStart(idWidth);
    const state = task.done ? '[x]' : '[ ]';
    const due = (task.due ?? '-').padEnd(10);
    const tag = task.tag ? `  [${task.tag}]` : '';
    lines.push(`${id}  ${state}  ${due}  ${task.title}${tag}`);
  }
  return lines.join('\n');
}

async function addCommand(store, parsed, stdout) {
  const title = positionalTitle(parsed);
  if (!title) {
    throw new UsageError('add 需要任务标题，例如：taskflow add "写周报" --due 2026-10-31');
  }
  const task = await store.add({ title, due: parsed.values.due, tag: parsed.values.tag });
  const tag = task.tag ? ` [${task.tag}]` : '';
  const due = task.due ? `（截止 ${task.due}）` : '';
  stdout(`已添加 #${task.id} ${task.title}${tag}${due}`);
  return 0;
}

async function listCommand(store, parsed, stdout) {
  const selected = ['all', 'open', 'done'].filter((name) => parsed.flags.has(name));
  if (selected.length > 1) {
    throw new UsageError('--all、--open、--done 只能选一个');
  }
  const tasks = await store.list({ filter: selected[0] ?? 'open' });

  if (parsed.flags.has('json')) {
    stdout(JSON.stringify(tasks, null, 2));
    return 0;
  }
  if (tasks.length === 0) {
    stdout('（没有符合条件的任务）');
    return 0;
  }
  stdout(formatTable(tasks));
  return 0;
}

async function doneCommand(store, parsed, stdout) {
  const id = parseId(parsed, 'done');
  const task = await store.complete(id);
  stdout(`已完成 #${task.id} ${task.title}`);
  return 0;
}

async function rmCommand(store, parsed, stdout) {
  const id = parseId(parsed, 'rm');
  const task = await store.remove(id);
  stdout(`已删除 #${task.id} ${task.title}`);
  return 0;
}

async function statsCommand(store, parsed, stdout) {
  const stats = await store.stats();
  stdout(`总数 ${stats.total} | 待办 ${stats.open} | 已完成 ${stats.done} | 逾期 ${stats.overdue}`);
  return 0;
}

/**
 * 执行一条命令，返回进程退出码（0 成功、1 业务失败、2 用法错误）。
 * 依赖通过 options 注入，测试里可以换成内存输出与临时目录。
 */
export async function run(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? ((line) => console.log(line));
  const stderr = options.stderr ?? ((line) => console.error(line));
  const now = options.now ?? (() => new Date());

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    stderr(`错误：${error.message}`);
    stderr('运行 taskflow help 查看用法。');
    return 2;
  }

  if (parsed.flags.has('help') || parsed.command === null || parsed.command === 'help') {
    stdout(USAGE);
    return 0;
  }

  const dataPath = resolve(cwd, parsed.values.data ?? '.taskflow/tasks.json');
  const store = createStore(dataPath, { now });

  try {
    switch (parsed.command) {
      case 'add':
        return await addCommand(store, parsed, stdout);
      case 'list':
        return await listCommand(store, parsed, stdout);
      case 'done':
        return await doneCommand(store, parsed, stdout);
      case 'rm':
        return await rmCommand(store, parsed, stdout);
      case 'stats':
        return await statsCommand(store, parsed, stdout);
      default:
        throw new UsageError(`未知命令：${parsed.command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      stderr(`错误：${error.message}`);
      stderr('运行 taskflow help 查看用法。');
      return 2;
    }
    if (error instanceof TaskError) {
      stderr(`错误：${error.message}`);
      return 1;
    }
    throw error;
  }
}