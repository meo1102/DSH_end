import { Config, buildClientConfig } from './lib/config.js';
import { createOutcomeTable } from './lib/outcome-table.js';
import { createRouteHandler, toOutcomeEntry } from './lib/host.js';

/** 配置注入行的全局名（§7.2 / C04）。 */
const INJECTION_NAME = '__DSH_TASK_COMPLETE_TOAST__';

export { Config };

/** 路由需要 webServer 服务（Cordis 硬依赖）。 */
export const inject = ['webServer'];

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

  ctx.effect(registerInjection);
}
