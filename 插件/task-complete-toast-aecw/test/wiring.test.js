/**
 * WP6a 接线单测（W01–W09）。
 *
 * 覆盖：注入配置合并、locale 字典注册与语言切换、真实 env 装配、
 * settling 起点并发解析、ignored/suppressed 丢弃、错误/超时降级、
 * 回弹 abort、connection/reset 与卸载清理。
 *
 * 假 ctx 来自 harness.createFakeCtx；假 window 只提供计时器/注入行/fetch。
 * 不渲染真实 React，不连接真实 DSH 服务。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeCtx, createFakeUiSession, loadClientModule, slotChildProps } from './harness.js';

/** §7.7 + G4 的键集合，顺序无关，便于集合比较。 */
const LOCALE_KEYS = [
  'titleCompleted',
  'titleError',
  'titleStopped',
  'titleInterrupted',
  'titleBlocked',
  'titleAwaitingApproval',
  'titleAwaitingAnswer',
  'titleAwaitingConfirmation',
  'statusIdle',
  'statusRunning',
  'statusAwaitingAnswer',
  'statusAwaitingApproval',
  'statusAwaitingConfirmation',
  'fallbackWorkspace',
  'fallbackSession',
  'actionView',
  'actionClose',
  'format',
  'settingsTabLabel',
  'settingsTitle',
  'settingsIntro',
  'settingsFont',
  'settingsFontValue',
  'settingsFontSize',
  'settingsCardWidth',
  'settingsBackground',
  'settingsTextColor',
  'settingsAuto',
  'settingsMinWidth',
  'settingsPreview',
  'settingsSampleTitle',
  'settingsSampleLine',
  'settingsReset',
  'settingsSave',
  'settingsSaving',
  'settingsSaved',
  'settingsSaveFailed',
  'settingsContrast',
  'settingsInvalidColor',
  'settingsPx',
  'settingsColorsHint',
  'settingsUnavailable',
  'settingsFontHint',
  'settingsDiag',
  'settingsDiagAwaitingOn',
  'settingsDiagAwaitingOff',
  'settingsDiagSourceReady',
  'settingsDiagSourceMissing',
  'settingsDiagPending',
  'settingsError',
];

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

async function flushMicrotasks(times = 20) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

/** 会话列表快照：给定 id 都有 byId 行，否则 decide 会按 §8.3 规则 2 抑制。 */
function readyList(ids) {
  const byId = {};
  for (const id of ids) byId[id] = { id };
  return { phase: 'ready', ids, byId };
}

function turnEnd(reason) {
  return { type: 'event', event: { type: 'turn/end', data: { reason }, time: Date.now() } };
}

/** 注入行：默认关闭 minRunMs/cooldownMs，避免测试依赖真实墙钟。 */
function testInjection(extra = {}) {
  return { minRunMs: 0, cooldownMs: 0, ...extra };
}

/**
 * apply 级夹具：假 window（计时器/注入行/fetch）+ 扩展假 ctx。
 * `minRunMs`/`cooldownMs` 默认 0，因为真实 env 的 now 是 Date.now，不能由假时钟推进。
 */
function createApplyHarness(options = {}) {
  const clock = options.clock ?? createClock();
  const fetchCalls = [];
  const windowObject = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    __DSH_TASK_COMPLETE_TOAST__: testInjection(options.injection),
  };
  const windowListeners = new Map();
  windowObject.addEventListener = (name, listener) => {
    const list = windowListeners.get(name) ?? [];
    list.push(listener);
    windowListeners.set(name, list);
  };
  windowObject.removeEventListener = (name, listener) => {
    const list = windowListeners.get(name) ?? [];
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  };
  if (options.document !== undefined) windowObject.document = options.document;
  if (options.Notification !== undefined) windowObject.Notification = options.Notification;
  if (typeof options.fetch === 'function') {
    windowObject.fetch = (url, init) => {
      fetchCalls.push({ url, init });
      return options.fetch(url, init);
    };
  }

  const { factory } = loadClientModule({ window: windowObject });
  const fake = createFakeCtx({
    list: options.list ?? readyList(options.sessionIds ?? []),
    binding: options.binding ?? (() => undefined),
    uiSession: options.uiSession,
  });
  factory.apply(fake.ctx);

  const [registration] = fake.registrations;
  const element = registration.component({});
  const toastProps = slotChildProps(element);
  const store = toastProps.store;
  const config = toastProps.config;

  return {
    ...fake,
    factory,
    store,
    config,
    toastProps,
    clock,
    fetchCalls,
    element,
    emitWindow(name, ...args) {
      for (const listener of [...(windowListeners.get(name) ?? [])]) listener(...args);
    },
    status(id, running) {
      fake.emitRemote('api-session/status', id, running);
    },
  };
}

/** store 级夹具：env.resolve 由用例显式提供，now 走假时钟。 */
function createStoreHarness(options = {}) {
  const clock = createClock();
  let statusHandler = null;
  const env = {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    list: options.list ?? readyList(['s']),
    onStatus(handler) {
      statusHandler = handler;
      return () => {
        if (statusHandler === handler) statusHandler = null;
      };
    },
    getBinding: options.binding ?? (() => undefined),
  };
  if (typeof options.resolve === 'function') env.resolve = options.resolve;

  const { factory } = loadClientModule();
  const store = factory.__test__.createStore(env, options.config);
  const dispose = store.start();

  return {
    store,
    clock,
    env,
    dispose,
    status(id, running) {
      assert.equal(typeof statusHandler, 'function', 'store.start 应订阅 onStatus');
      statusHandler(id, running);
    },
  };
}

/** 让会话真实运行 2s 后结束，再走完 250ms 观察窗。 */
function completeRun(harness, clock, id) {
  harness.status(id, true);
  clock.advance(2000);
  harness.status(id, false);
}

test('W01 注入配置覆盖 DEFAULTS（maxVisible:1 生效，坏类型被忽略）', async () => {
  const harness = createApplyHarness({
    sessionIds: ['s-1', 's-2'],
    injection: {
      maxVisible: 1,
      durationMs: '5000',
      position: 'top',
      theme: 'neon',
      size: 'huge',
      bridge: 'maybe',
      showTitle: false,
    },
    binding: () => ({ eventSource: { getSnapshot: () => ({ entries: [turnEnd({ kind: 'completed' })] }) } }),
  });

  assert.equal(harness.config.maxVisible, 1, '合法字段应覆盖 DEFAULTS');
  assert.equal(harness.config.durationMs, 5000, '类型不符的 durationMs 应忽略');
  assert.equal(harness.config.position, 'bottom-right', '非法枚举应忽略');
  assert.equal(harness.config.theme, 'system', '非法 theme 应忽略');
  assert.equal(harness.config.size, 'standard', '非法 size 应忽略');
  assert.equal(harness.config.bridge, 'auto', '非法枚举应忽略');
  assert.equal(harness.config.showTitle, false, '其他合法客户端字段仍可覆盖');

  completeRun(harness, harness.clock, 's-1');
  await flushMicrotasks();
  harness.clock.advance(250);
  completeRun(harness, harness.clock, 's-2');
  await flushMicrotasks();
  harness.clock.advance(250);

  assert.equal(harness.store.get().length, 1, 'maxVisible:1 应只保留一条');
});

test('W02 zh/en 字典都注册，键集合与 §7.7 一致，语言切换即时生效', () => {
  const harness = createApplyHarness();
  const records = harness.localeRegistrations.filter((record) => record.ns === 'taskCompleteToast');

  assert.equal(records.length, 2, '应注册 zh/en 两套字典');
  assert.deepEqual(records.map((record) => record.locale).sort(), ['en', 'zh']);

  for (const record of records) {
    assert.deepEqual(
      Object.keys(record.dict).sort(),
      [...LOCALE_KEYS].sort(),
      `${record.locale} 字典键集合必须与 §7.7 一致`,
    );
  }

  const t = harness.toastProps.t;
  assert.equal(t('titleCompleted'), '任务完成');
  assert.equal(t('actionClose'), '关闭提示');
  assert.equal(t('format'), '{workspace}[{session}] · {status}');

  harness.setLocale('en');
  assert.equal(t('titleCompleted'), 'Task completed');
  assert.equal(t('actionClose'), 'Dismiss');
  assert.equal(t('fallbackSession'), 'Untitled session');
});

test('W03 status(false) 在 settling 起点触发一次真实 resolver 请求', async () => {
  const clock = createClock();
  const harness = createApplyHarness({
    clock,
    sessionIds: ['s-3'],
    binding: () => undefined,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sessionId: 's-3', outcome: 'error', at: Date.now() }),
    }),
  });

  harness.status('s-3', true);
  clock.advance(2000);
  harness.status('s-3', false);

  assert.equal(clock.now(), 2000, 'status(false) 当下不应推进观察窗');
  assert.equal(harness.fetchCalls.length, 0, 'resolver 通过微任务发起请求');
  await flushMicrotasks();
  assert.equal(harness.fetchCalls.length, 1, 'settling 起点应已发起一次解析');
  assert.equal(harness.fetchCalls[0].url, '/dsh-task-complete/outcome?sessionId=s-3');
  assert.equal(clock.now(), 2000, '解析与 250ms 观察窗并行，不推进时钟');

  clock.advance(250);
  assert.equal(harness.store.get().length, 1);
  assert.equal(harness.store.get()[0].outcome, 'error');
});

test('W04 aborted/user（suppressed）→ 不入队', async () => {
  const harness = createApplyHarness({
    sessionIds: ['s-4'],
    binding: () => ({
      eventSource: {
        getSnapshot: () => ({ entries: [turnEnd({ kind: 'aborted', reason: { kind: 'user' } })] }),
      },
    }),
  });

  completeRun(harness, harness.clock, 's-4');
  await flushMicrotasks();
  harness.clock.advance(250);

  assert.equal(harness.store.get().length, 0, 'suppressed 结果不应入队');
  assert.equal(harness.clock.pending(), 0);
});

test('W05 error → 入队且 Item.outcome=error', async () => {
  const harness = createStoreHarness({
    list: readyList(['s-5']),
    resolve: async () => ({ outcome: 'error', source: 'route' }),
  });

  completeRun(harness, harness.clock, 's-5');
  await flushMicrotasks();
  harness.clock.advance(250);

  const items = harness.store.get();
  assert.equal(items.length, 1);
  assert.equal(items[0].outcome, 'error');
  assert.equal(items[0].sessionId, 's-5');
});

test('W06 resolve 失败或超时 → 入队 completed', async (t) => {
  await t.test('reject', async () => {
    const harness = createStoreHarness({
      list: readyList(['s-6']),
      resolve: () => Promise.reject(new Error('network down')),
    });
    completeRun(harness, harness.clock, 's-6');
    await flushMicrotasks();
    harness.clock.advance(250);
    assert.equal(harness.store.get().length, 1);
    assert.equal(harness.store.get()[0].outcome, 'completed');
  });

  await t.test('超过观察窗仍未返回', async () => {
    let signal = null;
    const harness = createStoreHarness({
      list: readyList(['s-6']),
      resolve: (_id, nextSignal) => {
        signal = nextSignal;
        return new Promise(() => {});
      },
    });
    completeRun(harness, harness.clock, 's-6');
    harness.clock.advance(250);
    assert.equal(harness.store.get().length, 1, '仍在途时应按 v1 降级入队');
    assert.equal(harness.store.get()[0].outcome, 'completed');
    assert.equal(signal.aborted, true, '降级后应取消在途解析');
    assert.equal(harness.clock.pending(), 0);
  });
});

test('W07 观察窗内回弹 → abort 在途 resolve 且不入队', () => {
  let signal = null;
  let aborted = false;
  const harness = createStoreHarness({
    list: readyList(['s-7']),
    resolve: (_id, nextSignal) => {
      signal = nextSignal;
      signal.addEventListener('abort', () => {
        aborted = true;
      }, { once: true });
      return new Promise(() => {});
    },
  });

  harness.status('s-7', true);
  harness.clock.advance(2000);
  harness.status('s-7', false);
  harness.clock.advance(100);

  assert.equal(aborted, false, '观察窗未回弹时不应 abort');
  harness.status('s-7', true);

  assert.equal(aborted, true, '回弹 running 必须 abort 在途解析');
  assert.equal(harness.clock.pending(), 0, '回弹后 settle 计时器应清空');

  harness.clock.advance(500);
  assert.equal(harness.store.get().length, 0, '回弹后不得入队');
});

test('W08 connection/reset → store.reset 清空队列', async () => {
  const harness = createApplyHarness({
    sessionIds: ['s-8'],
    binding: () => ({ eventSource: { getSnapshot: () => ({ entries: [turnEnd({ kind: 'completed' })] }) } }),
  });

  completeRun(harness, harness.clock, 's-8');
  await flushMicrotasks();
  harness.clock.advance(250);
  assert.equal(harness.store.get().length, 1);

  harness.emit('connection/reset');

  assert.equal(harness.store.get().length, 0, 'connection/reset 应清空队列');
  assert.equal(harness.clock.pending(), 0, 'connection/reset 应清空计时器');
});

test('W09 卸载 → 在途 resolve 被 abort、计时器清空', async () => {
  let fetchSignal = null;
  const harness = createApplyHarness({
    sessionIds: ['s-9'],
    binding: () => undefined,
    fetch: (_url, init) => {
      fetchSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
      });
    },
  });

  harness.status('s-9', true);
  harness.clock.advance(2000);
  harness.status('s-9', false);
  await flushMicrotasks();

  assert.ok(fetchSignal !== null, '慢路径应已发出请求');
  assert.equal(fetchSignal.aborted, false);

  harness.disposeAll();

  assert.equal(fetchSignal.aborted, true, '卸载必须 abort 在途请求');
  await flushMicrotasks();
  assert.equal(harness.clock.pending(), 0, '卸载后不得留下计时器');
  assert.equal(harness.store.get().length, 0, '卸载不得留下队列条目');
});

test('W10 G2：uiSession.sessionStatus 的 pendingInteraction 进入常驻提醒并在解决后移除', () => {
  const uiSession = createFakeUiSession();
  const harness = createApplyHarness({
    sessionIds: ['s-10'],
    uiSession,
    binding: () => undefined,
  });

  assert.equal(harness.toastProps.notices.get().length, 0, '初始无 pending 时为空');

  uiSession.set(new Map([
    ['s-10', { running: true, pendingInteraction: { key: 'approval:1', kind: 'approval' } }],
  ]));
  const active = harness.toastProps.notices.get();
  assert.equal(active.length, 1);
  assert.equal(active[0].sessionId, 's-10');
  assert.equal(active[0].kind, 'approval');
  assert.equal(active[0].key, 'notice:approval:1');

  // 同一 pending 重复发布不得重复入队。
  uiSession.set(new Map([
    ['s-10', { running: true, pendingInteraction: { key: 'approval:1', kind: 'approval' } }],
  ]));
  assert.equal(harness.toastProps.notices.get().length, 1, '同一 pending key 只提醒一次');

  uiSession.set(new Map());
  assert.equal(harness.toastProps.notices.get().length, 0, 'pending 解决后提醒移除');

  harness.disposeAll();
  assert.equal(uiSession.listenerCount(), 0, '卸载必须取消 sessionStatus 订阅');
});

test('W11 G2：未知 kind 与缺 key 的 pending 不提醒', () => {
  const uiSession = createFakeUiSession(new Map([
    ['s-11a', { pendingInteraction: { key: 'unknown:1', kind: 'mystery' } }],
    ['s-11b', { pendingInteraction: { kind: 'approval' } }],
    ['s-11c', { pendingInteraction: null }],
  ]));
  const harness = createApplyHarness({ sessionIds: ['s-11a', 's-11b', 's-11c'], uiSession });

  assert.equal(harness.toastProps.notices.get().length, 0, '形状不符不得猜');
});

test('W12 G3：合法外观字段覆盖 DEFAULTS，duration 越界被忽略', () => {
  const harness = createApplyHarness({
    injection: {
      position: 'top-left',
      theme: 'dark',
      size: 'compact',
      durationMs: 12000,
      showTitle: false,
    },
  });

  assert.equal(harness.config.position, 'top-left');
  assert.equal(harness.config.theme, 'dark');
  assert.equal(harness.config.size, 'compact');
  assert.equal(harness.config.durationMs, 12000);
  assert.equal(harness.config.showTitle, false);

  const invalid = createApplyHarness({ injection: { durationMs: 1999 } });
  assert.equal(invalid.config.durationMs, 5000, '低于 2000 ms 应回落默认');
  const invalidHigh = createApplyHarness({ injection: { durationMs: 15001 } });
  assert.equal(invalidHigh.config.durationMs, 5000, '高于 15000 ms 应回落默认');
});

test('W13 notify.awaiting:false → 不订阅 pendingInteraction、不产生提醒', () => {
  const uiSession = createFakeUiSession(new Map([
    ['s-13', { pendingInteraction: { key: 'approval:13', kind: 'approval' } }],
  ]));
  const harness = createApplyHarness({
    sessionIds: ['s-13'],
    uiSession,
    injection: { awaiting: false },
  });

  assert.equal(harness.config.awaiting, false);
  assert.equal(harness.toastProps.notices.get().length, 0, '关闭后不得显示提醒');
  assert.equal(uiSession.listenerCount(), 0, '关闭后不得订阅 sessionStatus');
});

test('W14 进入会话（mainView>0）→ 收起 G2 提醒', () => {
  const uiSession = createFakeUiSession(new Map([
    ['s-14', { pendingInteraction: { key: 'approval:14', kind: 'approval' } }],
  ]));
  const harness = createApplyHarness({ sessionIds: ['s-14'], uiSession });
  assert.equal(harness.toastProps.notices.get().length, 1, '未进入时应显示');

  harness.setList({
    phase: 'ready',
    ids: ['s-14'],
    byId: { 's-14': { id: 's-14', retainedBy: { mainView: 1 } } },
  });
  assert.equal(harness.toastProps.notices.get().length, 0, '进入会话后应收起');
});

test('W15 已在会话内出现 pending → 不显示卡片（hidden 保留给通知生命周期）', () => {
  const uiSession = createFakeUiSession(new Map([
    ['s-15', { pendingInteraction: { key: 'question:15', kind: 'question' } }],
  ]));
  const harness = createApplyHarness({
    list: {
      phase: 'ready',
      ids: ['s-15'],
      byId: { 's-15': { id: 's-15', retainedBy: { mainView: 1 } } },
    },
    sessionIds: ['s-15'],
    uiSession,
  });

  const notices = harness.toastProps.notices.get();
  assert.equal(notices.length, 1, 'hidden 条目保留，用于 pending 解决时关闭系统通知');
  assert.equal(notices[0].hidden, true, '已进入会话时卡片必须隐藏');
  assert.equal(notices.filter((item) => item.hidden !== true).length, 0, '不得渲染遮挡卡片');
});

test('W16 已进入会话但页面被遮挡 → 仍发系统通知', async () => {
  const instances = [];
  class FakeNotification {
    static permission = 'granted';

    constructor(title, options) {
      this.title = title;
      this.options = options;
      instances.push(this);
    }

    close() {}
  }

  const uiSession = createFakeUiSession(new Map([
    ['s-16', { pendingInteraction: { key: 'approval:16', kind: 'approval' } }],
  ]));
  createApplyHarness({
    list: {
      phase: 'ready',
      ids: ['s-16'],
      byId: { 's-16': { id: 's-16', retainedBy: { mainView: 1 } } },
    },
    sessionIds: ['s-16'],
    uiSession,
    document: {
      hidden: true,
      visibilityState: 'hidden',
      hasFocus: () => false,
    },
    Notification: FakeNotification,
  });

  await flushMicrotasks();
  assert.equal(instances.length, 1, '遮挡 + 已在会话内时应发一条系统通知');
  assert.equal(instances[0].title, '需要授权');
});

test('W17 授权先可见、随后窗口失焦 → 补发系统通知且不重复', async () => {
  const instances = [];
  class FakeNotification {
    static permission = 'granted';

    constructor(title, options) {
      this.title = title;
      this.options = options;
      instances.push(this);
    }

    close() {}
  }

  const doc = {
    hidden: false,
    visibilityState: 'visible',
    hasFocus: () => true,
    addEventListener() {},
    removeEventListener() {},
  };
  const uiSession = createFakeUiSession(new Map([
    ['s-17', { pendingInteraction: { key: 'approval:17', kind: 'approval' } }],
  ]));
  const harness = createApplyHarness({
    list: {
      phase: 'ready',
      ids: ['s-17'],
      byId: { 's-17': { id: 's-17', retainedBy: { mainView: 1 } } },
    },
    sessionIds: ['s-17'],
    uiSession,
    document: doc,
    Notification: FakeNotification,
  });

  await flushMicrotasks();
  assert.equal(instances.length, 0, '页面可见时不发系统通知');

  harness.emitWindow('blur');
  await flushMicrotasks();
  assert.equal(instances.length, 1, '失焦/遮挡后应补发一条');

  harness.emitWindow('blur');
  await flushMicrotasks();
  assert.equal(instances.length, 1, '同一条 pending 不得重复发');
});
