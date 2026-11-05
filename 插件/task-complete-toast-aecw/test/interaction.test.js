/**
 * G2 交互提醒单测（I01–I07）。
 *
 * 只测纯队列：uiSession.sessionStatus 快照 → 常驻提醒；不渲染 React，
 * 不读 pending 的内容字段，不连接真实 uiSession。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadClientModule } from './harness.js';

const { factory } = loadClientModule();
const { createInteractionStore, pendingInteractionOf } = factory.__test__;

function createSource(initial = new Map()) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

function status(pending = undefined) {
  return { running: true, pendingInteraction: pending, completionUnread: false };
}

function pending(key, kind) {
  return { key, kind };
}

test('I01 初始快照中的 approval pending 入队一次，卸载取消订阅', () => {
  const source = createSource(new Map([
    ['s-1', status(pending('approval:1', 'approval'))],
  ]));
  const added = [];
  const store = createInteractionStore({
    source,
    onAdded: (item) => added.push(item),
    onRemoved: () => {},
  }, { maxVisible: 3 });

  const stop = store.start();
  const items = store.get();
  assert.equal(items.length, 1);
  assert.equal(items[0].key, 'notice:approval:1');
  assert.equal(items[0].pendingKey, 'approval:1');
  assert.equal(items[0].sessionId, 's-1');
  assert.equal(items[0].kind, 'approval');
  assert.equal(added.length, 1);
  assert.equal(source.listenerCount(), 1);

  stop();
  assert.equal(source.listenerCount(), 0, 'stop 必须取消 source 订阅');
  assert.equal(store.get().length, 0);
});

test('I02 pending 解决后自动移除并回调 onRemoved', () => {
  const source = createSource(new Map([
    ['s-2', status(pending('approval:2', 'approval'))],
  ]));
  const removed = [];
  const store = createInteractionStore({ source, onRemoved: (item) => removed.push(item) });
  const stop = store.start();

  source.set(new Map());
  assert.equal(store.get().length, 0);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].key, 'notice:approval:2');

  source.set(new Map([
    ['s-2', status(pending('approval:3', 'approval'))],
  ]));
  assert.equal(store.get().length, 1, '新 pending key 应重新入队');
  assert.equal(store.get()[0].key, 'notice:approval:3');

  stop();
});

test('I03 手动 dismiss 后本轮 pending 内不再补弹；解决后再出现同 key 可重新提醒', () => {
  const source = createSource(new Map([
    ['s-3', status(pending('question:9', 'question'))],
  ]));
  const added = [];
  const removed = [];
  const store = createInteractionStore({
    source,
    onAdded: (item) => added.push(item),
    onRemoved: (item) => removed.push(item),
  });
  const stop = store.start();
  const key = store.get()[0].key;

  store.dismiss(key);
  assert.equal(store.get().length, 0, 'dismiss 后视觉移除');
  assert.equal(removed.length, 1, 'dismiss 也关闭对应系统通知');

  source.set(new Map([
    ['s-3', status(pending('question:9', 'question'))],
  ]));
  assert.equal(store.get().length, 0, '同一 pending 不因 dismiss 补弹');

  source.set(new Map());
  assert.equal(store.get().length, 0);

  source.set(new Map([
    ['s-3', status(pending('question:9', 'question'))],
  ]));
  assert.equal(store.get().length, 1, 'pending 结束后抑制状态必须清除');
  assert.equal(added.length, 2);

  stop();
});

test('I04 kind 映射：approval/question/plan-review；未知 kind 与缺 key 跳过', () => {
  const source = createSource(new Map([
    ['s-4a', status(pending('approval:4', 'approval'))],
    ['s-4b', status(pending('question:4', 'question'))],
    ['s-4c', status(pending('plan:4', 'plan-review'))],
    ['s-4d', status(pending('mystery:4', 'mystery'))],
    ['s-4e', status({ kind: 'approval' })],
    ['s-4f', status(null)],
    ['s-4g', status({ key: 'question:review', kind: 'question', review: { answers: [] } })],
  ]));
  const store = createInteractionStore({ source }, { maxVisible: 5 });
  const stop = store.start();

  const items = store.get();
  assert.equal(items.map((item) => item.kind).join(','), 'approval,question,plan-review');

  const keys = factory.__test__.noticeKindKeys;
  assert.equal(keys('approval').title, 'titleAwaitingApproval');
  assert.equal(keys('question').title, 'titleAwaitingAnswer');
  assert.equal(keys('plan-review').status, 'statusAwaitingAnswer');
  assert.equal(keys('unknown').title, 'titleAwaitingConfirmation');

  assert.equal(pendingInteractionOf(status(pending('mystery:4', 'mystery'))), undefined);
  assert.equal(pendingInteractionOf(status({ key: '', kind: 'approval' })), undefined);
  assert.equal(pendingInteractionOf(status(null)), undefined);
  assert.equal(pendingInteractionOf(status({ key: 'q', kind: 'question', review: {} })), undefined, '只读回看卡不提醒');

  stop();
});

test('I05 maxVisible 上限生效，新增过多时保留最新', () => {
  const source = createSource(new Map([
    ['s-5a', status(pending('approval:5a', 'approval'))],
    ['s-5b', status(pending('approval:5b', 'approval'))],
    ['s-5c', status(pending('approval:5c', 'approval'))],
    ['s-5d', status(pending('approval:5d', 'approval'))],
  ]));
  const store = createInteractionStore({ source }, { maxVisible: 3 });
  const stop = store.start();

  assert.equal(store.get().map((item) => item.pendingKey).join(','), 'approval:5b,approval:5c,approval:5d');

  stop();
});

test('I06 非法/缺失 source 与畸形快照不抛错', () => {
  for (const source of [undefined, null, {}, { getSnapshot: () => null }, { getSnapshot: () => [] }]) {
    const store = createInteractionStore({ source });
    const stop = store.start();
    assert.equal(store.get().length, 0);
    stop();
  }

  const source = createSource(new Map([
    ['s-6', null],
    [42, status(pending('approval:6', 'approval'))],
  ]));
  const store = createInteractionStore({ source });
  const stop = store.start();
  assert.equal(store.get().length, 0, 'sessionId 非字符串不得入队');
  stop();
});

test('I07 onAdded / onRemoved 抛错不影响队列', () => {
  const source = createSource(new Map([
    ['s-7', status(pending('approval:7', 'approval'))],
  ]));
  const store = createInteractionStore({
    source,
    onAdded: () => {
      throw new Error('notify failed');
    },
    onRemoved: () => {
      throw new Error('close failed');
    },
  });
  const stop = store.start();
  assert.equal(store.get().length, 1);

  source.set(new Map());
  assert.equal(store.get().length, 0, '回调抛错后仍应完成移除');
  stop();
});
