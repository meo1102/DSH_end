import test from 'node:test';
import assert from 'node:assert/strict';

import { loadClientModule } from './harness.js';

const { factory } = loadClientModule();
const { createStore } = factory.__test__;

/** 假时钟：只推进显式时间，不 sleep、不依赖真实时间。 */
function createClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => time,
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: time + Math.max(0, delay), callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = time + Math.max(0, ms);
      for (;;) {
        let due = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (due === null || timer.at < due.timer.at)) {
            due = { id, timer };
          }
        }
        if (due === null) break;
        timers.delete(due.id);
        time = due.timer.at;
        due.timer.callback();
      }
      time = target;
    },
    pending() {
      return timers.size;
    },
  };
}

function createHarness(options = {}) {
  const clock = createClock();
  const env = {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    list: options.list ?? { phase: 'ready', ids: [], byId: {} },
    onStatus(handler) {
      statusHandler = handler;
      return () => {
        if (statusHandler === handler) statusHandler = null;
      };
    },
    getBinding: options.getBinding ?? (() => undefined),
  };
  let statusHandler = null;

  const store = createStore(env, options.config);
  store.start();

  return {
    store,
    clock,
    env,
    status(id, running) {
      assert.equal(typeof statusHandler, 'function', 'store.start 应订阅 onStatus');
      statusHandler(id, running);
    },
    setList(next) {
      env.list = next;
    },
  };
}

function itemsOf(store) {
  return Array.from(store.get(), (item) => ({
    key: item.key,
    sessionId: item.sessionId,
    at: item.at,
    outcome: item.outcome,
  }));
}

test('U01 phase=pending 的首个 status(false) 只记基线，不弹', () => {
  const harness = createHarness({
    list: { phase: 'pending', ids: ['s-1'], byId: { 's-1': { running: false } } },
    config: { minRunMs: 0 },
  });

  harness.status('s-1', false);
  harness.clock.advance(1000);
  assert.deepEqual(itemsOf(harness.store), [], '基线不得入队');

  // 真实 running 之后仍能正常入队，证明基线没有被当成 running。
  harness.status('s-1', true);
  harness.clock.advance(1600);
  harness.status('s-1', false);
  harness.clock.advance(250);
  assert.equal(itemsOf(harness.store).length, 1);
  assert.equal(itemsOf(harness.store)[0].outcome, 'pending');
});

test('U02 status(true) → 2s → status(false)，250ms 后入队', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-2'], byId: { 's-2': { running: true } } },
  });

  harness.status('s-2', true);
  harness.clock.advance(2000);
  harness.status('s-2', false);
  harness.clock.advance(249);
  assert.equal(itemsOf(harness.store).length, 0, '观察窗未满 250ms 不得入队');
  harness.clock.advance(1);

  const items = itemsOf(harness.store);
  assert.equal(items.length, 1);
  assert.equal(items[0].sessionId, 's-2');
  assert.equal(items[0].at, 2250);
  assert.equal(items[0].outcome, 'pending');
});

test('U03 运行 800ms 后结束被 minRunMs 抑制', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-3'], byId: { 's-3': { running: true } } },
  });

  harness.status('s-3', true);
  harness.clock.advance(800);
  harness.status('s-3', false);
  harness.clock.advance(300);
  assert.deepEqual(itemsOf(harness.store), []);
});

test('U04 观察窗内回弹 status(true) 取消，不入队', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-4'], byId: { 's-4': { running: true } } },
  });

  harness.status('s-4', true);
  harness.clock.advance(2000);
  harness.status('s-4', false);
  harness.clock.advance(100);
  harness.status('s-4', true);
  harness.clock.advance(500);
  assert.deepEqual(itemsOf(harness.store), []);
});

test('U05 pendingSubmissions 非空时抑制', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-5'], byId: { 's-5': { running: true } } },
    getBinding: () => ({
      session: {
        getSnapshot: () => ({ pendingSubmissions: [{ text: 'queued' }] }),
      },
    }),
  });

  harness.status('s-5', true);
  harness.clock.advance(2000);
  harness.status('s-5', false);
  harness.clock.advance(300);
  assert.deepEqual(itemsOf(harness.store), []);
});

test('U06 同会话两次完成间隔 2s，冷却合并只留一条', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-6'], byId: { 's-6': { running: true } } },
  });

  harness.status('s-6', true);
  harness.clock.advance(2000);
  harness.status('s-6', false);
  harness.clock.advance(250);
  assert.equal(itemsOf(harness.store).length, 1);

  harness.status('s-6', true);
  harness.clock.advance(2000);
  harness.status('s-6', false);
  harness.clock.advance(250);

  const items = itemsOf(harness.store);
  assert.equal(items.length, 1, '冷却窗内第二次不得入队');
  assert.equal(items[0].at, 2250);
});

test('U07 4 条同时有效时最多 3 条，最旧被移除', () => {
  const byId = {};
  for (let index = 0; index < 4; index += 1) byId[`s-${index}`] = { running: true };
  const harness = createHarness({ list: { phase: 'ready', ids: Object.keys(byId), byId } });

  for (let index = 0; index < 4; index += 1) harness.status(`s-${index}`, true);
  harness.clock.advance(2000);
  for (let index = 0; index < 4; index += 1) harness.status(`s-${index}`, false);
  harness.clock.advance(250);

  const items = itemsOf(harness.store);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.sessionId), ['s-1', 's-2', 's-3']);
  assert.equal(items.every((item) => item.outcome === 'pending'), true);
});

test('U08 一分钟内 10 次完成，第 7 次起抑制', () => {
  const byId = {};
  for (let index = 0; index < 10; index += 1) byId[`r-${index}`] = { running: true };
  const harness = createHarness({ list: { phase: 'ready', ids: Object.keys(byId), byId } });
  const seen = new Set();

  harness.store.subscribe((snapshot) => {
    for (const item of snapshot) seen.add(item.sessionId);
  });

  for (let index = 0; index < 10; index += 1) {
    harness.status(`r-${index}`, true);
    harness.clock.advance(2000);
    harness.status(`r-${index}`, false);
    harness.clock.advance(250);
  }

  assert.equal(seen.size, 6, '前 6 次入队，第 7-10 次应被限流');
  assert.equal(itemsOf(harness.store).length, 3, 'maxVisible 仍为 3');
});

test('U09 会话不在 byId 时抑制', () => {
  const harness = createHarness({ list: { phase: 'ready', ids: [], byId: {} } });

  harness.status('s-9', true);
  harness.clock.advance(2000);
  harness.status('s-9', false);
  harness.clock.advance(300);
  assert.deepEqual(itemsOf(harness.store), []);
});

test('U10 byId 行带 subagent 标记时抑制（V-2 未证实）', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-10'], byId: { 's-10': { running: true, origin: 'subagent' } } },
  });

  harness.status('s-10', true);
  harness.clock.advance(2000);
  harness.status('s-10', false);
  harness.clock.advance(300);
  assert.deepEqual(itemsOf(harness.store), []);
});

test('U11 reset 清空状态/队列/计时器并重新基线', () => {
  const harness = createHarness({
    list: { phase: 'ready', ids: ['s-11'], byId: { 's-11': { running: true } } },
  });

  harness.status('s-11', true);
  harness.clock.advance(2000);
  harness.status('s-11', false);
  harness.clock.advance(250);
  assert.equal(itemsOf(harness.store).length, 1);

  harness.store.reset();
  assert.deepEqual(itemsOf(harness.store), []);
  assert.equal(harness.clock.pending(), 0);

  // 观察窗计时器也必须被 reset 清掉。
  harness.status('s-11', true);
  harness.clock.advance(2000);
  harness.status('s-11', false);
  assert.equal(harness.clock.pending(), 1);
  harness.store.reset();
  assert.equal(harness.clock.pending(), 0);
  harness.clock.advance(500);
  assert.deepEqual(itemsOf(harness.store), []);

  // 重新基线后，真实 running 仍可产生新条目。
  harness.setList({ phase: 'pending', ids: ['s-11'], byId: { 's-11': { running: false } } });
  harness.status('s-11', false);
  harness.clock.advance(500);
  assert.deepEqual(itemsOf(harness.store), []);

  harness.status('s-11', true);
  harness.clock.advance(1600);
  harness.status('s-11', false);
  harness.clock.advance(250);
  assert.equal(itemsOf(harness.store).length, 1);
});
