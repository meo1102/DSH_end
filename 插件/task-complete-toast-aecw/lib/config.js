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
    fontSize: 12,
    cardWidth: null,
    backgroundColor: null,
    textColor: null,
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
      fontSize: 12,
      cardWidth: null,
      backgroundColor: null,
      textColor: null,
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

  // G4：字号边界 12–18 px；越小越难读，越大越容易截断（最小宽度随字号联动）。
  if (appearance.fontSize !== undefined) {
    if (!Number.isInteger(appearance.fontSize) || appearance.fontSize < 12 || appearance.fontSize > 18) {
      push(['appearance', 'fontSize'], 'appearance.fontSize must be an integer between 12 and 18');
    } else {
      result.appearance.fontSize = appearance.fontSize;
    }
  }

  // G4：卡片宽度 280–480 px；null 表示“跟随 size 预设”（compact 300 / standard 360）。
  if (appearance.cardWidth !== undefined) {
    if (appearance.cardWidth === null) {
      result.appearance.cardWidth = null;
    } else if (!Number.isInteger(appearance.cardWidth) || appearance.cardWidth < 280 || appearance.cardWidth > 480) {
      push(['appearance', 'cardWidth'], 'appearance.cardWidth must be null or an integer between 280 and 480');
    } else {
      result.appearance.cardWidth = appearance.cardWidth;
    }
  }

  // G4：颜色白名单——只接受 #RRGGBB；null 表示跟随主题 token。禁止任意 CSS。
  for (const key of ['backgroundColor', 'textColor']) {
    if (appearance[key] === undefined) continue;
    if (appearance[key] === null) {
      result.appearance[key] = null;
    } else if (typeof appearance[key] !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(appearance[key])) {
      push(['appearance', key], `appearance.${key} must be null or a #RRGGBB color`);
    } else {
      result.appearance[key] = appearance[key];
    }
  }

  // G4：最小宽度随字号联动；手工写 patch 也要遵守，不只靠设置页。
  if (Number.isInteger(result.appearance.cardWidth)) {
    const minWidth = Math.max(280, result.appearance.fontSize * 18);
    if (result.appearance.cardWidth < minWidth) {
      push(['appearance', 'cardWidth'], `appearance.cardWidth must be >= ${minWidth} for fontSize ${result.appearance.fontSize}`);
    }
  }

  // G4：自定义背景/文字色必须满足 4.5:1；只设一色时无法计算，交给设置页/真机守卫。
  if (result.appearance.backgroundColor !== null && result.appearance.textColor !== null) {
    if (contrastRatio(result.appearance.backgroundColor, result.appearance.textColor) < 4.5) {
      push(['appearance', 'textColor'], 'appearance colors must have contrast >= 4.5:1');
    }
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
    fontSize: config.appearance.fontSize,
    cardWidth: config.appearance.cardWidth,
    backgroundColor: config.appearance.backgroundColor,
    textColor: config.appearance.textColor,
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
        fontSize: {
          type: 'integer',
          minimum: 12,
          maximum: 18,
          default: 12,
          description: '正文字号（px）；标题 = 字号 + 1；12–18',
        },
        cardWidth: {
          type: ['integer', 'null'],
          minimum: 280,
          maximum: 480,
          default: null,
          description: '卡片宽度（px）；null 跟随 size 预设；最小宽度随字号联动',
        },
        backgroundColor: {
          type: ['string', 'null'],
          pattern: '^#[0-9A-Fa-f]{6}$',
          default: null,
          description: '卡片背景色 #RRGGBB；null 跟随主题 token',
        },
        textColor: {
          type: ['string', 'null'],
          pattern: '^#[0-9A-Fa-f]{6}$',
          default: null,
          description: '卡片文字色 #RRGGBB；null 跟随主题 token',
        },
      },
    },
  },
  default: CONFIG_DEFAULTS,
};

/** G4：只接受 #RRGGBB；禁止任意 CSS。 */
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** #RRGGBB → [r,g,b]（0–255）；非法返回 undefined。 */
export function parseHexColor(value) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return undefined;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

/** WCAG 相对亮度。 */
export function relativeLuminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 对比度（1–21）；任一颜色非法返回 1（视为不可读）。 */
export function contrastRatio(a, b) {
  const pa = parseHexColor(a);
  const pb = parseHexColor(b);
  if (pa === undefined || pb === undefined) return 1;
  const la = relativeLuminance(pa);
  const lb = relativeLuminance(pb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * 设置路由的补丁校验：只接受 G4 白名单字段（字号/宽度/颜色），
 * 未知字段拒绝；null 表示“跟随默认/主题”。
 */
export function validateAppearancePatch(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { issues: [{ path: [], message: 'settings must be an object' }] };
  }
  const allowed = new Set(['fontSize', 'cardWidth', 'backgroundColor', 'textColor']);
  const issues = [];
  const value = {};
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) issues.push({ path: [key], message: `unknown setting: ${key}` });
  }
  if (patch.fontSize !== undefined) {
    if (!Number.isInteger(patch.fontSize) || patch.fontSize < 12 || patch.fontSize > 18) {
      issues.push({ path: ['fontSize'], message: 'fontSize must be an integer between 12 and 18' });
    } else value.fontSize = patch.fontSize;
  }
  if (patch.cardWidth !== undefined) {
    if (patch.cardWidth === null) value.cardWidth = null;
    else if (!Number.isInteger(patch.cardWidth) || patch.cardWidth < 280 || patch.cardWidth > 480) {
      issues.push({ path: ['cardWidth'], message: 'cardWidth must be null or an integer between 280 and 480' });
    } else value.cardWidth = patch.cardWidth;
  }
  for (const key of ['backgroundColor', 'textColor']) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) value[key] = null;
    else if (typeof patch[key] !== 'string' || !HEX_COLOR.test(patch[key])) {
      issues.push({ path: [key], message: `${key} must be null or #RRGGBB` });
    } else value[key] = patch[key];
  }
  if (value.fontSize !== undefined && value.cardWidth !== undefined && value.cardWidth !== null) {
    const minWidth = Math.max(280, value.fontSize * 18);
    if (value.cardWidth < minWidth) {
      issues.push({ path: ['cardWidth'], message: `cardWidth must be >= ${minWidth} for fontSize ${value.fontSize}` });
    }
  }
  return issues.length > 0 ? { issues } : { value };
}
