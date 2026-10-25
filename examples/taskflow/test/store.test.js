import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createStore, isValidDate, TaskError } from '../src/store.js';

async function makeStore(options) {
  const dir = await mkdtemp(join(tmpdir(), 'taskflow-store-'));
  const filePath = join(dir, 'tasks.json');
  return { dir, filePath, store: createStore(filePath, options) };
}

test('数据文件不存在时返回空状态', async () => {
  const { store } = await makeStore();
  const state = await store.load();
  assert.equal(state.tasks.length, 0);
  assert.equal(state.nextId, 1);
});

test('新增任务会落盘，重新加载后仍在', async () => {
  const { filePath, store } = await makeStore();
  const task = await store.add({ title: '写指南', due: '2026-10-31', tag: 'docs' });
  assert.equal(task.id, 1);
  assert.equal(task.done, false);

  const reloaded = createStore(filePath);
  const tasks = await reloaded.list({ filter: 'all' });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, '写指南');
  assert.equal(tasks[0].due, '2026-10-31');
  assert.equal(tasks[0].tag, 'docs');
});

test('标题为空时报 E_TITLE', async () => {
  const { store } = await makeStore();
  await assert.rejects(store.add({ title: '   ' }), (error) => {
    assert.ok(error instanceof TaskError);
    assert.equal(error.code, 'E_TITLE');
    return true;
  });
});

test('日期校验：闰年合法，不存在的日期非法', async () => {
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-01'), false);

  const { store } = await makeStore();
  await assert.rejects(store.add({ title: '坏日期', due: '2026-02-30' }), { code: 'E_DATE' });
});

test('完成会记录时间并持久化', async () => {
  const fixed = new Date(2026, 9, 24, 9, 30, 0);
  const { filePath, store } = await makeStore({ now: () => fixed });
  await store.add({ title: '写测试' });
  const task = await store.complete(1);
  assert.equal(task.done, true);
  assert.equal(task.completedAt, fixed.toISOString());

  const done = await createStore(filePath).list({ filter: 'done' });
  assert.equal(done.length, 1);
});

test('完成不存在的编号报 E_NOT_FOUND', async () => {
  const { store } = await makeStore();
  await assert.rejects(store.complete(99), { code: 'E_NOT_FOUND' });
});

test('删除任务后编号不复用', async () => {
  const { store } = await makeStore();
  await store.add({ title: 'A' });
  await store.add({ title: 'B' });
  await store.remove(2);
  const task = await store.add({ title: 'C' });
  assert.equal(task.id, 3);
});

test('损坏的 JSON 报 E_CORRUPT', async () => {
  const { filePath, store } = await makeStore();
  await writeFile(filePath, '{ not json', 'utf8');
  await assert.rejects(store.load(), { code: 'E_CORRUPT' });
});

test('stats 统计待办、已完成与逾期', async () => {
  const fixed = new Date(2026, 9, 24, 12, 0, 0);
  const { store } = await makeStore({ now: () => fixed });
  await store.add({ title: '过期未完成', due: '2026-10-20' });
  await store.add({ title: '今天到期', due: '2026-10-24' });
  await store.add({ title: '已完成', due: '2026-10-01' });
  await store.complete(3);

  const stats = await store.stats();
  assert.deepEqual(stats, { total: 3, open: 2, done: 1, overdue: 1 });
});