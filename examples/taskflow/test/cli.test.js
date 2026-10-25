import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { run } from '../src/cli.js';

function capture() {
  const out = [];
  const err = [];
  return {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    out,
    err,
  };
}

async function makeCwd() {
  return mkdtemp(join(tmpdir(), 'taskflow-cli-'));
}

test('add 之后 list 能看到任务', async () => {
  const cwd = await makeCwd();
  const io = capture();
  assert.equal(await run(['add', '写指南', '--due', '2026-10-31', '--tag', 'docs'], { cwd, ...io }), 0);
  assert.equal(await run(['list'], { cwd, ...io }), 0);

  const text = io.out.join('\n');
  assert.match(text, /写指南/);
  assert.match(text, /2026-10-31/);
  assert.match(text, /\[docs\]/);
});

test('list --json 输出可以解析', async () => {
  const cwd = await makeCwd();
  const io = capture();
  await run(['add', '任务一'], { cwd, ...io });
  const jsonRun = capture();
  await run(['list', '--json'], { cwd, ...jsonRun });

  const tasks = JSON.parse(jsonRun.out.join('\n'));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, '任务一');
});

test('done 之后默认列表不再显示，--done 能看到', async () => {
  const cwd = await makeCwd();
  const io = capture();
  await run(['add', '要完成的任务'], { cwd, ...io });
  assert.equal(await run(['done', '1'], { cwd, ...io }), 0);

  const openRun = capture();
  await run(['list'], { cwd, ...openRun, });
  assert.match(openRun.out.join('\n'), /没有符合条件/);

  const doneRun = capture();
  await run(['list', '--done'], { cwd, ...doneRun });
  assert.match(doneRun.out.join('\n'), /要完成的任务/);
});

test('rm 之后 --all 为空', async () => {
  const cwd = await makeCwd();
  const io = capture();
  await run(['add', '待删除'], { cwd, ...io });
  assert.equal(await run(['rm', '1'], { cwd, ...io }), 0);

  const allRun = capture();
  await run(['list', '--all'], { cwd, ...allRun });
  assert.match(allRun.out.join('\n'), /没有符合条件/);
});

test('未知命令退出码为 2', async () => {
  const cwd = await makeCwd();
  const io = capture();
  assert.equal(await run(['frobnicate'], { cwd, ...io }), 2);
  assert.match(io.err.join('\n'), /未知命令/);
});

test('add 缺少标题退出码为 2', async () => {
  const cwd = await makeCwd();
  const io = capture();
  assert.equal(await run(['add'], { cwd, ...io }), 2);
});

test('done 的编号不是数字退出码为 2', async () => {
  const cwd = await makeCwd();
  const io = capture();
  await run(['add', '任务'], { cwd, ...io });
  assert.equal(await run(['done', 'abc'], { cwd, ...io }), 2);
});

test('done 不存在的编号退出码为 1', async () => {
  const cwd = await makeCwd();
  const io = capture();
  assert.equal(await run(['done', '99'], { cwd, ...io }), 1);
  assert.match(io.err.join('\n'), /找不到编号/);
});

test('add 非法日期退出码为 1', async () => {
  const cwd = await makeCwd();
  const io = capture();
  assert.equal(await run(['add', '任务', '--due', '2026-02-30'], { cwd, ...io }), 1);
  assert.match(io.err.join('\n'), /截止日期/);
});

test('--data 指定路径时不影响默认数据文件', async () => {
  const cwd = await makeCwd();
  const io = capture();
  const custom = join(cwd, 'custom', 'my.json');
  assert.equal(await run(['add', '独立任务', '--data', custom], { cwd, ...io }), 0);

  assert.equal(existsSync(custom), true);
  assert.equal(existsSync(join(cwd, '.taskflow', 'tasks.json')), false);
});