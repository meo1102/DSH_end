import test from 'node:test';
import assert from 'node:assert/strict';

import { createBroadcastBus, loadClientModule } from './harness.js';

const { factory } = loadClientModule();
const { createStore, createClaimLease, createTabId } = factory.__test__;

async function flushMicrotasks(times = 20) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

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
  const clock = options.clock ?? createClock();
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
    claim: options.claim,
    resetClaims: options.resetClaims,
    onDiagnostic: options.onDiagnostic,
    isForeground: typeof options.isForeground === 'function'
      ? options.isForeground
      : (options.isForeground === undefined ? undefined : () => options.isForeground),
    resolve: options.resolve,
    debug: options.debug,
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

function createLease(clock, bus, tabId, config = {}) {
  return createClaimLease({
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    BroadcastChannel: bus?.Ctor,
    tabId,
    crypto: { randomUUID: () => tabId },
  }, { claimWindowMs: 80, ...config });
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

// ---------------------------------------------------------------------------
// R2 多标签认领（ADR-011 / §7.6）
// 输家不入队，因此也不会触发通知（通知只由队列条目驱动）。
// ---------------------------------------------------------------------------

test('R2-T0 tabId：优先 crypto.randomUUID，失败时回落到非空字符串', () => {
  assert.equal(createTabId({ crypto: { randomUUID: () => 'uuid-1' } }), 'uuid-1');

  const fallback = createTabId({
    crypto: {
      randomUUID() {
        throw new Error('not available');
      },
    },
  });
  assert.equal(typeof fallback, 'string');
  assert.ok(fallback.length > 0);
  assert.notEqual(fallback, createTabId({ crypto: {} }), '回退值必须带随机性');
});

test('R2-T1 两标签：字典序较小的 tabId 胜出，输家不入队', async () => {
  const clock = createClock();
  const bus = createBroadcastBus();
  const list = { phase: 'ready', ids: ['r2-1'], byId: { 'r2-1': { running: true } } };
  const leaseB = createLease(clock, bus, 'b');
  const leaseA = createLease(clock, bus, 'a');
  const tabB = createHarness({ clock, list, claim: leaseB.claim, resetClaims: leaseB.reset });
  const tabA = createHarness({ clock, list, claim: leaseA.claim, resetClaims: leaseA.reset });

  // 大 tabId 先结算并广播；小 tabId 稍后结算，胜出。
  tabB.status('r2-1', true);
  tabA.status('r2-1', true);
  clock.advance(2000);
  tabB.status('r2-1', false);
  tabA.status('r2-1', false);
  await flushMicrotasks();
  clock.advance(80); // 认领窗到期
  await flushMicrotasks();
  clock.advance(170); // 250ms 观察窗到期，decide
  await flushMicrotasks();

  assert.equal(itemsOf(tabA.store).length, 1, '小 tabId 应胜出入队');
  assert.equal(itemsOf(tabB.store).length, 0, '输家不得入队/通知');
  leaseA.dispose();
  leaseB.dispose();
});

test('R2-T1b 胜者按字符串字典序：tabId "10" < "9"', async () => {
  const clock = createClock();
  const bus = createBroadcastBus();
  const list = { phase: 'ready', ids: ['r2-1b'], byId: { 'r2-1b': { running: true } } };
  const leaseNine = createLease(clock, bus, '9');
  const leaseTen = createLease(clock, bus, '10');
  const tabNine = createHarness({ clock, list, claim: leaseNine.claim, resetClaims: leaseNine.reset });
  const tabTen = createHarness({ clock, list, claim: leaseTen.claim, resetClaims: leaseTen.reset });

  tabNine.status('r2-1b', true);
  tabTen.status('r2-1b', true);
  clock.advance(2000);
  tabNine.status('r2-1b', false);
  tabTen.status('r2-1b', false);
  await flushMicrotasks();
  clock.advance(80);
  await flushMicrotasks();
  clock.advance(170);
  await flushMicrotasks();

  assert.equal(itemsOf(tabTen.store).length, 1, '"10" 字典序小于 "9"，应胜出');
  assert.equal(itemsOf(tabNine.store).length, 0);
  leaseNine.dispose();
  leaseTen.dispose();
});

test('R2-T2 无 BroadcastChannel 恒胜出（单标签语义）', async () => {
  const clock = createClock();
  const lease = createLease(clock, null, 'solo');
  assert.equal(lease.hasChannel(), false);
  const harness = createHarness({
    clock,
    list: { phase: 'ready', ids: ['r2-2'], byId: { 'r2-2': { running: true } } },
    claim: lease.claim,
    resetClaims: lease.reset,
  });

  harness.status('r2-2', true);
  clock.advance(2000);
  harness.status('r2-2', false);
  await flushMicrotasks();
  clock.advance(250);

  assert.equal(itemsOf(harness.store).length, 1);
  lease.dispose();
});

test('R2-T3 decide 时 claim 仍在途：按胜出降级，记录诊断且不抛错', async () => {
  const clock = createClock();
  const diagnostics = [];
  const harness = createHarness({
    clock,
    list: { phase: 'ready', ids: ['r2-3'], byId: { 'r2-3': { running: true } } },
    claim: () => new Promise(() => {}),
    onDiagnostic: (code, id) => diagnostics.push({ code, id }),
  });

  harness.status('r2-3', true);
  clock.advance(2000);
  harness.status('r2-3', false);
  assert.doesNotThrow(() => clock.advance(250));

  assert.equal(itemsOf(harness.store).length, 1, '仍在途时按胜出处理');
  assert.deepEqual(diagnostics, [{ code: 'claim-pending-at-decide', id: 'r2-3' }]);
});

test('R2-T4 认领频道/消息形状、reset 清计时器并关闭通道、重置后可复用', async () => {
  const clock = createClock();
  const bus = createBroadcastBus();
  const lease = createLease(clock, bus, 'tab-1');

  assert.equal(lease.hasChannel(), true);
  const pending = lease.claim('r2-4');
  assert.equal(clock.pending(), 1, '认领窗计时器应挂起');
  assert.equal(bus.openCount(), 1);
  assert.equal(bus.names[0], 'dsh-task-complete-toast/v1');
  const message = bus.messages[0].data;
  assert.equal(message.v, 1);
  assert.equal(message.type, 'claim');
  assert.equal(message.sessionId, 'r2-4');
  assert.equal(message.tabId, 'tab-1');
  assert.equal(message.at, 0);

  lease.reset();
  assert.equal(clock.pending(), 0, 'reset 必须清掉在途认领计时器');
  assert.equal(bus.openCount(), 0, 'reset 必须关闭频道');
  assert.equal(await pending, false, 'reset 后迟到的结果按失败返回');

  const again = lease.claim('r2-5');
  assert.equal(bus.openCount(), 1, 'reset 后下一次认领应重新打开频道');
  clock.advance(80);
  assert.equal(await again, true);
  assert.equal(clock.pending(), 0);

  lease.dispose();
  assert.equal(bus.openCount(), 0, 'dispose 必须关闭频道');
});

test('R2-T5 输家不更新冷却与发射计数：紧接着的胜出仍应立即入队', async () => {
  const clock = createClock();
  let calls = 0;
  const harness = createHarness({
    clock,
    list: { phase: 'ready', ids: ['r2-5'], byId: { 'r2-5': { running: true } } },
    claim: () => Promise.resolve(calls++ > 0), // 第一次输，第二次赢
  });

  harness.status('r2-5', true);
  clock.advance(2000);
  harness.status('r2-5', false);
  await flushMicrotasks();
  clock.advance(250);
  assert.deepEqual(itemsOf(harness.store), [], '输家不得入队');

  harness.status('r2-5', true);
  clock.advance(2000);
  harness.status('r2-5', false);
  await flushMicrotasks();
  clock.advance(250);

  const items = itemsOf(harness.store);
  assert.equal(items.length, 1, '默认 cooldownMs=3000：若输家更新过冷却，这里会被抑制');
  assert.equal(items[0].at, 4500);
});

test('R2-T6 connection/reset 后迟到 claim 不写状态、不入队', async () => {
  const clock = createClock();
  let resolveClaim;
  const harness = createHarness({
    clock,
    list: { phase: 'ready', ids: ['r2-6'], byId: { 'r2-6': { running: true } } },
    claim: () => new Promise((resolve) => {
      resolveClaim = resolve;
    }),
  });

  harness.status('r2-6', true);
  clock.advance(2000);
  harness.status('r2-6', false);
  clock.advance(100);
  assert.equal(typeof resolveClaim, 'function');

  harness.store.reset();
  resolveClaim(true); // 迟到的胜出结果
  await flushMicrotasks();
  clock.advance(500);

  assert.deepEqual(itemsOf(harness.store), [], 'reset 后迟到结果必须被 state/generation 守卫丢弃');
  assert.equal(clock.pending(), 0);
});

test('R2-T7 store.reset 关闭认领通道；重置后再次完成仍可胜出', async () => {
  const clock = createClock();
  const bus = createBroadcastBus();
  const lease = createLease(clock, bus, 'tab-7');
  const list = { phase: 'ready', ids: ['r2-7'], byId: { 'r2-7': { running: true } } };
  const harness = createHarness({
    clock,
    list,
    claim: lease.claim,
    resetClaims: lease.reset,
  });

  harness.status('r2-7', true);
  clock.advance(2000);
  harness.status('r2-7', false);
  assert.equal(bus.openCount(), 1);

  harness.store.reset();
  assert.equal(bus.openCount(), 0, 'connection/reset 必须关闭认领通道');
  assert.equal(clock.pending(), 0, '在途认领计时器必须被清理');
  clock.advance(250);
  assert.deepEqual(itemsOf(harness.store), []);

  // 重置后租约仍可复用：重新打开频道、重新认领并胜出。
  harness.status('r2-7', true);
  clock.advance(2000);
  harness.status('r2-7', false);
  await flushMicrotasks();
  assert.equal(bus.openCount(), 1);
  clock.advance(80);
  await flushMicrotasks();
  clock.advance(170);
  await flushMicrotasks();
  assert.equal(itemsOf(harness.store).length, 1);
  lease.dispose();
});

test('R1b-D1-7 后台 pending resolution：等待完成再入队，error 不降级为 completed', async () => {
  const clock = createClock();
  let resolveRun;
  const harness = createHarness({
    clock,
    list: { phase: 'ready', ids: ['r1b-7'], byId: { 'r1b-7': { running: true } } },
    isForeground: false,
    resolve: () => new Promise((resolve) => {
      resolveRun = resolve;
    }),
  });

  harness.status('r1b-7', true);
  clock.advance(2000);
  harness.status('r1b-7', false);
  await flushMicrotasks();

  assert.deepEqual(itemsOf(harness.store), [], 'resolution 未完成时不得按 completed 兜底入队');
  assert.equal(clock.pending(), 0, '后台路径不应依赖 250ms timer');

  resolveRun({ outcome: 'error' });
  await flushMicrotasks();

  const items = itemsOf(harness.store);
  assert.equal(items.length, 1);
  assert.equal(items[0].outcome, 'error', '完成后必须保留 error，不能倒退成 completed');
});
