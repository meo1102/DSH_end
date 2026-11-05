import { Config, buildClientConfig } from './lib/config.js';
import { createOutcomeTable } from './lib/outcome-table.js';
import { createRouteHandler, createSettingsHandler, toOutcomeEntry } from './lib/host.js';

/** 配置注入行的全局名（§7.2 / C04）。 */
const INJECTION_NAME = '__DSH_TASK_COMPLETE_TOAST__';
const PACKAGE_NAME = '@local/task-complete-toast';
/** G4 设置路由：与结果桥分开，避免被 bridge.routePath 的自定义覆盖。 */
const SETTINGS_PATH = '/dsh-task-complete/settings';

export { Config };

/** 路由需要 webServer 服务（Cordis 硬依赖）；configEditor 是可选的设置写入路径。 */
export const inject = ['webServer'];

/**
 * A 方案持久化：找到本插件的 Loader entry，把 appearance 补丁并入当前配置，
 * 交给 configEditor 校验、持久化并走正常 Loader 路径。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} patch 已通过 validateAppearancePatch 的白名单补丁
 */
async function saveAppearance(ctx, patch) {
  const editor = typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined;
  if (editor === undefined || editor === null || typeof editor.edit !== 'function') {
    throw new Error('configEditor-unavailable');
  }
  const entries = editor.entries();
  const entry = entries.find((row) => row?.name === PACKAGE_NAME)
    ?? entries.find((row) => row?.id === 'include:task-complete-toast')
    ?? entries.find((row) => String(row?.options?.name ?? '').includes('task-complete-toast'));
  if (entry === undefined) throw new Error('entry-not-found');

  await editor.edit(entry, (current, inherited) => {
    const section = (key) => ({
      ...(inherited?.[key] ?? {}),
      ...(current?.[key] ?? {}),
    });
    return {
      ...(inherited ?? {}),
      ...(current ?? {}),
      bridge: section('bridge'),
      notify: section('notify'),
      appearance: { ...section('appearance'), ...patch },
    };
  });
  return patch;
}

/**
 * 宿主半区：结果表 + 路由 + 配置注入，全部由 ctx.effect 持有并清理。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config 已由 Loader 校验的配置；直接调用时也接受缺省/部分配置
 */
export function apply(ctx, config) {
  const validation = Config['~standard'].validate(config);
  if (validation.issues) {
    const details = validation.issues
      .map((issue) => {
        const prefix = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${prefix}${issue.message}`;
      })
      .join('; ');
    throw new TypeError(`task-complete-toast: invalid config: ${details}`);
  }

  const current = validation.value;
  const state = { disposed: false };
  const table = createOutcomeTable(current.bridge.ringSize, current.bridge.entryTtlMs);

  /** 注入行在 enabled:false 时也要注册（§6.3 第 1 步）。 */
  function registerInjection() {
    const off = ctx.on('webserver/index-inject', (rows) => {
      if (state.disposed) return;
      rows.push({
        kind: 'global',
        name: INJECTION_NAME,
        value: buildClientConfig(current),
      });
    });
    return () => {
      state.disposed = true;
      off();
    };
  }

  if (current.enabled === false) {
    ctx.effect(registerInjection);
    return;
  }

  ctx.effect(() => {
    const off = ctx.on('session/event', (session, event) => {
      if (state.disposed) return;
      const entry = toOutcomeEntry(session, event);
      if (entry !== undefined) table.put(entry);
    });
    return () => {
      state.disposed = true;
      off();
    };
  });

  ctx.effect(() => {
    const off = ctx.webServer.register({
      kind: current.bridge.routeKind,
      path: current.bridge.routePath,
      handler: createRouteHandler({
        table,
        exposeReason: current.bridge.exposeReason,
      }),
    });
    return () => {
      state.disposed = true;
      off();
    };
  });

  // G4：外观设置保存路由（A 方案：宿主 configEditor）。
  ctx.effect(() => {
    const off = ctx.webServer.register({
      kind: 'exact',
      path: SETTINGS_PATH,
      handler: createSettingsHandler({ save: (patch) => saveAppearance(ctx, patch) }),
    });
    return off;
  });

  ctx.effect(registerInjection);
}
