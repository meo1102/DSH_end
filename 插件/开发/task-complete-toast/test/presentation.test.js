/**
 * WP6b 呈现与通知接线单测（P01–P09）。
 *
 * 覆盖：通知与浮层文案同源、可见性、suppressWhenFocused、D1 default 权限、
 * D4 deferred 回浮层重计时、F6 点击回跳、enabled:false、名称/状态行、D3 issued 清理。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeCtx, loadClientModule, renderSlotElement, slotChildProps } from './harness.js';

const { factory } = loadClientModule();
const { createNotifier, createStore } = factory.__test__;

const ITEM = {
  key: 'k-1',
  sessionId: 's-1',
  title: '任务完成',
  line: '插件[Toast] · 待执行',
  outcome: 'completed',
};

class FakeNotification {
  static permission = 'granted';
  static requestCount = 0;
  static instances = [];

  static reset(permission = 'granted') {
    FakeNotification.permission = permission;
    FakeNotification.requestCount = 0;
    FakeNotification.instances = [];
  }

  static async requestPermission() {
    FakeNotification.requestCount += 1;
    FakeNotification.permission = 'granted';
    return 'granted';
  }

  constructor(title, options) {
    this.title = title;
    this.options = options;
    this.closed = false;
    this.onclick = null;
    this.onclose = null;
    FakeNotification.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

class ThrowingNotification {
  static permission = 'default';
  static requestCount = 0;

  constructor() {
    throw new Error('construct failed');
  }
}

/** 假 document：可切换可见/聚焦并派发监听。 */
function createDocument({ visible = true, focused = true } = {}) {
  const listeners = new Map();
  const document = {
    visibilityState: visible ? 'visible' : 'hidden',
    hidden: !visible,
    hasFocus: () => focused,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const current = listeners.get(type) ?? [];
      const index = current.indexOf(handler);
      if (index >= 0) current.splice(index, 1);
    },
    dispatch(type) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
    setVisible(next) {
      document.visibilityState = next ? 'visible' : 'hidden';
      document.hidden = !next;
    },
    setFocused(next) {
      document.hasFocus = () => next;
    },
  };
  return document;
}

/** 假时钟。 */
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

function readyList(ids) {
  const byId = {};
  for (const id of ids) byId[id] = { id };
  return { phase: 'ready', ids, byId };
}

function turnEnd(reason) {
  return { type: 'event', event: { type: 'turn/end', data: { reason } } };
}

function completedBinding() {
  return { eventSource: { getSnapshot: () => ({ entries: [turnEnd({ kind: 'completed' })] }) } };
}

/**
 * apply 级夹具：假 window（计时器/document/Notification/navigator）+ 扩展假 ctx。
 * `minRunMs`/`cooldownMs` 默认 0，因为真实 env 的 now 是 Date.now，假时钟推不动墙钟。
 */
function createApplyHarness(options = {}) {
  const clock = options.clock ?? createClock();
  const document = options.document ?? createDocument();
  const windowObject = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    document,
    Notification: options.Notification ?? FakeNotification,
    navigator: options.navigator ?? { userActivation: { isActive: false } },
    __DSH_TASK_COMPLETE_TOAST__: {
      minRunMs: 0,
      cooldownMs: 0,
      ...(options.injection ?? {}),
    },
  };
  if (typeof options.fetch === 'function') windowObject.fetch = options.fetch;

  const { factory: clientFactory } = loadClientModule({ window: windowObject });
  const fake = createFakeCtx({
    list: options.list ?? readyList(options.sessionIds ?? []),
    binding: options.binding ?? (() => undefined),
    slotProps: options.slotProps,
  });
  clientFactory.apply(fake.ctx);

  const registration = fake.registrations[0];
  const componentProps = { ...(fake.slotProps ?? {}) };
  if (options.timers !== undefined) componentProps.timers = options.timers;
  const element = registration === undefined ? undefined : registration.component(componentProps);
  const toastProps = element === undefined ? {} : slotChildProps(element);

  return {
    ...fake,
    factory: clientFactory,
    document,
    clock,
    element,
    toastProps,
    store: toastProps.store,
    config: toastProps.config,
    status(id, running) {
      fake.emitRemote('api-session/status', id, running);
    },
    render() {
      assert.ok(element !== undefined, '未注册 overlay');
      return renderSlotElement(element);
    },
  };
}

/** store 级夹具（P05 用假时钟验证 requeue 的 at）。 */
function createStoreHarness(options = {}) {
  const clock = createClock();
  let statusHandler = null;
  const env = {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    list: options.list ?? readyList(['s-5']),
    onStatus(handler) {
      statusHandler = handler;
      return () => {
        if (statusHandler === handler) statusHandler = null;
      };
    },
    getBinding: options.binding ?? (() => undefined),
    resolve: async () => ({ outcome: 'completed', source: 'binding' }),
  };
  const store = createStore(env, options.config);
  store.start();
  return {
    store,
    clock,
    status(id, running) {
      statusHandler(id, running);
    },
  };
}

function completeRun(harness, id) {
  harness.status(id, true);
  harness.clock.advance(2000);
  harness.status(id, false);
}

/** 从 ToastHost 树取卡片数组。 */
function cardsOf(tree) {
  return tree.props.children[1].props.children[0];
}

/** 执行卡片组件，拿到 root div 树。 */
function cardTreeOf(card) {
  const cardElement = card.props.children[0];
  return cardElement.type(cardElement.props);
}

/** 卡片明细行文本。 */
function lineOf(cardTree) {
  return cardTree.props.children[1].props.children[1].props.children[0];
}

/** 卡片标题文本。 */
function titleOfCard(cardTree) {
  return cardTree.props.children[1].props.children[0].props.children[0];
}

test('P01 隐藏时入队：notifier 被调用，正文与浮层第二行逐字一致', async () => {
  FakeNotification.reset('granted');
  const document = createDocument({ visible: false, focused: false });
  const harness = createApplyHarness({
    document,
    sessionIds: ['s-1'],
    binding: completedBinding,
  });

  completeRun(harness, 's-1');
  await flushMicrotasks();
  harness.clock.advance(250);
  assert.equal(harness.store.get().length, 1);

  const tree = harness.render();
  const card = cardTreeOf(cardsOf(tree)[0]);
  const line = lineOf(card);

  assert.equal(FakeNotification.instances.length, 1, '隐藏时应在渲染后触发通知');
  const notification = FakeNotification.instances[0];
  assert.equal(notification.options.body, line, '通知正文必须与浮层第二行一致');
  assert.equal(notification.title, titleOfCard(card), '标题也必须同源');
  assert.equal(notification.options.tag, 'dsh-task-s-1');
});

test('P02 可见时入队：不发送系统通知', async () => {
  FakeNotification.reset('granted');
  const document = createDocument({ visible: true, focused: true });
  const harness = createApplyHarness({ document, sessionIds: ['s-2'], binding: completedBinding });

  completeRun(harness, 's-2');
  await flushMicrotasks();
  harness.clock.advance(250);
  harness.render();

  assert.equal(harness.store.get().length, 1, '浮层条目仍应在队');
  assert.equal(FakeNotification.instances.length, 0, 'auto + 可见不得发系统通知');
});

test('P03 suppressWhenFocused:true 且聚焦 → 不入队、不通知', async () => {
  FakeNotification.reset('granted');
  const document = createDocument({ visible: true, focused: true });
  const harness = createApplyHarness({
    document,
    sessionIds: ['s-3'],
    binding: completedBinding,
    injection: { suppressWhenFocused: true },
  });

  completeRun(harness, 's-3');
  await flushMicrotasks();
  harness.clock.advance(250);
  harness.render();

  assert.equal(harness.store.get().length, 0, '聚焦抑制必须在入队前生效');
  assert.equal(FakeNotification.instances.length, 0);
});

test('P04 D1：default 权限仍尝试构造；构造抛错才 deferred；可见+手势再申请权限', async (t) => {
  await t.test('default + 无手势：构造被调用，不申请权限', async () => {
    FakeNotification.reset('default');
    const document = createDocument({ visible: false, focused: false });
    const notifier = createNotifier({
      document,
      Notification: FakeNotification,
      window: { focus() {} },
      hasUserActivation: () => false,
    }, (key) => key, { systemNotification: 'auto' });

    assert.equal(await notifier.notify(ITEM), 'delivered');
    assert.equal(FakeNotification.instances.length, 1, 'default 也必须尝试发送');
    assert.equal(FakeNotification.requestCount, 0);
    notifier.dispose();
  });

  await t.test('default + 构造抛错：deferred', async () => {
    FakeNotification.reset('default');
    const document = createDocument({ visible: false, focused: false });
    const notifier = createNotifier({
      document,
      Notification: ThrowingNotification,
      window: { focus() {} },
      hasUserActivation: () => false,
    }, (key) => key, { systemNotification: 'auto' });

    assert.equal(await notifier.notify(ITEM), 'deferred');
    assert.equal(FakeNotification.instances.length, 0);
    notifier.dispose();
  });

  await t.test('default + 可见 + 手势：发送后申请权限（升级路径）', async () => {
    FakeNotification.reset('default');
    const document = createDocument({ visible: true, focused: true });
    const notifier = createNotifier({
      document,
      Notification: FakeNotification,
      window: { focus() {} },
      hasUserActivation: () => true,
    }, (key) => key, { systemNotification: 'always' });

    assert.equal(await notifier.notify(ITEM), 'delivered');
    assert.equal(FakeNotification.instances.length, 1);
    assert.equal(FakeNotification.requestCount, 1, '可见+手势是升级路径，应在发送后申请');
    notifier.dispose();
  });
});

test('P05 D4：deferred 恢复可见 → 浮层条目重新入队且 at 刷新', async () => {
  FakeNotification.reset('denied');
  const harness = createStoreHarness({ list: readyList(['s-5']), binding: completedBinding });
  const document = createDocument({ visible: false, focused: false });

  completeRun(harness, 's-5');
  await flushMicrotasks();
  harness.clock.advance(250);

  const before = harness.store.get()[0];
  assert.ok(before !== undefined);

  const notifier = createNotifier({
    document,
    Notification: FakeNotification,
    window: { focus() {} },
    hasUserActivation: () => false,
    requeue: (item) => harness.store.requeue(item),
  }, (key) => key, { systemNotification: 'always' });

  document.setVisible(false);
  document.setFocused(false);
  assert.equal(await notifier.notify(before), 'deferred');

  harness.clock.advance(1000);
  document.setVisible(true);
  document.setFocused(true);
  await notifier.onVisible();

  const after = harness.store.get();
  assert.equal(after.length, 1, '补弹后浮层应重新出现');
  assert.notEqual(after[0].key, before.key, '新 key 让卡片重新挂载、计时器重开');
  assert.equal(after[0].at, harness.clock.now(), 'at 应刷新到补弹时刻');
  assert.ok(after[0].at > before.at);
  notifier.dispose();
});

test('P06 F6：点击卡片回跳并 dismiss；关闭按钮不触发回跳', async () => {
  FakeNotification.reset('granted');
  const document = createDocument({ visible: true, focused: true });
  const harness = createApplyHarness({ document, sessionIds: ['s-6'], binding: completedBinding });

  completeRun(harness, 's-6');
  await flushMicrotasks();
  harness.clock.advance(250);

  const tree = harness.render();
  const card = cardTreeOf(cardsOf(tree)[0]);
  card.props.onClick();

  assert.deepEqual(harness.ctx.uiWorkspace.opened, ['s-6'], '点击卡片应打开会话');
  assert.equal(harness.store.get().length, 0, '点击卡片应立即 dismiss');

  completeRun(harness, 's-6');
  await flushMicrotasks();
  harness.clock.advance(250);
  const second = cardTreeOf(cardsOf(harness.render())[0]);
  const close = second.props.children[2];
  let stopped = 0;
  close.props.onClick({ stopPropagation: () => { stopped += 1; } });

  assert.equal(stopped, 1, '关闭按钮必须阻止冒泡');
  assert.deepEqual(harness.ctx.uiWorkspace.opened, ['s-6'], '关闭不得触发回跳');
  assert.equal(harness.store.get().length, 1, '关闭走 120ms 退出，不立即移除');
  harness.clock.advance(120);
  assert.equal(harness.store.get().length, 0);
});

test('P07 enabled:false → 不 start store、不注册 overlay、不建通知', () => {
  const clock = createClock();
  const document = createDocument({ visible: false, focused: false });
  const windowObject = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    document,
    Notification: FakeNotification,
    navigator: { userActivation: { isActive: false } },
    __DSH_TASK_COMPLETE_TOAST__: { enabled: false, minRunMs: 0, cooldownMs: 0 },
  };
  const { factory: clientFactory } = loadClientModule({ window: windowObject });
  const fake = createFakeCtx({ list: readyList(['s-7']), binding: completedBinding });
  clientFactory.apply(fake.ctx);

  assert.equal(fake.registrations.length, 0, '不得注册 overlay');
  assert.equal(fake.effects.length, 0, '不得启动 store / 注册任何 effect');
  assert.equal(fake.localeRegistrations.length, 0, '完全不启动时也不注册字典');
  assert.equal(fake.remoteListenerCount('api-session/status'), 0, '不得订阅状态');
  assert.equal(fake.ctx.uiWorkspace.opened.length, 0);
});

test('P08 名称与状态行；真实 selector 签名 + IDENTITY 跨渲染同一引用', async () => {
  FakeNotification.reset('granted');
  const document = createDocument({ visible: true, focused: true });
  const selectorCalls = { workspaces: [], sessions: [] };
  const workspacesSnapshot = { byId: { w: { title: '工区', sessionIds: ['s-8'] } } };
  const sessionsSnapshot = { byId: { 's-8': { title: '会话' } } };
  const harness = createApplyHarness({
    document,
    sessionIds: ['s-8'],
    binding: completedBinding,
    slotProps: {
      // 模拟真实 SnapshotSelectorHook：selector 必填，缺参直接 TypeError。
      useWorkspaces(selector) {
        if (typeof selector !== 'function') throw new TypeError('selector is not a function');
        selectorCalls.workspaces.push(selector);
        return selector(workspacesSnapshot);
      },
      // UseSessions 允许无参（返回快照），也允许 selector。
      useSessions(selector) {
        if (selector === undefined) return sessionsSnapshot;
        if (typeof selector !== 'function') throw new TypeError('selector is not a function');
        selectorCalls.sessions.push(selector);
        return selector(sessionsSnapshot);
      },
    },
  });

  completeRun(harness, 's-8');
  await flushMicrotasks();
  harness.clock.advance(250);

  const first = cardTreeOf(cardsOf(harness.render())[0]);
  assert.equal(lineOf(first), '工区[会话] · 待执行');
  assert.equal(titleOfCard(first), '任务完成');

  harness.render();
  assert.equal(selectorCalls.workspaces.length, 2, '每次渲染都应传 selector');
  assert.equal(selectorCalls.sessions.length, 2);
  assert.equal(selectorCalls.workspaces[0], harness.factory.__test__.IDENTITY);
  assert.equal(selectorCalls.workspaces[0], selectorCalls.workspaces[1], 'selector 必须跨渲染同一引用');
  assert.equal(selectorCalls.sessions[0], selectorCalls.sessions[1]);
});

test('P10 宿主错误边界：渲染抛错 → null、只记录一次、不外抛', () => {
  const harness = createApplyHarness({
    document: createDocument({ visible: false, focused: false }),
    sessionIds: ['s-10'],
    binding: completedBinding,
  });
  const { HostErrorBoundary } = harness.factory.__test__;

  assert.equal(harness.element.type, HostErrorBoundary, 'slot 组件必须被宿主错误边界包裹');
  const innerElement = harness.element.props.children[0];
  assert.equal(typeof innerElement.type, 'function');

  const throwingInner = {
    type: innerElement.type,
    props: {
      ...innerElement.props,
      store: {
        subscribe: () => () => {},
        get() {
          throw new Error('render boom');
        },
      },
    },
  };

  let logged = 0;
  const originalError = console.error;
  console.error = () => { logged += 1; };
  try {
    const rendered = renderSlotElement({ type: HostErrorBoundary, props: { children: [throwingInner] } });
    assert.equal(rendered, null, '边界必须渲染 null，不能让异常冒到槽位框架');

    // 同一实例重复 componentDidCatch 只记录一次。
    const instance = new HostErrorBoundary({ children: [throwingInner] });
    instance.state = { ...instance.state, ...HostErrorBoundary.getDerivedStateFromError(new Error('boom')) };
    instance.componentDidCatch(new Error('boom'));
    instance.componentDidCatch(new Error('boom'));
    assert.equal(instance.render(), null);
  } finally {
    console.error = originalError;
  }

  assert.equal(logged, 2, '一次渲染失败 + 一次实例级重复调用：每个实例只记录一次');
});

test('P09 D3：通知关闭/onclose/点击后从 issued 移除', async () => {
  FakeNotification.reset('granted');
  const document = createDocument({ visible: false, focused: false });
  const notifier = createNotifier({
    document,
    Notification: FakeNotification,
    window: { focus() {} },
    openSession: () => {},
    hasUserActivation: () => true,
  }, (key) => key, { systemNotification: 'always' });

  await notifier.notify(ITEM);
  assert.equal(notifier.issuedCount(), 1);
  FakeNotification.instances[0].onclose();
  assert.equal(notifier.issuedCount(), 0, 'onclose 必须移出 issued');

  await notifier.notify({ ...ITEM, key: 'k-2' });
  assert.equal(notifier.issuedCount(), 1);
  FakeNotification.instances[1].onclick();
  assert.equal(notifier.issuedCount(), 0, '点击关闭后必须移出 issued');

  notifier.dispose();
  assert.equal(notifier.issuedCount(), 0);
});

test('P11 只有 setTimeout/clearTimeout、没有 now 的 timers：卡片不抛且到期 dismiss', async () => {
  FakeNotification.reset('granted');
  const scheduled = [];
  const cleared = [];
  const noNowTimers = {
    setTimeout(callback, ms) {
      scheduled.push({ callback, ms });
      return 11;
    },
    clearTimeout(id) {
      cleared.push(id);
    },
  };
  const harness = createApplyHarness({
    timers: noNowTimers,
    document: createDocument({ visible: true, focused: true }),
    sessionIds: ['s-11'],
    binding: completedBinding,
  });

  completeRun(harness, 's-11');
  await flushMicrotasks();
  harness.clock.advance(250);

  const cardElement = cardsOf(harness.render())[0].props.children[0];
  const timers = cardElement.props.timers;
  assert.equal(typeof timers.now, 'function', 'ToastHost 必须给缺失 now 的 timers 补回落');
  assert.equal(typeof timers.setTimeout, 'function');
  assert.equal(typeof timers.clearTimeout, 'function');

  // 第一层：createDismissTimer 自己也要对裸 timers 回落。
  let rawExpired = false;
  const rawTimer = harness.factory.__test__.createDismissTimer(noNowTimers, 50, () => {
    rawExpired = true;
  });
  assert.doesNotThrow(() => rawTimer.start(), 'createDismissTimer 不得因 env.now 缺失抛错');
  assert.equal(scheduled[0].ms, 50);
  scheduled[0].callback();
  assert.equal(rawExpired, true);
  rawTimer.dispose();

  // 第二层：ToastHost 归一化后的 timers 也必须可 start/到期。
  let expired = false;
  const timer = harness.factory.__test__.createDismissTimer(timers, 100, () => {
    expired = true;
  });
  assert.doesNotThrow(() => timer.start(), '挂载 start 不得因 env.now 缺失抛错');
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].ms, 100);
  scheduled[1].callback();
  assert.equal(expired, true, '到期仍应 dismiss');

  timer.dispose();
  assert.deepEqual(cleared, [], '已触发的计时器无需再 clear');
});

test('P12 window 形状的 timers（方法依赖 this）：绑定正确、now 可用', async () => {
  FakeNotification.reset('granted');
  const calls = { now: 0, set: 0, clear: 0 };
  const scheduled = [];
  const windowLike = {
    now() {
      calls.now += 1;
      assert.equal(this, windowLike, 'now 必须以 windowLike 为 this');
      return 4242;
    },
    setTimeout(callback, ms) {
      calls.set += 1;
      assert.equal(this, windowLike, 'setTimeout 必须以 windowLike 为 this');
      scheduled.push({ callback, ms });
      return 12;
    },
    clearTimeout(id) {
      calls.clear += 1;
      assert.equal(this, windowLike, 'clearTimeout 必须以 windowLike 为 this');
      assert.equal(id, 12);
    },
  };
  const harness = createApplyHarness({
    timers: windowLike,
    document: createDocument({ visible: true, focused: true }),
    sessionIds: ['s-12'],
    binding: completedBinding,
  });

  completeRun(harness, 's-12');
  await flushMicrotasks();
  harness.clock.advance(250);

  const cardElement = cardsOf(harness.render())[0].props.children[0];
  const timers = cardElement.props.timers;

  assert.equal(timers.now(), 4242);
  const id = timers.setTimeout(() => {}, 50);
  assert.equal(id, 12);
  timers.clearTimeout(id);
  assert.deepEqual(calls, { now: 1, set: 1, clear: 1 });

  let expired = false;
  const timer = harness.factory.__test__.createDismissTimer(timers, 10, () => {
    expired = true;
  });
  timer.start();
  scheduled[scheduled.length - 1].callback();
  assert.equal(expired, true);
  timer.dispose();
});
