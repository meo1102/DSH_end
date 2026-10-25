// TaskFlow 存储层：只负责数据文件的读写与基础校验，不关心命令行怎么调用。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DATA_VERSION = 1;

/** 业务错误：code 用来区分错误类型，message 直接展示给用户。 */
export class TaskError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaskError';
    this.code = code;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 校验 YYYY-MM-DD，并拒绝 2026-02-30 这种“格式对、日期不存在”的值。 */
export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 把 Date 转成本地时区的 YYYY-MM-DD，用于判断是否逾期。 */
export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyState() {
  return { version: DATA_VERSION, nextId: 1, tasks: [] };
}

/**
 * 创建存储实例。
 * @param {string} filePath 数据文件路径
 * @param {{ now?: () => Date }} [options] 注入时钟，便于测试
 */
export function createStore(filePath, { now = () => new Date() } = {}) {
  async function load() {
    let raw;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      // 文件还不存在是正常状态，不是错误。
      if (error.code === 'ENOENT') return emptyState();
      throw error;
    }

    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new TaskError('E_CORRUPT', `数据文件不是合法 JSON：${filePath}`);
    }
    if (!state || !Array.isArray(state.tasks)) {
      throw new TaskError('E_CORRUPT', `数据文件结构不正确：${filePath}`);
    }

    return {
      version: DATA_VERSION,
      nextId: Number.isInteger(state.nextId) ? state.nextId : state.tasks.length + 1,
      tasks: state.tasks,
    };
  }

  async function save(state) {
    await mkdir(dirname(filePath), { recursive: true });
    // 先写临时文件再改名：避免写到一半崩溃留下半截 JSON。
    const tempPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  }

  async function add({ title, due, tag } = {}) {
    const cleanTitle = String(title ?? '').trim();
    if (!cleanTitle) throw new TaskError('E_TITLE', '任务标题不能为空');
    if (due !== undefined && due !== null && !isValidDate(due)) {
      throw new TaskError('E_DATE', `截止日期必须是 YYYY-MM-DD 且真实存在：${due}`);
    }

    const state = await load();
    const task = {
      id: state.nextId,
      title: cleanTitle,
      tag: tag ? String(tag).trim() : null,
      due: due ?? null,
      done: false,
      createdAt: now().toISOString(),
      completedAt: null,
    };
    state.tasks.push(task);
    state.nextId += 1;
    await save(state);
    return task;
  }

  async function list({ filter = 'open' } = {}) {
    const state = await load();
    const tasks = state.tasks.filter((task) => {
      if (filter === 'all') return true;
      if (filter === 'done') return task.done;
      return !task.done;
    });
    return tasks.sort((a, b) => a.id - b.id);
  }

  async function find(id) {
    const state = await load();
    const task = state.tasks.find((item) => item.id === id);
    if (!task) throw new TaskError('E_NOT_FOUND', `找不到编号为 ${id} 的任务`);
    return task;
  }

  async function complete(id) {
    const state = await load();
    const task = state.tasks.find((item) => item.id === id);
    if (!task) throw new TaskError('E_NOT_FOUND', `找不到编号为 ${id} 的任务`);
    if (!task.done) {
      task.done = true;
      task.completedAt = now().toISOString();
      await save(state);
    }
    return task;
  }

  async function remove(id) {
    const state = await load();
    const index = state.tasks.findIndex((item) => item.id === id);
    if (index === -1) throw new TaskError('E_NOT_FOUND', `找不到编号为 ${id} 的任务`);
    const [removed] = state.tasks.splice(index, 1);
    await save(state);
    return removed;
  }

  async function stats() {
    const tasks = (await load()).tasks;
    const today = localDateString(now());
    return {
      total: tasks.length,
      open: tasks.filter((task) => !task.done).length,
      done: tasks.filter((task) => task.done).length,
      // 只有“未完成且截止日早于今天”才算逾期。
      overdue: tasks.filter((task) => !task.done && task.due && task.due < today).length,
    };
  }

  return { filePath, load, save, add, list, find, complete, remove, stats };
}