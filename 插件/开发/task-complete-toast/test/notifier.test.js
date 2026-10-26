import test from 'node:test';
import assert from 'node:assert/strict';

import { loadClientModule } from './harness.js';

const { factory } = loadClientModule();
const { createNotifier } = factory.__test__;

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
  static grantOnRequest = true;
  static instances = [];

  static reset() {
    FakeNotification.permission = 'granted';
    FakeNotification.requestCount = 0;
    FakeNotification.grantOnRequest = true;
    FakeNotification.instances = [];
  }

  static async requestPermission() {
    FakeNotification.requestCount += 1;
    if (FakeNotification.grantOnRequest) FakeNotification.permission = 'granted';
    return FakeNotification.permission;
  }

  constructor(title, options) {
    this.title = title;
    this.options = options;
    this.closed = false;
    this.onclick = null;
    FakeNotification.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

class ThrowingNotification {
  static permission = 'granted';

  constructor() {
    throw new Error('construct failed');
  }
}

function createDocument({ visible = true, focused = true } = {}) {
  const listeners = new Map();
  return {
    visibilityState: visible ? 'visible' : 'hidden',
    hidden: !visible,
    hasFocus: () => focused,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler();
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
    setVisible(next) {
      this.visibilityState = next ? 'visible' : 'hidden';
      this.hidden = !next;
    },
  };
}

function createEnv({ document, permission = 'granted', userActivation = false, Notification = FakeNotification } = {}) {
  const focusCalls = [];
  const opened = [];
  FakeNotification.permission = permission;
  const env = {
    document: document ?? createDocument(),
    Notification,
    window: { focus: () => focusCalls.push('focus') },
    openSession: (id) => opened.push(id),
    hasUserActivation: () => userActivation,
  };
  return { env, focusCalls, opened, document: env.document };
}

test('N01 auto + 隐藏 + granted：发送通知，内容与 tag 正确', async () => {
  FakeNotification.reset();
  const document = createDocument({ visible: false, focused: false });
  const { env } = createEnv({ document, permission: 'granted' });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'auto' });

  const status = await notifier.notify(ITEM);
  assert.equal(status, 'delivered');
  assert.equal(FakeNotification.instances.length, 1);

  const notification = FakeNotification.instances[0];
  assert.equal(notification.title, '任务完成');
  assert.equal(notification.options.body, '插件[Toast] · 待执行');
  assert.equal(notification.options.tag, 'dsh-task-s-1');
  assert.equal(notification.options.renotify, false);

  notifier.dispose();
});

test('N02 auto + 可见：不发送', async () => {
  FakeNotification.reset();
  const { env } = createEnv({ permission: 'granted', document: createDocument({ visible: true, focused: true }) });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'auto' });

  assert.equal(await notifier.notify(ITEM), 'skipped');
  assert.equal(FakeNotification.instances.length, 0);
  notifier.dispose();
});

test('N03 always：可见也发送；never：不发送', async () => {
  FakeNotification.reset();
  const { env } = createEnv({ permission: 'granted', document: createDocument({ visible: true, focused: true }) });

  const always = createNotifier(env, (key) => key, { systemNotification: 'always' });
  assert.equal(await always.notify(ITEM), 'delivered');
  assert.equal(FakeNotification.instances.length, 1);
  always.dispose();

  const never = createNotifier(env, (key) => key, { systemNotification: 'never' });
  assert.equal(await never.notify(ITEM), 'skipped');
  assert.equal(FakeNotification.instances.length, 1);
  never.dispose();
});

test('N04 denied → deferred；可见后补弹一次，第二次不再发', async () => {
  FakeNotification.reset();
  const document = createDocument({ visible: false, focused: false });
  const { env } = createEnv({ document, permission: 'denied' });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'auto' });

  assert.equal(await notifier.notify(ITEM), 'deferred');
  assert.equal(FakeNotification.instances.length, 0);

  FakeNotification.permission = 'granted';
  document.setVisible(true);
  document.hasFocus = () => true;

  await notifier.onVisible();
  assert.equal(FakeNotification.instances.length, 1, '补弹一次');
  await notifier.onVisible();
  assert.equal(FakeNotification.instances.length, 1, '不得重复补弹');
  notifier.dispose();
});

test('N05 default + 隐藏：直接尝试发送，不申请权限（D1）', async () => {
  FakeNotification.reset();
  const document = createDocument({ visible: false, focused: false });
  const { env } = createEnv({ document, permission: 'default', userActivation: true });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'auto' });

  assert.equal(await notifier.notify(ITEM), 'delivered');
  assert.equal(FakeNotification.instances.length, 1, 'default 也必须尝试构造发送');
  assert.equal(FakeNotification.requestCount, 0, '隐藏时不得申请权限');
  notifier.dispose();
});

test('N06 default + 可见但无用户手势：仍直接发送，不申请权限（D1）', async () => {
  FakeNotification.reset();
  const { env } = createEnv({
    permission: 'default',
    userActivation: false,
    document: createDocument({ visible: true, focused: true }),
  });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'always' });

  assert.equal(await notifier.notify(ITEM), 'delivered');
  assert.equal(FakeNotification.requestCount, 0);
  assert.equal(FakeNotification.instances.length, 1, '无手势只是不申请权限，不是发送前置');
  notifier.dispose();
});

test('N07 构造失败 → deferred', async () => {
  FakeNotification.reset();
  const { env } = createEnv({
    permission: 'granted',
    Notification: ThrowingNotification,
    document: createDocument({ visible: false, focused: false }),
  });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'always' });

  assert.equal(await notifier.notify(ITEM), 'deferred');
  assert.equal(FakeNotification.instances.length, 0);
  notifier.dispose();
});

test('N08 点击：focus → openSession → close', async () => {
  FakeNotification.reset();
  const { env, focusCalls, opened } = createEnv({
    permission: 'granted',
    document: createDocument({ visible: false, focused: false }),
  });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'always' });
  await notifier.notify(ITEM);

  const notification = FakeNotification.instances[0];
  assert.equal(typeof notification.onclick, 'function');
  notification.onclick();
  assert.deepEqual(focusCalls, ['focus']);
  assert.deepEqual(opened, ['s-1']);
  assert.equal(notification.closed, true);
  notifier.dispose();
});

test('N09 dispose：关闭已发通知、移除监听、清空补弹，之后不再发送', async () => {
  FakeNotification.reset();
  const document = createDocument({ visible: false, focused: false });
  const { env } = createEnv({ document, permission: 'granted' });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'always' });

  await notifier.notify(ITEM);
  const notification = FakeNotification.instances[0];
  assert.equal(notification.closed, false);

  notifier.dispose();
  assert.equal(notification.closed, true);
  assert.equal(document.listenerCount('visibilitychange'), 0);
  assert.equal(document.listenerCount('focus'), 0);

  assert.equal(await notifier.notify(ITEM), 'skipped');
  assert.equal(FakeNotification.instances.length, 1);
});

test('N10 dispose 后可见性监听不再补弹', async () => {
  FakeNotification.reset();
  const document = createDocument({ visible: false, focused: false });
  const { env } = createEnv({ document, permission: 'denied' });
  const notifier = createNotifier(env, (key) => key, { systemNotification: 'always' });

  assert.equal(await notifier.notify(ITEM), 'deferred');
  notifier.dispose();
  FakeNotification.permission = 'granted';
  document.setVisible(true);
  document.hasFocus = () => true;
  document.dispatch('visibilitychange');
  assert.equal(FakeNotification.instances.length, 0);
});
