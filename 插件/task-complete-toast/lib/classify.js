/**
 * `turn/end` 原因 → 结果分类（§7.4 全 8 行）。
 * 纯函数，不读会话内容、不写日志。
 *
 * @param {object|undefined} reason `turn/end` 的 reason 联合
 * @returns {{outcome: string, reasonKind: string, cancelCause: string|null}}
 */
export function classify(reason) {
  const kind = reason?.kind;

  switch (kind) {
    case 'completed':
      return { outcome: 'completed', reasonKind: 'completed', cancelCause: null };
    case 'error':
      return { outcome: 'error', reasonKind: 'error', cancelCause: null };
    case 'max-tokens':
      return { outcome: 'interrupted', reasonKind: 'max-tokens', cancelCause: null };
    case 'blocked':
      return { outcome: 'blocked', reasonKind: 'blocked', cancelCause: null };
    case 'interrupted':
      return { outcome: 'interrupted', reasonKind: 'interrupted', cancelCause: null };
    case 'forked':
      return { outcome: 'ignored', reasonKind: 'forked', cancelCause: null };
    case 'aborted': {
      const cause = normalizeCause(reason?.reason);
      if (cause === 'user') {
        return { outcome: 'suppressed', reasonKind: 'aborted', cancelCause: 'user' };
      }
      return { outcome: 'stopped', reasonKind: 'aborted', cancelCause: cause };
    }
    default:
      // 未知原因（未来新增分支）不误报完成，也不让宿主抛错。
      return {
        outcome: 'ignored',
        reasonKind: typeof kind === 'string' ? kind : 'unknown',
        cancelCause: null,
      };
  }
}

function normalizeCause(reason) {
  if (typeof reason === 'string') return reason;
  if (reason !== null && typeof reason === 'object' && typeof reason.kind === 'string') return reason.kind;
  return 'legacy';
}
