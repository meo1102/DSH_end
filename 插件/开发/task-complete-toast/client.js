/**
 * 客户端半区：WP2 Store 纯逻辑 + WP3 渲染层（ToastHost/卡片/内联样式）
 * + WP4 通知纯逻辑 + WP5 结果桥 + WP6a 真实接线（locale/config/store/resolver）。
 * 多标签留给 WP8；notifier 接线、D1–D4 与 suppressWhenFocused 留给 WP6b。
 */
window.__ModuleLoader__.load({
  id: '@local/task-complete-toast',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** 语言命名空间（§7.7）。 */
    const LOCALE_NS = 'taskCompleteToast';

    /** 运行时中文字典（§7.7，键一字不改）。 */
    const zh = Object.freeze({
      titleCompleted: '任务完成',
      titleError: '任务失败',
      titleStopped: '任务已停止',
      titleInterrupted: '任务已中断',
      titleBlocked: '任务被阻止',
      statusIdle: '待执行',
      statusRunning: '执行中',
      statusAwaitingAnswer: '等待回答',
      statusAwaitingApproval: '等待审批',
      fallbackWorkspace: '未分组',
      fallbackSession: '未命名会话',
      actionView: '查看',
      actionClose: '关闭提示',
      format: '{workspace}[{session}] · {status}',
    });

    /** 运行时英文字典（§7.7）。 */
    const en = Object.freeze({
      titleCompleted: 'Task completed',
      titleError: 'Task failed',
      titleStopped: 'Task stopped',
      titleInterrupted: 'Task interrupted',
      titleBlocked: 'Task blocked',
      statusIdle: 'Idle',
      statusRunning: 'Running',
      statusAwaitingAnswer: 'Awaiting answer',
      statusAwaitingApproval: 'Awaiting approval',
      fallbackWorkspace: 'Ungrouped',
      fallbackSession: 'Untitled session',
      actionView: 'View',
      actionClose: 'Dismiss',
      format: '{workspace}[{session}] · {status}',
    });

    /** 客户端配置兜底（§7.2）；WP6a 用注入值按字段类型覆盖。 */
    const DEFAULTS = Object.freeze({
      enabled: true,
      routePath: '/dsh-task-complete/outcome',
      position: 'bottom-right',
      maxVisible: 3,
      durationMs: 5000,
      minRunMs: 1500,
      coalesceMs: 250,
      cooldownMs: 3000,
      showTitle: true,
      systemNotification: 'auto',
      suppressWhenFocused: false,
      maxPerMinute: 6,
      resolveBudgetMs: 200,
      claimWindowMs: 80,
      bridge: 'auto',
    });

    /** 客户端字段的类型守卫；类型或取值不符时整字段忽略（§7.2 / ADR-009）。 */
    const CONFIG_GUARDS = Object.freeze({
      enabled: (value) => typeof value === 'boolean',
      routePath: (value) => typeof value === 'string' && value.startsWith('/'),
      position: (value) => value === 'bottom-right' || value === 'bottom-left',
      maxVisible: (value) => isFiniteNumber(value),
      durationMs: (value) => isFiniteNumber(value),
      minRunMs: (value) => isFiniteNumber(value),
      coalesceMs: (value) => isFiniteNumber(value),
      cooldownMs: (value) => isFiniteNumber(value),
      showTitle: (value) => typeof value === 'boolean',
      systemNotification: (value) => value === 'auto' || value === 'always' || value === 'never',
      suppressWhenFocused: (value) => typeof value === 'boolean',
      maxPerMinute: (value) => isFiniteNumber(value),
      resolveBudgetMs: (value) => isFiniteNumber(value),
      claimWindowMs: (value) => isFiniteNumber(value),
      bridge: (value) => value === 'auto' || value === 'off',
    });

    function isFiniteNumber(value) {
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    }

    /**
     * V13：Windows/Electron 的 web 通知 tag 超过 34 字符即失效
     * （electron/electron#40433；WinRT `ToastNotification.Tag` 另有 64 字符上限）。
     * 用两个不同种子的 FNV-1a 32 位拼成 16 位十六进制，前缀 9 + 16 = 25 字符；
     * 纯函数、零依赖、确定性，同一 key 恒得同一 tag，不同 key 近似唯一。
     */
    function hash16(value) {
      const text = typeof value === 'string' ? value : '';
      const fnv = (seed) => {
        let hash = seed >>> 0;
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash >>> 0;
      };
      const first = fnv(0x811c9dc5);
      const second = fnv(0x9e3779b9);
      return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
    }

    /**
     * 读取注入的客户端配置（§7.2 / ADR-009）：只认已知字段，逐字段校验，
     * 类型不符或读取异常时忽略该字段，绝不抛错。
     */
    function readClientConfig(win) {
      try {
        const raw = win?.__DSH_TASK_COMPLETE_TOAST__;
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
        const config = {};
        for (const key of Object.keys(CONFIG_GUARDS)) {
          const value = raw[key];
          if (CONFIG_GUARDS[key](value)) config[key] = value;
        }
        return config;
      } catch {
        return {};
      }
    }

    /** 子代理标记的尽力探测；V-2 未证实，拿不到就不过滤。 */
    function isSubagentRow(row) {
      if (row === null || typeof row !== 'object') return false;
      if (row.subagent === true || row.isSubagent === true) return true;
      if (row.origin === 'subagent' || row.kind === 'subagent') return true;
      if (row.header?.origin === 'subagent') return true;
      return false;
    }

    /** 去掉首尾空白；空串/非字符串视为缺失。 */
    function cleanName(value) {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    /** 把 useWorkspaces 的 `items` / byId / 裸数组快照统一成数组。 */
    function workspaceList(snapshot) {
      if (Array.isArray(snapshot)) return snapshot;
      if (snapshot === null || typeof snapshot !== 'object') return [];
      // V03 真机形状：WorkspaceSnapshot.items 是 WorkspaceView[]。
      if (Array.isArray(snapshot.items)) return snapshot.items;
      const byId = snapshot.byId;
      if (byId !== null && typeof byId === 'object') {
        if (typeof byId.get === 'function') return [...byId.values()];
        if (Array.isArray(snapshot.ids)) return snapshot.ids.map((id) => byId[id]).filter(Boolean);
        return Object.values(byId);
      }
      if (Array.isArray(snapshot.workspaces)) return snapshot.workspaces;
      return [];
    }

    /** V-3 未证实：兼容 sessionIds 数组/Set 与 sessions 数组。 */
    function workspaceHasSession(workspace, sessionId) {
      const ids = workspace?.sessionIds;
      if (Array.isArray(ids)) return ids.includes(sessionId);
      if (ids !== null && typeof ids === 'object' && typeof ids.has === 'function') return ids.has(sessionId);
      if (Array.isArray(workspace?.sessions)) {
        return workspace.sessions.some((entry) => entry === sessionId || entry?.id === sessionId);
      }
      return false;
    }

    /** 工作区名：title → path 末段（V03 真机 WorkspaceView 无 name）；都没有返回 undefined。 */
    function workspaceTitle(workspace) {
      if (workspace === null || typeof workspace !== 'object') return undefined;
      const title = cleanName(workspace.title);
      if (title !== undefined) return title;
      const path = cleanName(workspace.path);
      if (path === undefined) return undefined;
      const parts = path.split(/[\\/]+/).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : undefined;
    }

    function sessionRow(snapshot, sessionId) {
      const byId = snapshot?.byId;
      if (byId !== null && typeof byId === 'object') {
        if (typeof byId.get === 'function') return byId.get(sessionId);
        return byId[sessionId];
      }
      if (Array.isArray(snapshot)) return snapshot.find((row) => row?.id === sessionId);
      return undefined;
    }

    /**
     * 名称解析：先按 sessionIds 找工作区，再取会话显示名；
     * 缺值返回 undefined，由 formatLine 落到回退文案。
     * 会话名优先 displayTitle（界面实际显示的值），缺失再回退 title。
     */
    function resolveNames(workspacesSnapshot, sessionsSnapshot, sessionId) {
      const workspace = workspaceList(workspacesSnapshot)
        .find((candidate) => workspaceHasSession(candidate, sessionId));
      const row = sessionRow(sessionsSnapshot, sessionId);
      return {
        workspace: workspaceTitle(workspace),
        session: cleanName(row?.displayTitle) ?? cleanName(row?.title),
      };
    }

    /** `{workspace}[{session}] · {status}`；缺值落回退文案，不截断长文本。 */
    function formatLine(t, workspace, session, status) {
      const translate = typeof t === 'function' ? t : (key) => key;
      const ws = cleanName(workspace) ?? translate('fallbackWorkspace');
      const ss = cleanName(session) ?? translate('fallbackSession');
      const st = cleanName(status) ?? translate('statusIdle');
      const formatted = translate('format', { workspace: ws, session: ss, status: st });

      if (typeof formatted === 'string' && formatted !== 'format') {
        return formatted
          .replace('{workspace}', ws)
          .replace('{session}', ss)
          .replace('{status}', st);
      }
      return `${ws}[${ss}] · ${st}`;
    }

    const TITLE_KEYS = Object.freeze({
      completed: 'titleCompleted',
      error: 'titleError',
      stopped: 'titleStopped',
      interrupted: 'titleInterrupted',
      blocked: 'titleBlocked',
    });

    /** 未知 outcome（含 pending）按 §7.5 归到 completed。 */
    function titleOf(t, outcome) {
      const translate = typeof t === 'function' ? t : (key) => key;
      return translate(TITLE_KEYS[outcome] ?? 'titleCompleted');
    }

    /**
     * ADR-013 消失计时器：start 起算完整 durationMs；enter 取消计时（held）；
     * leave 从零重新起算完整 durationMs，不保留剩余时间。
     *
     * @param {{now?: () => number, setTimeout: Function, clearTimeout: Function}} env
     * @param {number} durationMs
     * @param {() => void} onExpire
     */
    function createDismissTimer(env, durationMs, onExpire) {
      // 真实 window 没有 now；timers 也可能是精简对象。缺什么就回落，绝不抛错。
      const scheduleTimer = typeof env?.setTimeout === 'function'
        ? (callback, ms) => env.setTimeout(callback, ms)
        : (callback, ms) => (typeof setTimeout === 'function' ? setTimeout(callback, ms) : 0);
      const cancelTimer = typeof env?.clearTimeout === 'function'
        ? (id) => env.clearTimeout(id)
        : (id) => {
          if (typeof clearTimeout === 'function') clearTimeout(id);
        };
      const full = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
      let timer = null;
      let disposed = false;
      let fired = false;
      let started = false;
      let held = false;

      function clear() {
        if (timer !== null) {
          cancelTimer(timer);
          timer = null;
        }
      }

      function fire() {
        timer = null;
        if (disposed || fired) return;
        fired = true;
        held = false;
        onExpire();
      }

      function scheduleFull() {
        timer = scheduleTimer(fire, full);
      }

      function start() {
        if (started || disposed || fired) return;
        started = true;
        held = false;
        scheduleFull();
      }

      function enter() {
        if (!started || disposed || fired || held) return;
        held = true;
        clear();
      }

      function leave() {
        if (!started || disposed || fired || !held) return;
        held = false;
        // ADR-013：移出/失焦后重新等待完整 durationMs，不是恢复剩余时间。
        scheduleFull();
      }

      function dispose() {
        disposed = true;
        clear();
      }

      return { start, enter, leave, dispose };
    }

    /**
     * 页面加载时生成一次的 tabId（ADR-011）：优先 crypto.randomUUID，
     * 不可用时回落到时间戳+随机串。只用于认领比较，不含会话内容。
     */
    function createTabId(env) {
      const cryptoObj = env?.crypto;
      try {
        if (typeof cryptoObj?.randomUUID === 'function') {
          const value = cryptoObj.randomUUID();
          if (typeof value === 'string' && value.length > 0) return value;
        }
      } catch {
        // 权限/实现差异：回落。
      }
      const random = Math.random().toString(36).slice(2, 10);
      return `${Date.now().toString(36)}-${random}`;
    }

    /**
     * R2 多标签认领租约（ADR-011 / §7.6）。
     *
     * - 频道 `dsh-task-complete-toast/v1`，消息 `{v:1,type:'claim',sessionId,tabId,at}`；
     * - 同一 sessionId 在认领窗内收到的 claim 中，tabId 字典序最小者胜出；
     *   自己的消息忽略；无 BroadcastChannel 恒胜；
     * - 频道在租约创建（页面加载）时打开，避免“晚结算的标签看不到早结算的
     *   广播”导致双弹；最近 claim 缓存只用于覆盖窗口前后的并发竞态；
     * - reset 关闭频道并清理在途计时器，下一次 claim 重新打开；dispose 永久关闭。
     *
     * @param {{BroadcastChannel?: Function, crypto?: object, now?: () => number,
     *          setTimeout: Function, clearTimeout: Function, tabId?: string}} env
     * @param {object} [config]
     */
    function createClaimLease(env, config) {
      const settings = { ...DEFAULTS, ...(config ?? {}) };
      const windowMs = Number.isFinite(settings.claimWindowMs) && settings.claimWindowMs >= 0
        ? settings.claimWindowMs
        : DEFAULTS.claimWindowMs;
      const now = typeof env?.now === 'function' ? () => env.now() : () => Date.now();
      const scheduleTimer = typeof env?.setTimeout === 'function'
        ? (callback, ms) => env.setTimeout(callback, ms)
        : (callback, ms) => (typeof setTimeout === 'function' ? setTimeout(callback, ms) : 0);
      const cancelTimer = typeof env?.clearTimeout === 'function'
        ? (id) => env.clearTimeout(id)
        : (id) => {
          if (typeof clearTimeout === 'function') clearTimeout(id);
        };
      const channelName = 'dsh-task-complete-toast/v1';
      const Channel = typeof env?.BroadcastChannel === 'function' ? env.BroadcastChannel : undefined;
      const tabId = typeof env?.tabId === 'string' && env.tabId.length > 0
        ? env.tabId
        : createTabId(env);
      const pending = new Map(); // sessionId → 在途认领
      const recent = new Map(); // sessionId → 最近看到的其他 tab（覆盖窗口前后竞态）
      let channel = null;
      let disposed = false;

      function openChannel() {
        if (channel !== null || disposed || typeof Channel !== 'function') return channel;
        try {
          channel = new Channel(channelName);
          if (channel !== null && typeof channel === 'object') {
            channel.onmessage = (event) => receive(event?.data);
          }
        } catch {
          channel = null;
        }
        return channel;
      }

      function pruneRecent(current) {
        for (const [sessionId, entry] of recent) {
          if (current - entry.at > windowMs) recent.delete(sessionId);
        }
      }

      function receive(message) {
        if (disposed || message === null || typeof message !== 'object') return;
        if (message.v !== 1 || message.type !== 'claim') return;
        const sessionId = message.sessionId;
        const otherTab = message.tabId;
        if (typeof sessionId !== 'string' || sessionId.length === 0) return;
        if (typeof otherTab !== 'string' || otherTab.length === 0) return;
        if (otherTab === tabId) return;

        const at = now();
        const entry = pending.get(sessionId);
        if (entry !== undefined && entry.done !== true) {
          if (entry.bestOther === undefined || otherTab < entry.bestOther) entry.bestOther = otherTab;
          // 已有更小的 tabId：本标签不可能胜出，立即判负。
          if (entry.bestOther < tabId) settle(sessionId, entry, false);
          return;
        }

        const previous = recent.get(sessionId);
        if (previous === undefined) {
          recent.set(sessionId, { tabId: otherTab, at });
          return;
        }
        previous.at = at;
        if (otherTab < previous.tabId) previous.tabId = otherTab;
      }

      function settle(sessionId, entry, won) {
        if (entry.done !== true) {
          entry.done = true;
          if (entry.timer !== null) {
            cancelTimer(entry.timer);
            entry.timer = null;
          }
          if (pending.get(sessionId) === entry) pending.delete(sessionId);
        }
        entry.resolve(won === true);
      }

      function claim(sessionId) {
        if (disposed) return Promise.resolve(false);
        if (typeof Channel !== 'function') return Promise.resolve(true);
        openChannel();
        if (channel === null) return Promise.resolve(true);

        const current = now();
        pruneRecent(current);
        const previous = recent.get(sessionId);
        const seed = previous !== undefined && current - previous.at <= windowMs
          ? previous.tabId
          : undefined;
        // 已知有更小的 tabId 时无需再广播，直接判负。
        if (seed !== undefined && seed < tabId) return Promise.resolve(false);

        const existing = pending.get(sessionId);
        if (existing !== undefined) settle(sessionId, existing, false);

        return new Promise((resolve) => {
          const entry = { resolve, timer: null, bestOther: seed, done: false };
          pending.set(sessionId, entry);
          entry.timer = scheduleTimer(() => {
            const won = !(entry.bestOther !== undefined && entry.bestOther < tabId);
            settle(sessionId, entry, won);
          }, windowMs);
          try {
            channel.postMessage({ v: 1, type: 'claim', sessionId, tabId, at: current });
          } catch {
            // 发送失败按“无通道”处理，避免因基础设施错误漏提示。
            settle(sessionId, entry, true);
          }
        });
      }

      /** 取消某个会话的在途认领；迟到的结果由 store 的 state/generation 守卫丢弃。 */
      function cancel(sessionId) {
        const entry = pending.get(sessionId);
        if (entry === undefined) return;
        settle(sessionId, entry, false);
      }

      function closeChannel() {
        if (channel === null) return;
        const current = channel;
        channel = null;
        try {
          current.close();
        } catch {
          // 关闭失败不影响后续重置。
        }
      }

      function reset() {
        for (const [sessionId, entry] of [...pending]) settle(sessionId, entry, false);
        pending.clear();
        recent.clear();
        closeChannel();
      }

      function dispose() {
        disposed = true;
        reset();
      }

      if (typeof Channel === 'function') openChannel();

      return {
        claim,
        cancel,
        reset,
        dispose,
        tabId,
        channelName,
        hasChannel: () => channel !== null,
      };
    }


    /**
     * 每会话状态机：unknown → running → settling(250ms) → decide → 队列。
     * 所有时间与调度均来自 env，store 不直接碰全局。
     *
     * @param {{
     *   now: () => number,
     *   setTimeout: (fn: Function, ms: number) => number,
     *   clearTimeout: (id: number) => void,
     *   list: object|(() => object),
     *   onStatus: (handler: (id: string, running: boolean) => void) => (() => void)|void,
     *   getBinding?: (id: string) => object|undefined,
     *   onEnqueued?: (item: object) => void
     * }} env
     * @param {object} [config]
     */
    function createStore(env, config) {
      const settings = { ...DEFAULTS, ...(config ?? {}) };
      // env 可能来自精简夹具/窗口；缺 now/timer 时回落，避免状态机抛错。
      const now = typeof env?.now === 'function' ? () => env.now() : () => Date.now();
      const scheduleTimer = typeof env?.setTimeout === 'function'
        ? (callback, ms) => env.setTimeout(callback, ms)
        : (callback, ms) => (typeof setTimeout === 'function' ? setTimeout(callback, ms) : 0);
      const cancelTimer = typeof env?.clearTimeout === 'function'
        ? (id) => env.clearTimeout(id)
        : (id) => {
          if (typeof clearTimeout === 'function') clearTimeout(id);
        };
      const states = new Map();
      const items = [];
      const listeners = new Set();
      const lastToastAt = new Map();
      const emittedAt = [];
      let snapshot = Object.freeze([]);
      let lastList = null;
      let keySeq = 0;
      let started = false;
      let stopStatus = null;

      function readList() {
        const source = env.list ?? lastList;
        const value = typeof source === 'function' ? source() : source;
        if (value !== null && typeof value === 'object' && typeof value.getSnapshot === 'function') {
          return value.getSnapshot();
        }
        return value;
      }

      function publish() {
        snapshot = Object.freeze(items.slice());
        for (const listener of [...listeners]) {
          try {
            listener(snapshot);
          } catch {
            // 单个订阅者异常不影响 store 与其他订阅者。
          }
        }
      }

      function clearSettle(state) {
        if (state !== undefined && state.timer !== undefined) {
          cancelTimer(state.timer);
          state.timer = undefined;
        }
      }

      /** 取消该会话在途结果解析（若存在）；abort 失败不影响状态机。 */
      function abortResolution(state) {
        if (state === undefined || state.controller === undefined || state.controller === null) return;
        const controller = state.controller;
        state.controller = undefined;
        try {
          controller.abort();
        } catch {
          // 尽力取消；结果仍会被 generation/state 守卫丢弃。
        }
      }

      /** resolver 只允许 §7.4 七值；其他值按 completed 降级。 */
      function normalizeResolvedOutcome(value) {
        return typeof value === 'string' && ROUTE_OUTCOMES.has(value) ? value : 'completed';
      }

      /**
       * 在 settling 起点并发发起结果解析（§8.4：与观察窗并行，不串行）。
       * 晚到结果必须同时通过 state 身份与 generation 守卫才能写回。
       */
      function startResolution(id, state, generation) {
        state.controller = undefined;
        state.resolutionPromise = null;
        if (typeof env.resolve !== 'function') {
          // 未注入 resolver 时保留旧行为（Item.outcome='pending'），便于单测独立使用 Store。
          state.resolution = { status: 'none' };
          return;
        }
        state.resolution = { status: 'pending', outcome: undefined };
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        state.controller = controller;
        let promise;
        try {
          promise = env.resolve(id, controller === null ? undefined : controller.signal);
        } catch {
          state.resolution = { status: 'done', outcome: 'completed' };
          return;
        }
        // 后台快路径等这个 Promise 完成后再 decide，避免把 error 降级成 completed。
        state.resolutionPromise = Promise.resolve(promise).then(
          (result) => {
            if (states.get(id) !== state || state.mode !== 'settling' || state.generation !== generation) return;
            state.resolution = { status: 'done', outcome: normalizeResolvedOutcome(result?.outcome) };
          },
          () => {
            if (states.get(id) !== state || state.mode !== 'settling' || state.generation !== generation) return;
            state.resolution = { status: 'done', outcome: 'completed' };
          },
        );
      }

      /** 取消该会话在途认领（若存在）；迟到结果由 state/generation 守卫丢弃。 */
      function cancelClaim(id, state) {
        if (state === undefined) return;
        const claim = state.claim;
        state.claim = { status: 'none' };
        if (claim === undefined || claim.status !== 'pending') return;
        if (typeof env.cancelClaim === 'function') {
          try {
            env.cancelClaim(id);
          } catch {
            // 取消失败不影响状态机；结果仍会被守卫丢弃。
          }
        }
      }

      /**
       * R2 / ADR-015：在 settling 起点与 resolver 并行发起认领（不 await、不串行）。
       * 未注入 claim / claim 抛错 → 视作胜出；未决时由 decide 等窗口结束再判定。
       */
      function startClaim(id, state, generation) {
        state.claim = { status: 'none' };
        state.claimStartedAt = undefined;
        state.claimWaited = false;
        state.awaitingClaim = false;
        if (typeof env.claim !== 'function') return;
        state.claim = { status: 'pending' };
        state.claimStartedAt = now();
        let promise;
        try {
          promise = env.claim(id);
        } catch {
          state.claim = { status: 'won' };
          return;
        }
        Promise.resolve(promise).then(
          (won) => settleClaim(id, state, generation, won === false ? 'lost' : 'won'),
          () => {
            // 认领基础设施错误按胜出处理（失败开放），不让底层异常吞掉提示。
            settleClaim(id, state, generation, 'won');
          },
        );
      }

      /**
       * ADR-015：认领结果到达。若 decide 正在等这个窗口，立刻二次判定，
       * 不必等满 remaining；否则只写结果，等 decide 读取。
       */
      function settleClaim(id, state, generation, status) {
        if (states.get(id) !== state || state.mode !== 'settling' || state.generation !== generation) return;
        state.claim = { status };
        if (state.awaitingClaim !== true) return;
        state.awaitingClaim = false;
        if (state.timer !== undefined) {
          cancelTimer(state.timer);
          state.timer = undefined;
        }
        decide(id, state);
      }

      /**
       * ADR-015：认领未决时保持 settling，延迟 remaining（≤ claimWindowMs）后
       * 再决定；claimWaited 标记防止二次判定再次延迟。延迟保存在 state.timer，
       * 由 running 回弹 / connection reset / 卸载统一取消。
       */
      function waitForClaim(id, state, generation, remaining) {
        state.mode = 'settling';
        state.claimWaited = true;
        state.awaitingClaim = true;
        state.timer = scheduleTimer(() => {
          if (states.get(id) !== state) return;
          if (state.mode !== 'settling' || state.generation !== generation) return;
          state.timer = undefined;
          state.awaitingClaim = false;
          decide(id, state);
        }, Math.min(remaining, settings.claimWindowMs));
      }

      /** decide 时读取结果：未注入 resolver → pending；仍在途 → 按 v1 降级 completed。 */
      function resolvedOutcome(state) {
        const resolution = state?.resolution;
        if (resolution === undefined || resolution.status === 'none') return 'pending';
        if (resolution.status === 'done') return resolution.outcome;
        return 'completed';
      }

      function hasPendingSubmissions(id) {
        if (typeof env.getBinding !== 'function') return false;
        try {
          const binding = env.getBinding(id);
          const snapshot = binding?.session?.getSnapshot?.();
          const pending = snapshot?.pendingSubmissions;
          return typeof pending?.length === 'number' && pending.length > 0;
        } catch {
          return false;
        }
      }

      function pruneEmissions(now) {
        const floor = now - 60000;
        while (emittedAt.length > 0 && emittedAt[0] < floor) emittedAt.shift();
      }

      function decide(id, state) {
        if (state.mode !== 'settling') return;

        state.mode = 'unknown';
        state.timer = undefined;
        state.awaitingClaim = false;
        const startedAt = state.startedAt;
        const nowMs = now();
        const list = readList();
        const row = list?.byId?.[id];
        const finish = () => {
          clearSettle(state);
          cancelClaim(id, state);
          abortResolution(state);
          states.delete(id);
        };

        // R2 / ADR-015：认领明确失败 → 直接结束；未决 → 先等窗口结束再判定。
        const claimStatus = state.claim?.status ?? 'none';
        if (claimStatus === 'lost') return finish();
        if (claimStatus === 'pending' && state.claimWaited !== true) {
          const claimStartedAt = typeof state.claimStartedAt === 'number' ? state.claimStartedAt : nowMs;
          const remaining = claimStartedAt + settings.claimWindowMs - nowMs;
          if (remaining > 0) {
            // 保持 settling，等满剩余窗口后二次判定；期间不入队。
            waitForClaim(id, state, state.generation, remaining);
            return;
          }
        }

        // §8.3 规则 1-8，顺序短路。
        if (state.sawRunning !== true) return finish();
        if (row === undefined) return finish();
        if (isSubagentRow(row)) return finish();
        if (hasPendingSubmissions(id)) return finish();
        if (nowMs - startedAt < settings.minRunMs) return finish();
        // D2：开启 suppressWhenFocused 且窗口聚焦时不入队，浮层与系统通知都不发。
        if (settings.suppressWhenFocused === true
          && typeof env.isFocused === 'function'
          && env.isFocused() === true) return finish();

        const previous = lastToastAt.get(id);
        if (previous !== undefined && nowMs - previous < settings.cooldownMs) return finish();

        pruneEmissions(nowMs);
        if (emittedAt.length >= settings.maxPerMinute) return finish();

        // 结果只影响“弹不弹/标题”，不改变 §8.3 的抑制判定。
        const outcome = resolvedOutcome(state);
        if (outcome === 'ignored' || outcome === 'suppressed') return finish();

        const item = {
          key: `${id}:${keySeq++}`,
          sessionId: id,
          at: nowMs,
          outcome,
        };
        items.push(item);
        while (items.length > settings.maxVisible) items.shift();
        lastToastAt.set(id, nowMs);
        emittedAt.push(nowMs);
        publish();
        // R1b-D1：入队即回调，通知不依赖 React 渲染（遮挡/节流期间也能发）。
        if (typeof env.onEnqueued === 'function') {
          try {
            env.onEnqueued(item);
          } catch {
            // 通知接线失败不得回滚已入队的浮层条目。
          }
        }
        finish();
      }

      /**
       * 后台快路径（R1b-D1）：页面不在前台时 250ms timer 可能被 Chromium
       * 节流/冻结；改用微任务调度 decide。若 resolution 尚未完成，先等它的
       * Promise，避免标题/文案倒退（error → completed）。
       */
      function scheduleBackgroundDecide(id, state, generation) {
        const run = () => {
          if (states.get(id) !== state || state.mode !== 'settling' || state.generation !== generation) return;
          if (state.resolution?.status === 'pending') {
            const waiting = state.resolutionPromise;
            if (waiting !== undefined && waiting !== null) {
              Promise.resolve(waiting).then(run, run);
            }
            return;
          }
          decide(id, state);
        };
        if (typeof queueMicrotask === 'function') queueMicrotask(run);
        else Promise.resolve().then(run);
      }

      function onStatus(id, running) {
        if (typeof id !== 'string' || id.length === 0) return;

        let state = states.get(id);
        if (running === true) {
          if (state === undefined) state = { mode: 'unknown', sawRunning: false, startedAt: 0 };
          clearSettle(state);
          // 观察窗内回弹：取消在途解析与认领，结果不再写回（§8.2）。
          cancelClaim(id, state);
          abortResolution(state);
          if (state.mode === 'running') {
            state.sawRunning = true;
            return;
          }
          state.mode = 'running';
          state.sawRunning = true;
          state.startedAt = now();
          states.set(id, state);
          return;
        }

        if (running !== false) return;
        if (state === undefined) state = { mode: 'unknown', sawRunning: false, startedAt: 0 };

        if (state.mode === 'running') {
          const generation = (state.generation ?? 0) + 1;
          state.mode = 'settling';
          state.generation = generation;
          // 与 250ms 观察窗并行发起解析与认领，不等计时器到期（§8.4）。
          startClaim(id, state, generation);
          startResolution(id, state, generation);

          const foreground = typeof env.isForeground === 'function' ? env.isForeground() === true : true;
          if (foreground) {
            // 前台保留 250ms 合并语义。
            state.timer = scheduleTimer(() => {
              if (states.get(id) !== state) return;
              if (state.mode !== 'settling' || state.generation !== generation) return;
              state.timer = undefined;
              decide(id, state);
            }, settings.coalesceMs);
          } else {
            // 遮挡/最小化：不等 timer，微任务尽快 decide/notify。
            scheduleBackgroundDecide(id, state, generation);
          }
          return;
        }

        if (state.mode === 'settling') return;

        const list = readList();
        if (list?.phase === 'pending') {
          state.mode = 'baseline';
          state.sawRunning = state.sawRunning === true;
          states.set(id, state);
        } else {
          states.set(id, state);
        }
      }

      function reset() {
        for (const [id, state] of states) {
          clearSettle(state);
          cancelClaim(id, state);
          abortResolution(state);
        }
        states.clear();
        items.length = 0;
        lastToastAt.clear();
        emittedAt.length = 0;
        // ADR-011：connection/reset 时关闭认领通道并清掉在途窗口与最近缓存。
        if (typeof env.resetClaims === 'function') {
          try {
            env.resetClaims();
          } catch {
            // 通道清理失败不影响队列/状态清空。
          }
        }
        publish();
      }

      function start() {
        if (started) return () => {};
        const subscribe = env.onStatus ?? env.subscribeStatus;
        if (typeof subscribe !== 'function') {
          throw new TypeError('createStore: env.onStatus is required');
        }
        stopStatus = subscribe(onStatus);
        started = true;
        return () => {
          if (typeof stopStatus === 'function') stopStatus();
          stopStatus = null;
          started = false;
          reset();
        };
      }

      return {
        start,
        /** 订阅队列快照；返回退订函数。 */
        subscribe(listener) {
          if (typeof listener !== 'function') return () => {};
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        /** 只读队列快照（§7.5 Item）；未变化时引用稳定。 */
        get() {
          return snapshot;
        },
        /** 按 key 移除一条；不存在时无动作。 */
        dismiss(key) {
          const index = items.findIndex((item) => item.key === key);
          if (index === -1) return;
          items.splice(index, 1);
          publish();
        },
        /** 可选：外部推入一份列表快照（env.list 缺省时使用）。 */
        ingest(list) {
          lastList = list;
        },
        /**
         * D4：deferred 恢复可见时重新入队。换新 key 让卡片重新挂载，
         * 组件侧的自动消失计时器随之重新计时；同 key/同会话的旧条目先移除。
         * @returns 新条目（供调用方做通知去重）
         */
        requeue(item) {
          if (item === null || typeof item !== 'object' || typeof item.sessionId !== 'string') return undefined;
          const index = items.findIndex(
            (existing) => existing.key === item.key || existing.sessionId === item.sessionId,
          );
          if (index >= 0) items.splice(index, 1);
          const next = {
            key: `${item.sessionId}:${keySeq++}`,
            sessionId: item.sessionId,
            at: now(),
            outcome: item.outcome ?? 'completed',
          };
          items.push(next);
          while (items.length > settings.maxVisible) items.shift();
          publish();
          return next;
        },
        /** connection/reset：清空状态、队列、计时器与限流窗口。 */
        reset,
      };
    }

    /**
     * `turn/end` 原因分类（§7.4 全 8 行）。
     *
     * 客户端不能 import 宿主 `lib/classify.js`（单文件客户端、无打包器），
     * 因此这里内联一份实现。两份必须行为一致：`test/resolver.test.js` 的
     * R09 逐项比对输出，防止两处漂移。改这里必须同步改 `lib/classify.js`。
     *
     * @param {object|undefined} reason `turn/end` 的 reason 联合
     * @returns {{outcome: string, reasonKind: string, cancelCause: string|null}}
     */
    function classify(reason) {
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
          // 未知原因（未来新增分支）不误报完成，也不让客户端抛错。
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

    /** 路由 200 允许的 outcome（§7.3 + §7.4；unknown 值按 completed 降级）。 */
    const ROUTE_OUTCOMES = new Set([
      'completed',
      'error',
      'interrupted',
      'blocked',
      'stopped',
      'ignored',
      'suppressed',
    ]);

    /**
     * 结果桥（§4.2 / §7.5）：快路径读本地 `eventSource`，慢路径拉一次路由。
     *
     * 契约：`resolve` 在任何情况下都不抛异常；失败/超时/取消一律返回
     * `{ outcome: 'completed', source: 'fallback' }`，不阻塞调用方。
     * 本阶段只提供纯逻辑，不接 store、不接 apply（接线属 WP6）。
     *
     * @param {{
     *   getBinding: (id: string) => object|undefined,
     *   fetch: (url: string, init: object) => Promise<object>,
     *   now: () => number,
     *   setTimeout: (fn: Function, ms: number) => unknown,
     *   clearTimeout: (id: unknown) => void
     * }} env
     * @param {{routePath?: string, resolveBudgetMs?: number, bridge?: 'auto'|'off'}} [config]
     * @returns {{resolve: (sessionId: string, signal?: AbortSignal) => Promise<{outcome: string, source: string}>}}
     */
    function createResolver(env, config) {
      const settings = { ...DEFAULTS, ...(config ?? {}) };
      const budgetMs = Number.isFinite(settings.resolveBudgetMs) && settings.resolveBudgetMs >= 0
        ? settings.resolveBudgetMs
        : DEFAULTS.resolveBudgetMs;
      const routePath = typeof settings.routePath === 'string' && settings.routePath.length > 0
        ? settings.routePath
        : DEFAULTS.routePath;
      const bridgeOff = settings.bridge === 'off';

      const fallback = () => ({ outcome: 'completed', source: 'fallback' });

      /** 快路径：最后一条 `turn/end`；没有 binding/窗口/事件时返回 undefined。 */
      function outcomeFromBinding(sessionId) {
        try {
          if (typeof env?.getBinding !== 'function') return undefined;
          const binding = env.getBinding(sessionId);
          const snapshot = binding?.eventSource?.getSnapshot?.();
          const entries = snapshot?.entries;
          if (!Array.isArray(entries)) return undefined;
          for (let index = entries.length - 1; index >= 0; index -= 1) {
            const entry = entries[index];
            if (entry?.type !== 'event' || entry.event?.type !== 'turn/end') continue;
            return classify(entry.event?.data?.reason).outcome;
          }
          return undefined;
        } catch {
          // 绑定/快照读取失败不阻断慢路径：按未命中处理。
          return undefined;
        }
      }

      async function resolve(sessionId, signal) {
        try {
          // 1. 快路径：命中即返回，绝不发 fetch（R01）。
          const fromBinding = outcomeFromBinding(sessionId);
          if (fromBinding !== undefined) return { outcome: fromBinding, source: 'binding' };

          // 2. 慢路径前置：桥关闭时直接降级（R08）。
          if (bridgeOff) return fallback();
          if (typeof env?.fetch !== 'function') return fallback();
          if (signal?.aborted === true) return fallback();

          const controller = typeof AbortController === 'function' ? new AbortController() : null;
          const abortUpstream = () => {
            try {
              controller?.abort?.();
            } catch {
              // 取消失败不影响降级返回。
            }
          };

          const cancelled = { kind: 'cancelled' };
          let settleCancel;
          const cancelPromise = new Promise((resolvePromise) => {
            settleCancel = resolvePromise;
          });
          const cancel = () => {
            abortUpstream();
            settleCancel(cancelled);
          };

          let timedOut = false;
          const timer = typeof env?.setTimeout === 'function'
            ? env.setTimeout(() => {
              timedOut = true;
              cancel();
            }, budgetMs)
            : null;

          let onExternalAbort = null;
          if (signal !== null && typeof signal === 'object' && typeof signal.addEventListener === 'function') {
            onExternalAbort = () => cancel();
            signal.addEventListener('abort', onExternalAbort, { once: true });
            // 监听器注册前外部已取消：补一次取消，避免竞态漏掉。
            if (signal.aborted === true) cancel();
          }

          try {
            const url = `${routePath}?sessionId=${encodeURIComponent(sessionId)}`;
            const init = { cache: 'no-store' };
            if (controller !== null) init.signal = controller.signal;

            const request = Promise.resolve()
              .then(() => env.fetch(url, init))
              .then(
                (response) => ({ kind: 'response', response }),
                () => ({ kind: 'error' }),
              );
            const raced = await Promise.race([request, cancelPromise]);

            // 3. 超时 / 外部取消 / 网络错 → fallback。
            if (raced === cancelled || timedOut) return fallback();
            if (raced.kind !== 'response') return fallback();

            const response = raced.response;
            // 4. 非 2xx（404/400/其他）→ fallback。
            if (response === null || typeof response !== 'object' || response.ok !== true) return fallback();

            // 5. 200 但 JSON 非法 → fallback；JSON 读取也受同一预算约束。
            const bodyOutcome = await Promise.race([
              Promise.resolve()
                .then(() => response.json())
                .then(
                  (value) => ({ kind: 'body', value }),
                  () => ({ kind: 'error' }),
                ),
              cancelPromise,
            ]);
            if (bodyOutcome === cancelled || timedOut) return fallback();
            if (bodyOutcome.kind !== 'body') return fallback();
            if (signal?.aborted === true) return fallback();

            const outcome = bodyOutcome.value?.outcome;
            // 6. 合法枚举 → route；未知/缺失值按 completed 处理并标 fallback（R07）。
            if (typeof outcome === 'string' && ROUTE_OUTCOMES.has(outcome)) {
              return { outcome, source: 'route' };
            }
            return fallback();
          } finally {
            try {
              if (timer !== null && typeof env?.clearTimeout === 'function') env.clearTimeout(timer);
            } catch {
              // 清理失败也不能破坏“不抛异常”的契约。
            }
            try {
              if (onExternalAbort !== null && typeof signal?.removeEventListener === 'function') {
                signal.removeEventListener('abort', onExternalAbort);
              }
            } catch {
              // 同上。
            }
          }
        } catch {
          // 契约：任何异常都不外抛。
          return fallback();
        }
      }

      return { resolve };
    }

    /**
     * 真实浏览器 env（WP6a）：时间/计时器来自 window，会话与状态事件来自 ctx。
     * 未注入 resolver 时 `resolve` 缺席，store 保持旧的 'pending' 行为。
     */
    function createClientEnv(ctx, resolver, claims) {
      const win = typeof window !== 'undefined' ? window : undefined;
      return {
        now: () => Date.now(),
        setTimeout: (callback, ms) => (
          typeof win?.setTimeout === 'function' ? win.setTimeout(callback, ms) : 0
        ),
        clearTimeout: (id) => {
          if (typeof win?.clearTimeout === 'function') win.clearTimeout(id);
        },
        list: () => ctx.sessions.list.getSnapshot(),
        onStatus: (handler) => ctx.remote.$on('api-session/status', handler),
        getBinding: (id) => ctx.sessions.binding(id),
        resolve: (id, signal) => resolver.resolve(id, signal),
        isFocused: typeof claims?.isFocused === 'function'
          ? claims.isFocused
          : () => (
            typeof win?.document?.hasFocus === 'function' ? win.document.hasFocus() === true : false
          ),
        claim: claims?.claim,
        cancelClaim: claims?.cancelClaim,
        resetClaims: claims?.resetClaims,
        onEnqueued: claims?.onEnqueued,
        isForeground: claims?.isForeground,
      };
    }

    /** resolver 的 env：同一套 window 时间/网络；binding 来自 sessions。 */
    function createResolverEnv(ctx) {
      const win = typeof window !== 'undefined' ? window : undefined;
      return {
        getBinding: (id) => ctx.sessions.binding(id),
        fetch: (url, init) => {
          if (typeof win?.fetch !== 'function') throw new TypeError('fetch is unavailable');
          return win.fetch(url, init);
        },
        now: () => Date.now(),
        setTimeout: (callback, ms) => (
          typeof win?.setTimeout === 'function' ? win.setTimeout(callback, ms) : 0
        ),
        clearTimeout: (id) => {
          if (typeof win?.clearTimeout === 'function') win.clearTimeout(id);
        },
      };
    }

    /** 视觉规格（§6.5 / §5.3）：只用 --dsw-alias-* token，卸载时随元素移除。 */
    const TOAST_CSS = `
.dtt-container {
  position: fixed;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.dtt-container[data-position="bottom-right"] { right: 24px; }
.dtt-container[data-position="bottom-left"] { left: 24px; }
.dtt-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 360px;
  max-width: calc(100vw - 48px);
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
  animation: dtt-in 160ms ease-out;
}
.dtt-body { flex: 1; min-width: 0; }
.dtt-icon {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dtt-icon-success { background: var(--dsw-alias-state-success-primary); }
.dtt-icon-error { background: var(--dsw-alias-state-error-primary); }
.dtt-icon-glyph {
  font-size: 13px;
  line-height: 1;
  font-weight: 700;
  color: var(--dsw-alias-label-primary);
}
.dtt-title {
  padding-right: 30px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dtt-line {
  padding-right: 30px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
}
.dtt-card[data-tone="success"] .dtt-line { color: var(--dsw-alias-state-success-primary); }
.dtt-card[data-tone="error"] .dtt-line { color: var(--dsw-alias-state-error-primary); }
.dtt-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}
.dtt-close:hover,
.dtt-close:focus-visible {
  color: var(--dsw-alias-label-primary);
  outline: 2px solid var(--dsw-alias-border-l1);
  outline-offset: 1px;
}
.dtt-card-out { animation: dtt-out 120ms ease-in forwards; }
@keyframes dtt-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dtt-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(6px); }
}
@keyframes dtt-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes dtt-fade-out { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .dtt-card { animation: dtt-fade-in 160ms linear; }
  .dtt-card-out { animation: dtt-fade-out 120ms linear forwards; }
}
`;

    /** 单卡错误边界：只吞掉该卡，不影响其他卡片与 overlay。 */
    class ToastErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('task-complete-toast: card render failed', error);
        }
      }

      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    /**
     * 宿主级错误边界：ToastHost 或其 hooks 抛错时只把本插槽渲染为 null，
     * 不让异常冒到槽位框架（否则 entry 会 inactive）；每个实例只记录一次。
     * 只影响渲染，不停止 store、订阅与通知。
     */
    class HostErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
        this.logged = false;
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(error) {
        if (this.logged) return;
        this.logged = true;
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('task-complete-toast: host render failed', error);
        }
      }

      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    /** 单张卡片：ADR-013 离场计时（移入取消、移出重新完整时长）、两行、图标、关闭、点击回跳。 */
    function ToastCard(props) {
      const { item, title, line, t, showTitle, onDismiss, onOpen, timers, durationMs } = props;
      const scheduleTimer = typeof timers?.setTimeout === 'function'
        ? (callback, ms) => timers.setTimeout(callback, ms)
        : (callback, ms) => (typeof setTimeout === 'function' ? setTimeout(callback, ms) : 0);
      const cancelTimer = typeof timers?.clearTimeout === 'function'
        ? (id) => timers.clearTimeout(id)
        : (id) => {
          if (typeof clearTimeout === 'function') clearTimeout(id);
        };
      const [closing, setClosing] = React.useState(false);
      const cardRef = React.useRef(null);
      const controlRef = React.useRef(null);

      if (controlRef.current === null) {
        controlRef.current = {
          closing: false,
          exit: null,
          held: new Set(),
          timer: null,
        };
        controlRef.current.timer = createDismissTimer(timers, durationMs, () => beginClose());
      }
      const control = controlRef.current;

      function beginClose() {
        if (control.closing) return;
        control.closing = true;
        setClosing(true);
        control.exit = scheduleTimer(() => {
          control.exit = null;
          onDismiss(item.key);
        }, 120);
      }

      const holdFor = (reason) => {
        if (control.held.has(reason)) return;
        control.held.add(reason);
        if (control.held.size === 1) control.timer.enter();
      };
      const releaseFor = (reason) => {
        if (!control.held.delete(reason)) return;
        if (control.held.size === 0) control.timer.leave();
      };
      /** 卡片内部焦点移动（relatedTarget 仍在卡片内）不得重置计时（ADR-013）。 */
      const isInside = (node, target) => (
        node !== null && target !== null && typeof node?.contains === 'function'
          ? node.contains(target)
          : false
      );

      React.useEffect(() => {
        control.timer.start();

        // 卡片出现时指针已在其区域（:hover）按移入处理，不计时（ADR-013）。
        const node = cardRef.current;
        try {
          if (node !== null && typeof node?.matches === 'function' && node.matches(':hover') === true) {
            holdFor('hover');
          }
        } catch {
          // 伪类不可用/已卸载：按未悬停处理。
        }

        // 页面隐藏时暂停自动消失；恢复可见后重新完整计时（ADR-013 §影响）。
        const applyVisibility = () => {
          if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
          if (document.visibilityState === 'visible' && document.hidden !== true) releaseFor('hidden');
          else holdFor('hidden');
        };
        applyVisibility();
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('visibilitychange', applyVisibility);
        }

        return () => {
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('visibilitychange', applyVisibility);
          }
          control.timer.dispose();
          if (control.exit !== null) cancelTimer(control.exit);
        };
      }, []);

      const label = showTitle ? `${title} ${line}` : line;
      const tone = item.outcome === 'completed'
        ? 'success'
        : item.outcome === 'error'
          ? 'error'
          : undefined;
      const icon = tone === undefined
        ? null
        : h('span', {
          className: `dtt-icon dtt-icon-${tone}`,
          'aria-hidden': 'true',
        }, h('span', { className: 'dtt-icon-glyph' }, tone === 'success' ? '✓' : '!'));

      return h('div', {
        className: `dtt-card${closing ? ' dtt-card-out' : ''}`,
        'data-tone': tone,
        role: 'group',
        'aria-label': label,
        ref: cardRef,
        onClick: () => {
          try {
            if (typeof onOpen === 'function') onOpen(item.sessionId);
          } catch {
            // 会话已归档/打开失败也必须 dismiss，不让卡片卡住。
          }
          onDismiss(item.key);
        },
        // ADR-013：鼠标只绑一对 enter/leave；移入取消、移出重新完整计时。
        onMouseEnter: () => holdFor('hover'),
        onMouseLeave: () => releaseFor('hover'),
        // 焦点同理；React 的 focus/blur 会冒泡，内部换焦点必须忽略。
        onFocus: (event) => {
          if (isInside(event?.currentTarget, event?.relatedTarget)) return;
          holdFor('focus');
        },
        onBlur: (event) => {
          if (isInside(event?.currentTarget, event?.relatedTarget)) return;
          releaseFor('focus');
        },
      },
        icon,
        h('div', { className: 'dtt-body' },
          showTitle ? h('div', { className: 'dtt-title', title, 'aria-label': title }, title) : null,
          h('div', { className: 'dtt-line', title: line, 'aria-label': line }, line)),
        h('button', {
          type: 'button',
          className: 'dtt-close',
          'aria-label': t('actionClose'),
          onClick: (event) => {
            // 关闭按钮不得冒泡成“点击卡片 → 跳会话”。
            if (event !== null && typeof event?.stopPropagation === 'function') event.stopPropagation();
            beginClose();
          },
        }, '×'));
    }

    /** locale 缺席时的稳定空实现，保证 hook 调用顺序不变。 */
    const NO_LOCALE_SUBSCRIBE = () => () => {};
    const NO_LOCALE_SNAPSHOT = () => null;

    /**
     * 标准 props 的 selector 恒等函数（模块级常量）。
     * `useWorkspaces` 是 SnapshotSelectorHook，selector 必传；传 identity 对
     * 「必传 selector」与「可选 selector / 无参返回快照」两种签名都安全。
     * 必须保持同一引用，避免依赖 selector 身份的 hook 每次渲染重订阅。
     */
    const IDENTITY = (snapshot) => snapshot;

    /**
     * 浮层宿主：订阅 store 与 locale 快照，解析名称，渲染容器 + 卡片。
     * `t` 缺省恒等函数；apply 传入 `ctx.locale.bind(NS)` 的绑定函数。
     */
    function ToastHost(props) {
      const store = props.store;
      const timerSource = props.timers
        ?? (typeof window !== 'undefined' && typeof window.setTimeout === 'function' ? window : undefined);
      // 不把 window 原样传下去：window 没有 now，且方法需要正确的 this。
      const timers = {
        now: typeof timerSource?.now === 'function' ? timerSource.now.bind(timerSource) : () => Date.now(),
        setTimeout: typeof timerSource?.setTimeout === 'function'
          ? timerSource.setTimeout.bind(timerSource)
          : (callback, ms) => (typeof setTimeout === 'function' ? setTimeout(callback, ms) : 0),
        clearTimeout: typeof timerSource?.clearTimeout === 'function'
          ? timerSource.clearTimeout.bind(timerSource)
          : (id) => {
            if (typeof clearTimeout === 'function') clearTimeout(id);
          },
      };
      const config = { ...DEFAULTS, ...(props.config ?? {}) };
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const texts = props.texts;
      const openSession = props.openSession;
      const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => null;
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : () => null;
      const localeFace = props.locale;
      const subscribeLocale = typeof localeFace?.subscribe === 'function'
        ? localeFace.subscribe
        : NO_LOCALE_SUBSCRIBE;
      const getLocaleSnapshot = typeof localeFace?.getSnapshot === 'function'
        ? localeFace.getSnapshot
        : NO_LOCALE_SNAPSHOT;

      const items = React.useSyncExternalStore(store.subscribe, store.get, store.get);
      // 只借订阅触发重渲染；可见文本由 ctx.locale.bind 在调用时解析当前语言。
      React.useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getLocaleSnapshot);
      const workspaces = useWorkspaces(IDENTITY);
      const sessions = useSessions(IDENTITY);
      // 供 apply 的入队通知做渲染无关解析；页面加载即挂载，通常首帧就有缓存。
      if (typeof props.onSnapshots === 'function') {
        try {
          props.onSnapshots(workspaces, sessions);
        } catch {
          // 缓存更新失败不得影响渲染。
        }
      }

      React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          const current = store.get();
          // 按 WP3 补遗：Esc 关闭“队列里最新”的一条；视觉顺序仍按 §6.5（最新在下）。
          if (current.length > 0) store.dismiss(current[current.length - 1].key);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [store]);

      const cards = items.map((item) => {
        const names = resolveNames(workspaces, sessions, item.sessionId);
        const title = titleOf(t, item.outcome);
        const line = formatLine(t, names.workspace, names.session, t('statusIdle'));
        // 文案缓存：key → {title, line}；只供渲染与延迟补弹读取，不触发通知。
        if (texts !== undefined && typeof texts?.set === 'function') texts.set(item.key, { title, line });
        return h(ToastErrorBoundary, { key: item.key },
          h(ToastCard, {
            item,
            title,
            line,
            t,
            showTitle: config.showTitle,
            durationMs: config.durationMs,
            timers,
            onOpen: typeof openSession === 'function' ? openSession : undefined,
            onDismiss: (key) => store.dismiss(key),
          }));
      });

      // 清掉已离开队列的条目，避免共享表随会话数增长。
      if (texts !== undefined && typeof texts?.delete === 'function') {
        const liveKeys = new Set(items.map((item) => item.key));
        for (const key of [...texts.keys()]) {
          if (!liveKeys.has(key)) texts.delete(key);
        }
      }

      return h(React.Fragment, null,
        h('style', null, TOAST_CSS),
        h('div', {
          className: 'dtt-container',
          'data-position': config.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
          role: 'status',
          'aria-live': 'polite',
          'aria-atomic': 'false',
        }, cards));
    }

    /**
     * 前台标志（R1b-D1 诊断修复）：window focus/blur 事件维护，不单独依赖
     * `document.hasFocus()`。Electron 被完全遮挡时后者可能仍为 true。
     */
    function createForegroundTracker(win, doc) {
      let focused = true;
      if (doc !== null && typeof doc === 'object') {
        try {
          focused = typeof doc.hasFocus === 'function' ? doc.hasFocus() === true : true;
        } catch {
          focused = true;
        }
      }

      const onFocus = () => {
        focused = true;
      };
      const onBlur = () => {
        focused = false;
      };
      let listening = false;
      if (win !== null && typeof win === 'object' && typeof win.addEventListener === 'function') {
        try {
          win.addEventListener('focus', onFocus);
          win.addEventListener('blur', onBlur);
          listening = true;
        } catch {
          listening = false;
        }
      }

      return {
        isForeground: () => focused,
        dispose() {
          if (!listening) return;
          listening = false;
          try {
            win.removeEventListener('focus', onFocus);
            win.removeEventListener('blur', onBlur);
          } catch {
            // 卸载失败不影响后续清理。
          }
        },
      };
    }

    /**
     * 系统通知与补弹（§6.6）。只负责权限、可见性与补弹，不判断“是否算完成”。
     * env: { document, Notification, window, openSession, hasUserActivation,
     *        texts?, requeue?, isForeground? }
     *
     * D1：permission='default' 也先尝试构造发送；只有构造抛错才 deferred。
     * D3：通知关闭/onclose/点击后从 issued 移除。
     * D4：恢复可见时先 requeue（补弹浮层并重计时），再重试系统通知。
     */
    function createNotifier(env, t, config) {
      const settings = { ...DEFAULTS, ...(config ?? {}) };
      const translate = typeof t === 'function' ? t : (key) => key;
      const doc = env?.document;
      const win = env?.window;
      const NotificationCtor = env?.Notification;
      const texts = env?.texts;
      const deferred = new Map();
      const issued = new Set();
      let disposed = false;
      let listening = false;

      function isPageVisible() {
        if (doc === null || typeof doc !== 'object') return true;
        if (typeof doc.visibilityState === 'string' && doc.visibilityState !== 'visible') return false;
        if (doc.hidden === true) return false;
        // R1b-D1：优先用 focus/blur 维护的前台标志；hasFocus() 在遮挡时可能失真。
        if (typeof env?.isForeground === 'function') return env.isForeground() === true;
        if (typeof doc.hasFocus === 'function' && doc.hasFocus() === false) return false;
        return true;
      }

      function hasUserActivation() {
        return typeof env?.hasUserActivation === 'function' && env.hasUserActivation() === true;
      }

      /** 文案同源：优先读 ToastHost 渲染时写入的共享表，回落条目自带字段。 */
      function textOf(item) {
        let entry;
        try {
          entry = typeof texts?.get === 'function' ? texts.get(item?.key) : undefined;
        } catch {
          entry = undefined;
        }
        return {
          title: entry?.title ?? item?.title ?? translate('titleCompleted'),
          line: entry?.line ?? item?.line ?? '',
        };
      }

      /** 把文案固化到条目上；deferred 期间共享表可能被清理，重试仍需同一份文案。 */
      function enrich(item) {
        const text = textOf(item);
        return { ...item, title: text.title, line: text.line };
      }

      function defer(item) {
        const key = item?.key ?? item?.sessionId ?? item;
        deferred.set(key, item);
        return 'deferred';
      }

      function closeNotification(notification) {
        try {
          if (notification !== null && typeof notification.close === 'function') notification.close();
        } catch {
          // 尽力关闭，不影响其他清理。
        }
        issued.delete(notification);
      }

      function deliver(item) {
        if (disposed) return 'skipped';
        if (typeof NotificationCtor !== 'function') return defer(item);
        try {
          const notification = new NotificationCtor(item.title, {
            body: item.line,
            // V13 根因：Windows 对已用过的 tag 走静默更新，`renotify` 也不救。
            // tag 压到 25 字符（9 前缀 + 16 哈希）以满足 Electron #40433 的 34 字符上限；
            // 用 item.key 哈希保证同会话每条完成都唯一，避免第二次完成无声。
            tag: `dsh-task-${hash16(item.key ?? '')}`,
            renotify: false,
          });
          const forget = () => issued.delete(notification);
          notification.onclose = forget;
          notification.onclick = () => {
            forget();
            if (typeof win?.focus === 'function') win.focus();
            try {
              if (typeof env?.openSession === 'function') env.openSession(item.sessionId);
            } catch {
              // 会话已归档时打开失败不影响关闭通知。
            }
            closeNotification(notification);
          };
          issued.add(notification);
          return 'delivered';
        } catch {
          return defer(item);
        }
      }

      async function send(item) {
        if (disposed) return 'skipped';
        if (typeof NotificationCtor !== 'function') return defer(item);

        const permission = NotificationCtor.permission;
        if (permission === 'denied') return defer(item);

        // D1：default 也先尝试构造；构造抛错在 deliver 内转 deferred。
        const status = deliver(item);

        // 升级路径：已发送后，若仍为 default 且页面可见且有手势，再申请权限。
        if (status === 'delivered'
          && permission === 'default'
          && isPageVisible()
          && hasUserActivation()
          && typeof NotificationCtor.requestPermission === 'function') {
          try {
            await NotificationCtor.requestPermission();
          } catch {
            // 申请失败不影响已送达的通知。
          }
        }

        return status;
      }

      async function notify(item) {
        if (disposed || item === null || typeof item !== 'object') {
          return 'skipped';
        }
        if (settings.systemNotification === 'never') {
          return 'skipped';
        }
        if (settings.systemNotification === 'auto' && isPageVisible()) {
          return 'skipped';
        }
        const status = await send(enrich(item));
        return status;
      }

      async function onVisible() {
        if (disposed || !isPageVisible()) return;
        const pending = [...deferred.values()];
        deferred.clear();
        for (const item of pending) {
          if (disposed) return;
          if (!isPageVisible()) {
            defer(item);
            return;
          }
          // D4：先补弹/重新计时浮层，再重试系统通知。
          if (typeof env?.requeue === 'function') {
            try {
              env.requeue(item);
            } catch {
              // requeue 失败不阻断通知重试。
            }
          }
          await send(item);
        }
      }

      function handleVisibility() {
        if (!disposed) void onVisible();
      }

      if (doc !== null && typeof doc === 'object' && typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', handleVisibility);
        doc.addEventListener('pagehide', handleVisibility);
        doc.addEventListener('focus', handleVisibility);
        listening = true;
      }
      if (win !== null && typeof win === 'object' && typeof win.addEventListener === 'function') {
        win.addEventListener('focus', handleVisibility);
        listening = true;
      }

      function dispose() {
        if (disposed) return;
        disposed = true;
        if (listening) {
          if (doc !== null && typeof doc === 'object' && typeof doc.removeEventListener === 'function') {
            doc.removeEventListener('visibilitychange', handleVisibility);
            doc.removeEventListener('pagehide', handleVisibility);
            doc.removeEventListener('focus', handleVisibility);
          }
          if (win !== null && typeof win === 'object' && typeof win.removeEventListener === 'function') {
            win.removeEventListener('focus', handleVisibility);
          }
        }
        for (const notification of [...issued]) closeNotification(notification);
        issued.clear();
        deferred.clear();
      }

      return { notify, onVisible, dispose, issuedCount: () => issued.size };
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'remote', 'uiWorkspace'],
      apply(ctx) {
        const win = typeof window !== 'undefined' ? window : undefined;
        // 1. 配置：DEFAULTS ← 注入行（ADR-009 三项为准，其余字段按类型覆盖）。
        const config = { ...DEFAULTS, ...readClientConfig(win) };

        // B8：enabled:false 时客户端完全不启动（不建 resolver/store/notifier，不注册 overlay）。
        if (config.enabled === false) return;

        // 2. 结果桥：同一份 config；fetch 走 window，缺失时 resolver 自行降级。
        const resolver = createResolver(createResolverEnv(ctx), config);

        // 3. locale 字典：两套各注册一次，随 effect 清理。
        ctx.effect(() => ctx.locale.register(LOCALE_NS, 'zh', zh));
        ctx.effect(() => ctx.locale.register(LOCALE_NS, 'en', en));
        const t = ctx.locale.bind(LOCALE_NS);

        // R1b-D1：前台标志用 window focus/blur 维护。
        const foreground = createForegroundTracker(win, win?.document);
        ctx.effect(() => () => foreground.dispose());
        const isForegroundPage = () => {
          if (foreground.isForeground() !== true) return false;
          const doc = win?.document;
          if (doc?.hidden === true) return false;
          if (typeof doc?.visibilityState === 'string' && doc.visibilityState !== 'visible') return false;
          return true;
        };

        // 4. 真实 store：窗口/会话/状态事件/resolver/认领全部注入。
        // 认领租约在页面加载时创建并打开频道；connection/reset 与卸载时清理。
        const lease = createClaimLease({
          BroadcastChannel: win?.BroadcastChannel,
          crypto: win?.crypto,
          now: () => Date.now(),
          setTimeout: (callback, ms) => (
            typeof win?.setTimeout === 'function' ? win.setTimeout(callback, ms) : 0
          ),
          clearTimeout: (id) => {
            if (typeof win?.clearTimeout === 'function') win.clearTimeout(id);
          },
        }, config);
        ctx.effect(() => () => lease.dispose());

        // R1b-D1：通知所需状态在入队回调里就绪；渲染不再是通知的前置条件。
        const texts = new Map();
        const handled = new Set();
        let workspaceSnapshot = null;
        let sessionsSnapshot = null;
        let notifyEnqueued = null;

        const store = createStore(createClientEnv(ctx, resolver, {
          claim: (id) => lease.claim(id),
          cancelClaim: (id) => lease.cancel(id),
          resetClaims: () => lease.reset(),
          onEnqueued: (item) => {
            if (notifyEnqueued !== null) notifyEnqueued(item);
          },
          isForeground: isForegroundPage,
          isFocused: () => foreground.isForeground(),
        }), config);
        ctx.effect(() => ctx.on('connection/reset', () => store.reset()));

        // 5. 通知：入队即触发；ToastHost 渲染只补文案共享表，不负责首次通知。
        const openSession = (id) => ctx.uiWorkspace.openSession(id);
        const notifier = createNotifier({
          document: win?.document ?? (typeof document !== 'undefined' ? document : undefined),
          window: win,
          Notification: win?.Notification,
          openSession,
          hasUserActivation: () => {
            const nav = win?.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined);
            return nav?.userActivation?.isActive === true;
          },
          texts,
          isForeground: () => foreground.isForeground(),
          requeue: (item) => {
            const next = store.requeue(item);
            // 新一轮浮层已经出现，通知由 onVisible 自己的重试路径负责，避免重复。
            if (next !== undefined) handled.add(next.key);
            return next;
          },
        }, t, config);
        ctx.effect(() => () => notifier.dispose());

        /**
         * 渲染无关的文案：工作区用 ToastHost 最近一次渲染缓存（页面加载即挂载，
         * 通常已就绪），会话优先同源缓存、缺值时用实时快照；都缺时 formatLine
         * 落回退文案，绝不为空。
         */
        function textFor(item) {
          let liveSessions = null;
          try {
            liveSessions = typeof ctx.sessions?.list?.getSnapshot === 'function'
              ? ctx.sessions.list.getSnapshot()
              : null;
          } catch {
            liveSessions = null;
          }
          // 工作区来自渲染缓存；会话优先用缓存（与浮层同源），缺值时用实时快照补。
          const cached = resolveNames(workspaceSnapshot, sessionsSnapshot, item.sessionId);
          const live = resolveNames(workspaceSnapshot, liveSessions, item.sessionId);
          return {
            title: titleOf(t, item.outcome),
            line: formatLine(t, cached.workspace, cached.session ?? live.session, t('statusIdle')),
          };
        }

        /** 入队即通知；同一 key 只发一次。这是唯一的通知入口。 */
        function notifyEnqueuedNow(item) {
          if (item === null || typeof item !== 'object') return;
          if (handled.has(item.key)) return;
          let text;
          try {
            text = textFor(item);
          } catch {
            // 解析失败也必须发出非空正文，不能退化成空通知。
            text = { title: titleOf(t, item.outcome), line: formatLine(t, undefined, undefined, t('statusIdle')) };
          }
          handled.add(item.key);
          void notifier.notify({ ...item, title: text.title, line: text.line });
        }
        notifyEnqueued = notifyEnqueuedNow;

        ctx.effect(() => store.start());

        // 无渲染时（遮挡）也要清掉离开队列的 key，避免 handled 长期累积。
        const stopPrune = store.subscribe((items) => {
          const liveKeys = new Set(items.map((item) => item.key));
          for (const key of handled) {
            if (!liveKeys.has(key)) handled.delete(key);
          }
        });
        ctx.effect(() => stopPrune);

        // 6. 组件订阅 locale 快照；t 在调用时解析当前语言。
        const localeFace = {
          subscribe: (listener) => ctx.locale.subscribe(listener),
          getSnapshot: () => ctx.locale.getSnapshot(),
        };

        function BoundToastHost(props) {
          return h(HostErrorBoundary, null, h(ToastHost, {
            ...props,
            store: props.store ?? store,
            config: props.config ?? config,
            t: props.t ?? t,
            locale: props.locale ?? localeFace,
            texts: props.texts ?? texts,
            onSnapshots: props.onSnapshots ?? ((workspaces, sessions) => {
              workspaceSnapshot = workspaces;
              sessionsSnapshot = sessions;
            }),
            openSession: props.openSession ?? openSession,
          }));
        }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'task-complete-toast',
          order: 100,
        }, BoundToastHost));
      },
      __test__: {
        createStore,
        createResolver,
        classify,
        readClientConfig,
        IDENTITY,
        HostErrorBoundary,
        DEFAULTS,
        zh,
        en,
        formatLine,
        titleOf,
        resolveNames,
        createDismissTimer,
        createClaimLease,
        createTabId,
        createNotifier,
        hash16,
      },
    };
  },
});
