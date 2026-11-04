/**
 * 宿主配置：零依赖手写 Standard Schema（ADR-008）。
 *
 * Cordis 只调用 `Config['~standard'].validate(config)`；纯 JSON Schema 没有
 * `~standard`，会在激活时抛错。因此这里同时提供：
 * - `~standard.validate`：默认值、类型、范围校验（未知键忽略）；
 * - `type/properties/default`：给配置面板与人类读者的描述字段。
 */

/** 客户端需要的 routePath 默认值，与 §7.1 的 `bridge.routePath` 一致。 */
export const DEFAULT_ROUTE_PATH = '/dsh-task-complete/outcome';

/** 宿主配置默认值（§7.1）；每次校验返回新对象，避免调用方改到共享常量。 */
export const CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  bridge: Object.freeze({
    enabled: true,
    routePath: DEFAULT_ROUTE_PATH,
    routeKind: 'exact',
    ringSize: 256,
    entryTtlMs: 600000,
    exposeReason: true,
  }),
  notify: Object.freeze({
    awaiting: true,
  }),
  appearance: Object.freeze({
    position: 'bottom-right',
    theme: 'system',
    size: 'standard',
    durationMs: 5000,
    showTitle: true,
  }),
});

function defaults() {
  return {
    enabled: true,
    bridge: {
      enabled: true,
      routePath: DEFAULT_ROUTE_PATH,
      routeKind: 'exact',
      ringSize: 256,
      entryTtlMs: 600000,
      exposeReason: true,
    },
    notify: {
      awaiting: true,
    },
    appearance: {
      position: 'bottom-right',
      theme: 'system',
      size: 'standard',
      durationMs: 5000,
      showTitle: true,
    },
  };
}

/** 校验并归一化宿主配置；返回 Standard Schema 的 `{ value }` 或 `{ issues }`。 */
export function validate(value) {
  const issues = [];
  const push = (path, message) => issues.push({ message, path });

  if (value === undefined) value = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { issues: [{ message: 'config must be an object', path: [] }] };
  }

  const result = defaults();

  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') push(['enabled'], 'enabled must be a boolean');
    else result.enabled = value.enabled;
  }

  let bridge = value.bridge;
  if (bridge === undefined) {
    bridge = {};
  } else if (bridge === null || typeof bridge !== 'object' || Array.isArray(bridge)) {
    push(['bridge'], 'bridge must be an object');
    bridge = {};
  }

  if (bridge.enabled !== undefined) {
    if (typeof bridge.enabled !== 'boolean') push(['bridge', 'enabled'], 'bridge.enabled must be a boolean');
    else result.bridge.enabled = bridge.enabled;
  }

  if (bridge.routePath !== undefined) {
    if (typeof bridge.routePath !== 'string') {
      push(['bridge', 'routePath'], 'bridge.routePath must be a string');
    } else if (!bridge.routePath.startsWith('/')) {
      push(['bridge', 'routePath'], 'bridge.routePath must start with "/"');
    } else if (bridge.routePath.length < 8 || bridge.routePath.length > 120) {
      push(['bridge', 'routePath'], 'bridge.routePath length must be 8-120');
    } else {
      result.bridge.routePath = bridge.routePath;
    }
  }

  if (bridge.routeKind !== undefined) {
    if (bridge.routeKind !== 'exact' && bridge.routeKind !== 'prefix') {
      push(['bridge', 'routeKind'], 'bridge.routeKind must be "exact" or "prefix"');
    } else {
      result.bridge.routeKind = bridge.routeKind;
    }
  }

  if (bridge.ringSize !== undefined) {
    if (!Number.isInteger(bridge.ringSize) || bridge.ringSize < 32 || bridge.ringSize > 1024) {
      push(['bridge', 'ringSize'], 'bridge.ringSize must be an integer between 32 and 1024');
    } else {
      result.bridge.ringSize = bridge.ringSize;
    }
  }

  if (bridge.entryTtlMs !== undefined) {
    if (!Number.isInteger(bridge.entryTtlMs) || bridge.entryTtlMs < 60000 || bridge.entryTtlMs > 3600000) {
      push(['bridge', 'entryTtlMs'], 'bridge.entryTtlMs must be an integer between 60000 and 3600000');
    } else {
      result.bridge.entryTtlMs = bridge.entryTtlMs;
    }
  }

  if (bridge.exposeReason !== undefined) {
    if (typeof bridge.exposeReason !== 'boolean') push(['bridge', 'exposeReason'], 'bridge.exposeReason must be a boolean');
    else result.bridge.exposeReason = bridge.exposeReason;
  }

  let notify = value.notify;
  if (notify === undefined) {
    notify = {};
  } else if (notify === null || typeof notify !== 'object' || Array.isArray(notify)) {
    push(['notify'], 'notify must be an object');
    notify = {};
  }

  if (notify.awaiting !== undefined) {
    if (typeof notify.awaiting !== 'boolean') push(['notify', 'awaiting'], 'notify.awaiting must be a boolean');
    else result.notify.awaiting = notify.awaiting;
  }

  let appearance = value.appearance;
  if (appearance === undefined) {
    appearance = {};
  } else if (appearance === null || typeof appearance !== 'object' || Array.isArray(appearance)) {
    push(['appearance'], 'appearance must be an object');
    appearance = {};
  }

  if (appearance.position !== undefined) {
    if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(appearance.position)) {
      push(['appearance', 'position'], 'appearance.position must be one of four corners');
    } else {
      result.appearance.position = appearance.position;
    }
  }

  if (appearance.theme !== undefined) {
    if (!['system', 'light', 'dark'].includes(appearance.theme)) {
      push(['appearance', 'theme'], 'appearance.theme must be "system", "light" or "dark"');
    } else {
      result.appearance.theme = appearance.theme;
    }
  }

  if (appearance.size !== undefined) {
    if (appearance.size !== 'compact' && appearance.size !== 'standard') {
      push(['appearance', 'size'], 'appearance.size must be "compact" or "standard"');
    } else {
      result.appearance.size = appearance.size;
    }
  }

  if (appearance.durationMs !== undefined) {
    if (!Number.isInteger(appearance.durationMs) || appearance.durationMs < 2000 || appearance.durationMs > 15000) {
      push(['appearance', 'durationMs'], 'appearance.durationMs must be an integer between 2000 and 15000');
    } else {
      result.appearance.durationMs = appearance.durationMs;
    }
  }

  if (appearance.showTitle !== undefined) {
    if (typeof appearance.showTitle !== 'boolean') push(['appearance', 'showTitle'], 'appearance.showTitle must be a boolean');
    else result.appearance.showTitle = appearance.showTitle;
  }

  return issues.length > 0 ? { issues } : { value: result };
}

/**
 * 注入行的客户端投影（ADR-009）：客户端只读这些字段，
 * 不外泄 ringSize / entryTtlMs / routeKind / exposeReason。
 * @param {object} config 已归一化的宿主配置
 */
export function buildClientConfig(config) {
  return {
    enabled: config.enabled,
    bridge: config.bridge.enabled ? 'auto' : 'off',
    routePath: config.bridge.routePath,
    awaiting: config.notify.awaiting,
    position: config.appearance.position,
    theme: config.appearance.theme,
    size: config.appearance.size,
    durationMs: config.appearance.durationMs,
    showTitle: config.appearance.showTitle,
  };
}

/** §7.1 配置的 Standard Schema 导出。 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'task-complete-toast',
    validate,
  },
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      default: true,
      description: '总开关；关时只注入配置行',
    },
    bridge: {
      type: 'object',
      default: {
        enabled: true,
        routePath: DEFAULT_ROUTE_PATH,
        routeKind: 'exact',
        ringSize: 256,
        entryTtlMs: 600000,
        exposeReason: true,
      },
      properties: {
        enabled: {
          type: 'boolean',
          default: true,
          description: '关时客户端总走启发式',
        },
        routePath: {
          type: 'string',
          default: DEFAULT_ROUTE_PATH,
          minLength: 8,
          maxLength: 120,
          pattern: '^/',
          description: '结果路由路径；冲突时改这里',
        },
        routeKind: {
          type: 'string',
          enum: ['exact', 'prefix'],
          default: 'exact',
        },
        ringSize: {
          type: 'integer',
          minimum: 32,
          maximum: 1024,
          default: 256,
          description: '结果表容量',
        },
        entryTtlMs: {
          type: 'integer',
          minimum: 60000,
          maximum: 3600000,
          default: 600000,
          description: '结果表 TTL（毫秒）',
        },
        exposeReason: {
          type: 'boolean',
          default: true,
          description: '关时响应只含 sessionId / outcome / at',
        },
      },
    },
    notify: {
      type: 'object',
      default: {
        awaiting: true,
      },
      properties: {
        awaiting: {
          type: 'boolean',
          default: true,
          description: 'G2 授权/确认提醒开关；关时不订阅 pendingInteraction',
        },
      },
    },
    appearance: {
      type: 'object',
      default: {
        position: 'bottom-right',
        theme: 'system',
        size: 'standard',
        durationMs: 5000,
        showTitle: true,
      },
      properties: {
        position: {
          type: 'string',
          enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
          default: 'bottom-right',
          description: '弹窗四角位置',
        },
        theme: {
          type: 'string',
          enum: ['system', 'light', 'dark'],
          default: 'system',
          description: 'system 跟随主题；light/dark 使用作用域调色板',
        },
        size: {
          type: 'string',
          enum: ['compact', 'standard'],
          default: 'standard',
          description: '紧凑 / 标准',
        },
        durationMs: {
          type: 'integer',
          minimum: 2000,
          maximum: 15000,
          default: 5000,
          description: '完成提示停留时长（毫秒）；常驻提醒不受影响',
        },
        showTitle: {
          type: 'boolean',
          default: true,
          description: '是否显示标题行',
        },
      },
    },
  },
  default: CONFIG_DEFAULTS,
};
