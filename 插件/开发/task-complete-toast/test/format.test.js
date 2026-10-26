import test from 'node:test';
import assert from 'node:assert/strict';

import { loadClientModule } from './harness.js';

const { factory } = loadClientModule();
const { formatLine, titleOf, resolveNames } = factory.__test__;

const ZH = {
  format: ({ workspace, session, status }) => `${workspace}[${session}] · ${status}`,
  fallbackWorkspace: '未分组',
  fallbackSession: '未命名会话',
  statusIdle: '待执行',
  titleCompleted: '任务完成',
  titleError: '任务失败',
  titleStopped: '任务已停止',
  titleInterrupted: '任务已中断',
  titleBlocked: '任务被阻止',
  actionClose: '关闭提示',
};

const EN = {
  format: ({ workspace, session, status }) => `${workspace}[${session}] · ${status}`,
  fallbackWorkspace: 'Ungrouped',
  fallbackSession: 'Untitled session',
  statusIdle: 'Idle',
  titleCompleted: 'Task completed',
  titleError: 'Task failed',
  titleStopped: 'Task stopped',
  titleInterrupted: 'Task interrupted',
  titleBlocked: 'Task blocked',
  actionClose: 'Dismiss',
};

function tFor(dict) {
  return (key, params) => {
    const value = dict[key];
    return typeof value === 'function' ? value(params) : (value ?? key);
  };
}

const tZh = tFor(ZH);
const tEn = tFor(EN);

/** resolveNames 在 vm realm 创建对象；转成本 realm 的普通对象再断言。 */
function namesOf(...args) {
  const names = resolveNames(...args);
  return { workspace: names.workspace, session: names.session };
}

test('U15 formatLine：中英文严格匹配 {workspace}[{session}] · {status}', () => {
  const zh = formatLine(tZh, '插件', 'Toast 弹窗', '待执行');
  const en = formatLine(tEn, 'Plugins', 'Toast popup', 'Idle');

  assert.equal(zh, '插件[Toast 弹窗] · 待执行');
  assert.equal(en, 'Plugins[Toast popup] · Idle');
  assert.match(zh, /^.+\[.+\] · (待执行|执行中|等待回答|等待审批|Idle|Running|Awaiting answer|Awaiting approval)$/);
  assert.match(en, /^.+\[.+\] · (待执行|执行中|等待回答|等待审批|Idle|Running|Awaiting answer|Awaiting approval)$/);
});

test('U16 缺工作区/会话名落回退文案', () => {
  assert.equal(
    formatLine(tZh, undefined, undefined, '待执行'),
    '未分组[未命名会话] · 待执行',
  );
  assert.equal(
    formatLine(tEn, '', null, 'Idle'),
    'Ungrouped[Untitled session] · Idle',
  );
  assert.equal(
    formatLine(tZh, '   ', '   ', '待执行'),
    '未分组[未命名会话] · 待执行',
  );

  assert.deepEqual(namesOf(null, null, 's-1'), {
    workspace: undefined,
    session: undefined,
  });
});

test('U16b resolveNames：byId/数组/path 末段/会话 title', () => {
  const byIdWorkspaces = {
    ids: ['w-1'],
    byId: {
      'w-1': { title: '插件', sessionIds: ['s-1'] },
      'w-2': { title: '其他', sessionIds: ['s-2'] },
    },
  };
  assert.deepEqual(
    namesOf(byIdWorkspaces, { byId: { 's-1': { title: 'Toast' } } }, 's-1'),
    { workspace: '插件', session: 'Toast' },
  );

  assert.deepEqual(
    namesOf([{ title: 'Plugins', sessionIds: ['s-1'] }], { byId: { 's-1': { title: 'Toast popup' } } }, 's-1'),
    { workspace: 'Plugins', session: 'Toast popup' },
  );

  assert.deepEqual(
    namesOf(
      { byId: { w: { path: 'C:\\\\work\\\\插件', sessionIds: ['s-1'] } } },
      { byId: { 's-1': {} } },
      's-1',
    ),
    { workspace: '插件', session: undefined },
  );
});

test('U17 超长名称返回完整文本，不截断（截断交给 CSS）', () => {
  const long = '会'.repeat(400);
  const line = formatLine(tZh, long, long, '待执行');

  assert.equal(line, `${long}[${long}] · 待执行`);
  assert.equal(line.includes(long), true);
  assert.equal(line.includes('…'), false);
  assert.equal(line.length > 400, true);
});

test('titleOf：§7.5 映射与未知 outcome 回 completed', () => {
  assert.equal(titleOf(tZh, 'completed'), '任务完成');
  assert.equal(titleOf(tZh, 'error'), '任务失败');
  assert.equal(titleOf(tZh, 'stopped'), '任务已停止');
  assert.equal(titleOf(tZh, 'interrupted'), '任务已中断');
  assert.equal(titleOf(tZh, 'blocked'), '任务被阻止');
  assert.equal(titleOf(tEn, 'completed'), 'Task completed');
  assert.equal(titleOf(tZh, 'pending'), '任务完成');
  assert.equal(titleOf(tZh, 'unknown-outcome'), '任务完成');
});

test('formatLine：模板占位符与缺省 t 的兜底', () => {
  const templateT = (key) => (key === 'format' ? '{workspace}[{session}] · {status}' : key);
  assert.equal(formatLine(templateT, 'W', 'S', 'Idle'), 'W[S] · Idle');
  assert.equal(formatLine((key) => key, 'W', 'S', 'Idle'), 'W[S] · Idle');
});
