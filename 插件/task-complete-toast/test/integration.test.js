import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, Config } from '../index.js';
import { CONFIG_DEFAULTS, DEFAULT_ROUTE_PATH } from '../lib/config.js';
import { createOutcomeTable } from '../lib/outcome-table.js';
import { createRouteHandler } from '../lib/host.js';
import {
  parsePatch,
  createFakeHostCtx,
  readResponseJson,
  requestRoute,
} from './harness.js';

const INJECTION_NAME = '__DSH_TASK_COMPLETE_TOAST__';
/** 结果表 TTL 以 event.time（epoch 毫秒）计算，测试事件时间必须贴近当前时间。 */
const EVENT_TIME = Date.now();

function setupHost(config) {
  const host = createFakeHostCtx();
  apply(host.ctx, config);
  return host;
}

function currentRoute(host) {
  assert.equal(host.routes.length, 1, '应恰好注册一条路由');
  return host.routes[0];
}

function emitTurnEnd(host, sessionId, reason, { time = EVENT_TIME, seq = 1 } = {}) {
  host.emit('session/event', { id: sessionId }, {
    type: 'turn/end',
    time,
    seq,
    data: { reason },
  });
}

function getSession(host, sessionId, { method = 'GET', path = DEFAULT_ROUTE_PATH } = {}) {
  return requestRoute(currentRoute(host), method, `${path}?sessionId=${encodeURIComponent(sessionId)}`);
}

function assertJsonHeaders(res) {
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
}

test('I01 turn/end(completed) 写入后 GET → 200 且字段/头齐全', () => {
  const host = setupHost();
  emitTurnEnd(host, 's-0001', { kind: 'completed' }, { time: EVENT_TIME, seq: 7 });

  const res = getSession(host, 's-0001');
  assert.equal(res.statusCode, 200);
  assertJsonHeaders(res);
  assert.deepEqual(readResponseJson(res), {
    sessionId: 's-0001',
    outcome: 'completed',
    reasonKind: 'completed',
    cancelCause: null,
    at: EVENT_TIME,
    seq: 7,
  });
});

test('I02 未知会话 GET → 404 unknown-session', () => {
  const host = setupHost();
  const res = getSession(host, 's-missing');

  assert.equal(res.statusCode, 404);
  assertJsonHeaders(res);
  assert.deepEqual(readResponseJson(res), { error: 'unknown-session' });
});

test('I03 sessionId 缺失/空/超长/控制字符 → 400；非 GET → 405', () => {
  const host = setupHost();
  const route = currentRoute(host);

  const badRequests = [
    requestRoute(route, 'GET', DEFAULT_ROUTE_PATH),
    requestRoute(route, 'GET', `${DEFAULT_ROUTE_PATH}?sessionId=`),
    requestRoute(route, 'GET', `${DEFAULT_ROUTE_PATH}?sessionId=${'a'.repeat(201)}`),
    requestRoute(route, 'GET', `${DEFAULT_ROUTE_PATH}?sessionId=${encodeURIComponent('s\u0001')}`),
  ];

  for (const res of badRequests) {
    assert.equal(res.statusCode, 400);
    assertJsonHeaders(res);
    assert.deepEqual(readResponseJson(res), { error: 'invalid-session-id' });
  }

  const post = requestRoute(route, 'POST', `${DEFAULT_ROUTE_PATH}?sessionId=s-0001`);
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.allow, 'GET');
  assertJsonHeaders(post);
  assert.deepEqual(readResponseJson(post), { error: 'method-not-allowed' });
});

test('I04 error 与 max-tokens 分别映射 error / interrupted', () => {
  const host = setupHost();
  emitTurnEnd(host, 's-error', { kind: 'error', error: { message: 'x', code: 'E' } });
  emitTurnEnd(host, 's-max', { kind: 'max-tokens' });

  const error = readResponseJson(getSession(host, 's-error'));
  assert.equal(error.outcome, 'error');
  assert.equal(error.reasonKind, 'error');

  const max = readResponseJson(getSession(host, 's-max'));
  assert.equal(max.outcome, 'interrupted');
  assert.equal(max.reasonKind, 'max-tokens');
});

test('I05 aborted 的 5 种 cause 与 forked 映射正确', () => {
  const host = setupHost();
  const cases = [
    [{ kind: 'aborted', reason: { kind: 'user' } }, 'suppressed', 'user'],
    [{ kind: 'aborted', reason: { kind: 'parent' } }, 'stopped', 'parent'],
    [{ kind: 'aborted', reason: { kind: 'hook', reason: 'r' } }, 'stopped', 'hook'],
    [{ kind: 'aborted', reason: { kind: 'disposed' } }, 'stopped', 'disposed'],
    [{ kind: 'aborted', reason: { kind: 'legacy' } }, 'stopped', 'legacy'],
  ];

  for (const [reason, outcome, cause] of cases) {
    const sessionId = `s-aborted-${cause}`;
    emitTurnEnd(host, sessionId, reason);
    const body = readResponseJson(getSession(host, sessionId));
    assert.equal(body.outcome, outcome);
    assert.equal(body.reasonKind, 'aborted');
    assert.equal(body.cancelCause, cause);
  }

  emitTurnEnd(host, 's-forked', { kind: 'forked' });
  const forked = readResponseJson(getSession(host, 's-forked'));
  assert.equal(forked.outcome, 'ignored');
  assert.equal(forked.reasonKind, 'forked');
  assert.equal(forked.cancelCause, null);
});

test('I06 index-inject 默认投影只有 enabled/bridge/routePath', () => {
  const host = setupHost();
  const rows = [];
  host.emit('webserver/index-inject', rows);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    kind: 'global',
    name: INJECTION_NAME,
    value: {
      enabled: true,
      bridge: 'auto',
      routePath: DEFAULT_ROUTE_PATH,
    },
  });
  assert.deepEqual(Object.keys(rows[0].value).sort(), ['bridge', 'enabled', 'routePath']);
});

test('I06b enabled:false 只注册注入行，bridge 投影为 off', () => {
  const host = setupHost({ enabled: false, bridge: { enabled: false } });

  assert.equal(host.routes.length, 0);
  assert.deepEqual(host.handlers.get('session/event') ?? [], []);

  const rows = [];
  host.emit('webserver/index-inject', rows);
  assert.deepEqual(rows[0].value, {
    enabled: false,
    bridge: 'off',
    routePath: DEFAULT_ROUTE_PATH,
  });
  assert.equal('ringSize' in rows[0].value, false);
  assert.equal('entryTtlMs' in rows[0].value, false);
});

test('I07 TTL 过期后 GET → 404 且表项被清除', () => {
  let now = 1000;
  const table = createOutcomeTable(16, 1000, () => now);
  table.put({
    sessionId: 's-ttl',
    outcome: 'completed',
    reasonKind: 'completed',
    cancelCause: null,
    at: 1000,
    seq: 1,
  });

  now = 2001;
  const route = { handler: createRouteHandler({ table, exposeReason: true }) };
  const res = requestRoute(route, 'GET', `${DEFAULT_ROUTE_PATH}?sessionId=s-ttl`);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(readResponseJson(res), { error: 'unknown-session' });
  assert.equal(table.size(), 0);
});

test('I08 表满 257 条淘汰最旧，容量保持 256', () => {
  const table = createOutcomeTable(256, 600000, () => 0);
  for (let index = 0; index <= 256; index += 1) {
    table.put({
      sessionId: `s-${index}`,
      outcome: 'completed',
      reasonKind: 'completed',
      cancelCause: null,
      at: 0,
      seq: index,
    });
  }

  assert.equal(table.size(), 256);

  const route = { handler: createRouteHandler({ table, exposeReason: true }) };
  const oldest = requestRoute(route, 'GET', `${DEFAULT_ROUTE_PATH}?sessionId=s-0`);
  assert.equal(oldest.statusCode, 404);

  const newest = requestRoute(route, 'GET', `${DEFAULT_ROUTE_PATH}?sessionId=s-256`);
  assert.equal(newest.statusCode, 200);
  assert.equal(readResponseJson(newest).sessionId, 's-256');
});

test('I09 Config：undefined/空对象得到全套默认值', () => {
  const undefinedResult = Config['~standard'].validate(undefined);
  assert.equal(undefinedResult.issues, undefined);
  assert.deepEqual(undefinedResult.value, CONFIG_DEFAULTS);

  const emptyResult = Config['~standard'].validate({});
  assert.equal(emptyResult.issues, undefined);
  assert.deepEqual(emptyResult.value, CONFIG_DEFAULTS);
  assert.deepEqual(Config.default, CONFIG_DEFAULTS);
});

test('I10 Config：数值/路径越界被拒，边界值通过', () => {
  const invalidCases = [
    [{ bridge: { ringSize: 31 } }, ['bridge', 'ringSize']],
    [{ bridge: { ringSize: 1025 } }, ['bridge', 'ringSize']],
    [{ bridge: { entryTtlMs: 59999 } }, ['bridge', 'entryTtlMs']],
    [{ bridge: { entryTtlMs: 3600001 } }, ['bridge', 'entryTtlMs']],
    [{ bridge: { routePath: '/short' } }, ['bridge', 'routePath']],
    [{ bridge: { routePath: `/${'a'.repeat(120)}` } }, ['bridge', 'routePath']],
  ];

  for (const [value, expectedPath] of invalidCases) {
    const result = Config['~standard'].validate(value);
    assert.ok(Array.isArray(result.issues) && result.issues.length > 0, `应拒绝 ${JSON.stringify(value)}`);
    assert.ok(
      result.issues.some((issue) => issue.path.join('.') === expectedPath.join('.')),
      `缺少 ${expectedPath.join('.')} 的 issue`,
    );
  }

  const valid = Config['~standard'].validate({
    bridge: {
      ringSize: 32,
      entryTtlMs: 60000,
      routePath: '/1234567',
    },
  });
  assert.equal(valid.issues, undefined);
  assert.equal(valid.value.bridge.ringSize, 32);
  assert.equal(valid.value.bridge.entryTtlMs, 60000);
  assert.equal(valid.value.bridge.routePath, '/1234567');

  const upper = Config['~standard'].validate({
    bridge: { ringSize: 1024, entryTtlMs: 3600000, routePath: `/${'a'.repeat(119)}` },
  });
  assert.equal(upper.issues, undefined);
});

test('I11 Config：类型错误被拒（含 enum）', () => {
  const invalidCases = [
    [{ enabled: 'yes' }, ['enabled']],
    [{ bridge: 'auto' }, ['bridge']],
    [{ bridge: { enabled: 1 } }, ['bridge', 'enabled']],
    [{ bridge: { routePath: 42 } }, ['bridge', 'routePath']],
    [{ bridge: { routeKind: 'exactt' } }, ['bridge', 'routeKind']],
    [{ bridge: { ringSize: '256' } }, ['bridge', 'ringSize']],
    [{ bridge: { entryTtlMs: null } }, ['bridge', 'entryTtlMs']],
    [{ bridge: { exposeReason: 'true' } }, ['bridge', 'exposeReason']],
  ];

  for (const [value, expectedPath] of invalidCases) {
    const result = Config['~standard'].validate(value);
    assert.ok(Array.isArray(result.issues) && result.issues.length > 0, `应拒绝 ${JSON.stringify(value)}`);
    assert.ok(
      result.issues.some((issue) => issue.path.join('.') === expectedPath.join('.')),
      `缺少 ${expectedPath.join('.')} 的 issue`,
    );
  }

  const nullResult = Config['~standard'].validate(null);
  assert.ok(Array.isArray(nullResult.issues) && nullResult.issues.length > 0);
});

test('I12 Config：未知键忽略且不进入归一化结果', () => {
  const result = Config['~standard'].validate({
    unknownRoot: true,
    bridge: { unknownBridge: 1, ringSize: 64 },
  });

  assert.equal(result.issues, undefined);
  assert.equal(result.value.bridge.ringSize, 64);
  assert.equal('unknownRoot' in result.value, false);
  assert.equal('unknownBridge' in result.value.bridge, false);
  assert.deepEqual(Object.keys(result.value).sort(), ['bridge', 'enabled']);
});

test('I13 parsePatch 支持 config 缩进映射', () => {
  const entries = parsePatch(`
- insert:
    - id: task-complete-toast
      name: '@local/task-complete-toast'
      config:
        enabled: false
        bridge:
          enabled: false
          routePath: /custom/outcome
          routeKind: prefix
          ringSize: 64
`);

  assert.deepEqual(entries, [{
    insert: [{
      id: 'task-complete-toast',
      name: '@local/task-complete-toast',
      config: {
        enabled: false,
        bridge: {
          enabled: false,
          routePath: '/custom/outcome',
          routeKind: 'prefix',
          ringSize: 64,
        },
      },
    }],
  }]);
});

test('I14 dispose 后监听与路由全部移除，注入行不再产出', () => {
  const host = setupHost();
  assert.equal(host.routes.length, 1);
  assert.equal((host.handlers.get('session/event') ?? []).length, 1);
  assert.equal((host.handlers.get('webserver/index-inject') ?? []).length, 1);

  host.disposeAll();

  assert.equal(host.routes.length, 0);
  for (const list of host.handlers.values()) assert.equal(list.length, 0);

  const rows = [];
  host.emit('webserver/index-inject', rows);
  assert.deepEqual(rows, []);
});

test('I15 exposeReason:false 只回 sessionId/outcome/at', () => {
  const host = setupHost({ bridge: { exposeReason: false } });
  emitTurnEnd(host, 's-plain', { kind: 'completed' }, { time: EVENT_TIME, seq: 3 });

  const body = readResponseJson(getSession(host, 's-plain'));
  assert.deepEqual(body, {
    sessionId: 's-plain',
    outcome: 'completed',
    at: EVENT_TIME,
  });
});

test('I16 自定义 routePath/routeKind 透传并生效', () => {
  const host = setupHost({ bridge: { routePath: '/custom/outcome', routeKind: 'prefix' } });
  const route = currentRoute(host);

  assert.equal(route.kind, 'prefix');
  assert.equal(route.path, '/custom/outcome');

  emitTurnEnd(host, 's-custom', { kind: 'completed' }, { time: EVENT_TIME, seq: 4 });
  const res = requestRoute(route, 'GET', '/custom/outcome?sessionId=s-custom');
  assert.equal(res.statusCode, 200);

  const rows = [];
  host.emit('webserver/index-inject', rows);
  assert.equal(rows[0].value.routePath, '/custom/outcome');
});

test('I17 blocked 与 interrupted 映射', () => {
  const host = setupHost();
  emitTurnEnd(host, 's-blocked', { kind: 'blocked' });
  emitTurnEnd(host, 's-interrupted', { kind: 'interrupted' });

  const blocked = readResponseJson(getSession(host, 's-blocked'));
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.reasonKind, 'blocked');
  assert.equal(blocked.cancelCause, null);

  const interrupted = readResponseJson(getSession(host, 's-interrupted'));
  assert.equal(interrupted.outcome, 'interrupted');
  assert.equal(interrupted.reasonKind, 'interrupted');
  assert.equal(interrupted.cancelCause, null);
});
