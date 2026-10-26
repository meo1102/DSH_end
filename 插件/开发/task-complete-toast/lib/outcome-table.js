/**
 * 有界结果表：按 sessionId 覆盖写，Map 插入顺序 = 最旧在前（LRU），
 * 读取时惰性 TTL 过期。不启动任何后台定时器。
 *
 * @param {number} limit 最大条数（Config 保证 32-1024）
 * @param {number} ttlMs 表项 TTL（毫秒）
 * @param {() => number} now 当前时间（测试注入假时钟）
 */
export function createOutcomeTable(limit, ttlMs, now = Date.now) {
  const entries = new Map();

  function evictOldest() {
    while (entries.size > limit) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
  }

  return {
    /** 写入一条结果；同 sessionId 覆盖并刷新为最近使用。 */
    put(entry) {
      if (entry === null || typeof entry !== 'object') return;
      if (typeof entry.sessionId !== 'string' || entry.sessionId.length === 0) return;
      entries.delete(entry.sessionId);
      entries.set(entry.sessionId, entry);
      evictOldest();
    },

    /** 读取结果；超过 TTL 时删除并返回 undefined。 */
    get(sessionId) {
      const entry = entries.get(sessionId);
      if (entry === undefined) return undefined;
      if (now() - entry.at > ttlMs) {
        entries.delete(sessionId);
        return undefined;
      }
      // 命中刷新 LRU 顺序；TTL 仍以 entry.at 计算。
      entries.delete(sessionId);
      entries.set(sessionId, entry);
      return entry;
    },

    size() {
      return entries.size;
    },
  };
}
