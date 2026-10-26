/**
 * WP5 结果桥单测（R01–R10）。
 *
 * 只验证 `createResolver` 的纯逻辑：快路径、慢路径、超时取消、降级，
 * 以及内联 `classify` 与宿主 `lib/classify.js` 的一致性（防两处漂移）。
 * 不接 store、不接 apply，不验证真实路由与真实计时。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadClientModule } from './harness.js';
import { classify as hostClassify } from '../lib/classify.js';

const { factory } = loadClientModule();
const { createResolver, classify, DEFAULTS } = factory.__test__;

/** 构造一条 `turn/end` 事件窗口项（形状来自 `SessionEventWindow.entries`）。 */
function turnEnd(reason) {
  return { type: 'event', event: { type: 'turn/end', data: { reason } } };
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

/**
 * 最小 resolver env：默认 fetch 直接抛错，用来证明“不该发请求”的用例。
 * `fetch` 记录每次调用的 url/init，便于断言 URL、`cache` 与 abort。
 */
function createEnv(options = {}) {
  const clock = createClock();
  const calls = [];
  const env = {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    getBinding: options.getBinding ?? (() => undefined),
    fetch(url, init) {
      calls.push({ url, init });
      if (typeof options.fetch === 'function') return options.fetch(url, init);
      throw new Error('该用例不应发起 fetch');
    },
  };
  return { env, clock, calls };
}

/** 只取契约字段，避免断言被 vm 跨 realm 的原型差异干扰。 */
function resultOf(result) {
  return { outcome: result.outcome, source: result.source };
}

/** 200 响应桩：`status` 同时给出 ok，贴近真实 Response。 */
function respondJson(body, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test('R01 绑定快路径命中最后一条 turn/end，且 fetch 未被调用', async () => {
  const entries = [
    turnEnd({ kind: 'error' }),
    { type: 'event', event: { type: 'turn/start' } },
    turnEnd({ kind: 'completed' }),
    { type: 'session', event: { type: 'turn/end' } },
  ];
  const { env, clock, calls } = createEnv({
    getBinding: () => ({ eventSource: { getSnapshot: () => ({ entries }) } }),
  });

  const result = await createResolver(env, {}).resolve('s-01');

  assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'binding' });
  assert.equal(calls.length, 0, '快路径命中时不得发起 fetch');
  assert.equal(clock.pending(), 0, '快路径不应留下计时器');
});

test('R01b 绑定无 turn/end 时转慢路径；getBinding 抛错也不外抛', async () => {
  const { env, calls } = createEnv({
    getBinding: () => ({ eventSource: { getSnapshot: () => ({ entries: [{ type: 'event', event: { type: 'message' } }] }) } }),
    fetch: respondJson({ outcome: 'error' }),
  });
  assert.deepEqual(resultOf(await createResolver(env, {}).resolve('s-02')), { outcome: 'error', source: 'route' });
  assert.equal(calls.length, 1);

  const throwing = createEnv({
    getBinding: () => {
      throw new Error('snapshot 不可用');
    },
    fetch: respondJson({ outcome: 'blocked' }),
  });
  assert.deepEqual(
    resultOf(await createResolver(throwing.env, {}).resolve('s-03')),
    { outcome: 'blocked', source: 'route' },
  );
});

test('R02 慢路径 200：§7.4/§7.3 的七种合法 outcome 逐一映射为 route', async (t) => {
  const outcomes = ['completed', 'error', 'interrupted', 'blocked', 'stopped', 'ignored', 'suppressed'];

  for (const outcome of outcomes) {
    await t.test(outcome, async () => {
      const { env, calls } = createEnv({ fetch: respondJson({ sessionId: 's-1', outcome }) });
      const result = await createResolver(env, {}).resolve('s-1');

      assert.deepEqual(resultOf(result), { outcome, source: 'route' });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, `${DEFAULTS.routePath}?sessionId=s-1`);
      assert.equal(calls[0].init.cache, 'no-store');
      assert.ok(calls[0].init.signal !== undefined, '慢路径应带 AbortSignal');
    });
  }

  // sessionId 必须 encodeURIComponent，不能把保留字符拼进查询串。
  const encoded = createEnv({ fetch: respondJson({ outcome: 'completed' }) });
  await createResolver(encoded.env, {}).resolve('s 1&x=2/#' + '中');
  assert.equal(
    encoded.calls[0].url,
    `${DEFAULTS.routePath}?sessionId=${encodeURIComponent('s 1&x=2/#' + '中')}`,
  );
});

test('R03 404/400/500 等非 2xx → completed + fallback', async (t) => {
  for (const status of [400, 404, 500, 204]) {
    await t.test(String(status), async () => {
      const { env, clock, calls } = createEnv({
        fetch: async () => ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => ({ error: 'unknown-session' }),
        }),
      });
      const result = await createResolver(env, {}).resolve('s-3');

      assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
      assert.equal(calls.length, 1);
      assert.equal(clock.pending(), 0, '结束（含失败）后必须清掉预算计时器');
    });
  }
});

test('R04 200ms 预算超时 → completed + fallback，且 abort 被触发', async () => {
  const { env, clock, calls } = createEnv();
  let fetchAborted = false;
  env.fetch = (url, init) => {
    calls.push({ url, init });
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        fetchAborted = true;
        reject(new Error('AbortError'));
      });
    });
  };

  const resolver = createResolver(env, { resolveBudgetMs: 200 });
  let settled = false;
  const pending = resolver.resolve('s-4').then((value) => {
    settled = true;
    return value;
  });

  clock.advance(199);
  await Promise.resolve();
  assert.equal(settled, false, '预算内不应提前降级');
  assert.equal(fetchAborted, false);

  clock.advance(1);
  const result = await pending;

  assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
  assert.equal(fetchAborted, true, '超时必须 abort 在途请求');
  assert.equal(calls[0].init.signal.aborted, true);
  assert.equal(clock.pending(), 0, '超时后必须清掉预算计时器');
});

test('R05 网络异常 → completed + fallback，且计时器被清理', async () => {
  const { env, clock, calls } = createEnv({
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });

  const result = await createResolver(env, {}).resolve('s-5');

  assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
  assert.equal(calls.length, 1);
  assert.equal(clock.pending(), 0);
});

test('R06 200 但 JSON 解析失败 → completed + fallback', async () => {
  const { env, clock } = createEnv({
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }),
  });

  const result = await createResolver(env, {}).resolve('s-6');

  assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
  assert.equal(clock.pending(), 0);
});

test('R07 未知/缺失 outcome → completed + fallback', async (t) => {
  const bodies = [
    { outcome: 'weird' },
    { outcome: 'COMPLETED' },
    {},
    null,
    ['completed'],
  ];

  for (let index = 0; index < bodies.length; index += 1) {
    await t.test(`body-${index}`, async () => {
      const { env } = createEnv({ fetch: respondJson(bodies[index]) });
      const result = await createResolver(env, {}).resolve('s-7');
      assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
    });
  }
});

test('R08 bridge:off → 不发起 fetch；绑定命中仍走快路径', async () => {
  const off = createEnv();
  const result = await createResolver(off.env, { bridge: 'off' }).resolve('s-8');
  assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
  assert.equal(off.calls.length, 0, 'bridge:off 不得发起 fetch');

  const withBinding = createEnv({
    getBinding: () => ({ eventSource: { getSnapshot: () => ({ entries: [turnEnd({ kind: 'blocked' })] }) } }),
  });
  const fast = await createResolver(withBinding.env, { bridge: 'off' }).resolve('s-8');
  assert.deepEqual(resultOf(fast), { outcome: 'blocked', source: 'binding' });
  assert.equal(withBinding.calls.length, 0, 'bridge:off 不改变快路径');
});

test('R09 内联 classify 与 lib/classify.js 对 8 种 reason 输出一致', () => {
  // §7.4 全 8 行：aborted 行取 parent 作为非 user 代表，其余由下方 cause 表补齐。
  const reasons = [
    { kind: 'completed' },
    { kind: 'error' },
    { kind: 'max-tokens' },
    { kind: 'blocked' },
    { kind: 'interrupted' },
    { kind: 'aborted', reason: { kind: 'user' } },
    { kind: 'aborted', reason: { kind: 'parent' } },
    { kind: 'forked' },
  ];

  for (const reason of reasons) {
    const inline = classify(reason);
    const host = hostClassify(reason);
    assert.equal(inline.outcome, host.outcome, `outcome 漂移：${JSON.stringify(reason)}`);
    assert.equal(inline.reasonKind, host.reasonKind, `reasonKind 漂移：${JSON.stringify(reason)}`);
    assert.equal(inline.cancelCause, host.cancelCause, `cancelCause 漂移：${JSON.stringify(reason)}`);
  }

  // §11.2 C03：aborted 的 5 种 cause，以及字符串/缺失/未知 cause。
  const extra = [
    { kind: 'aborted', reason: { kind: 'hook' } },
    { kind: 'aborted', reason: { kind: 'disposed' } },
    { kind: 'aborted', reason: { kind: 'legacy' } },
    { kind: 'aborted', reason: { kind: 'user' } },
    { kind: 'aborted', reason: 'user' },
    { kind: 'aborted', reason: 'hook' },
    { kind: 'aborted', reason: undefined },
    { kind: 'aborted' },
    { kind: 'future-kind' },
    {},
    undefined,
    null,
  ];

  for (const reason of extra) {
    assert.deepEqual(
      { ...classify(reason) },
      { ...hostClassify(reason) },
      `额外分支漂移：${JSON.stringify(reason)}`,
    );
  }
});

test('R10 外部 signal 取消：未发起时不 fetch，在途时走 fallback 并 abort', async () => {
  const pre = createEnv();
  const preController = new AbortController();
  preController.abort();
  const preResult = await createResolver(pre.env, {}).resolve('s-10', preController.signal);
  assert.deepEqual(resultOf(preResult), { outcome: 'completed', source: 'fallback' });
  assert.equal(pre.calls.length, 0, '已取消的 signal 不应发起 fetch');

  const { env, clock, calls } = createEnv();
  let fetchAborted = false;
  env.fetch = (url, init) => {
    calls.push({ url, init });
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        fetchAborted = true;
        reject(new Error('AbortError'));
      });
    });
  };
  const controller = new AbortController();
  const resolver = createResolver(env, {});
  let settled = false;
  const pending = resolver.resolve('s-10', controller.signal).then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  controller.abort();
  const result = await pending;
  assert.equal(settled, true);
  assert.deepEqual(resultOf(result), { outcome: 'completed', source: 'fallback' });
  assert.equal(fetchAborted, true, '外部取消必须 abort 在途 fetch');
  assert.equal(clock.pending(), 0, '外部取消后必须清掉预算计时器');
});
