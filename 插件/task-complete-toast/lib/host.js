import { classify } from './classify.js';

/** sessionId 长度上限（§6.3）。 */
const MAX_SESSION_ID_LENGTH = 200;
/** C0 控制字符与 DEL。 */
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
/** 所有 JSON 响应共用的安全头（§7.3）。 */
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
});

/**
 * 只接受 `?sessionId=`，长度 ≤ 200，拒绝控制字符。
 * @param {import('node:http').IncomingMessage} req
 * @returns {string|undefined}
 */
export function readSessionId(req) {
  if (req === null || typeof req !== 'object' || typeof req.url !== 'string') return undefined;

  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    return undefined;
  }

  const sessionId = url.searchParams.get('sessionId');
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  if (sessionId.length > MAX_SESSION_ID_LENGTH) return undefined;
  if (CONTROL_CHARACTER.test(sessionId)) return undefined;
  return sessionId;
}

/**
 * 统一写出 JSON：`no-store`、`nosniff`，可追加 `allow` 等头。
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [extraHeaders]
 */
export function sendJson(res, status, body, extraHeaders) {
  res.writeHead(status, { ...JSON_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(body));
}

/**
 * `turn/end` 事件 → 结果表条目；其他事件返回 undefined。
 * @param {{id: string}|undefined} session
 * @param {{type?: string, time?: number, seq?: number, data?: {reason?: object}}|undefined} event
 * @param {() => number} now
 */
export function toOutcomeEntry(session, event, now = Date.now) {
  if (event === null || typeof event !== 'object' || event.type !== 'turn/end') return undefined;

  const sessionId = session?.id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;

  const { outcome, reasonKind, cancelCause } = classify(event.data?.reason);
  const at = Number.isFinite(event.time) ? event.time : now();
  const seq = Number.isFinite(event.seq) ? event.seq : 0;

  return { sessionId, outcome, reasonKind, cancelCause, at, seq };
}

/**
 * 路由处理器：只做「方法 → id → 查表 → 200/404/400」，不读取任何会话内容。
 * @param {{table: {get: (id: string) => object|undefined}, exposeReason: boolean}} options
 */
export function createRouteHandler({ table, exposeReason }) {
  return function handle(req, res) {
    if (req?.method !== 'GET') {
      sendJson(res, 405, { error: 'method-not-allowed' }, { allow: 'GET' });
      return;
    }

    const sessionId = readSessionId(req);
    if (sessionId === undefined) {
      sendJson(res, 400, { error: 'invalid-session-id' });
      return;
    }

    const entry = table.get(sessionId);
    if (entry === undefined) {
      sendJson(res, 404, { error: 'unknown-session' });
      return;
    }

    const body = exposeReason
      ? {
        sessionId: entry.sessionId,
        outcome: entry.outcome,
        reasonKind: entry.reasonKind,
        cancelCause: entry.cancelCause,
        at: entry.at,
        seq: entry.seq,
      }
      : {
        sessionId: entry.sessionId,
        outcome: entry.outcome,
        at: entry.at,
      };

    sendJson(res, 200, body);
  };
}
