/**
 * 测试夹具：用 node:vm 装载 client.js（客户端插槽），以及最小宿主 ctx/req/res
 * （宿主路由与事件装配）。只伪造运行环境，不伪造被测业务逻辑。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

/** 包根目录（test/ 的上一级）。 */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 读取包内文本文件。 */
export function readText(relativePath) {
  return readFileSync(path.join(PACKAGE_ROOT, relativePath), 'utf8');
}

/** 读取并解析包内 JSON 文件。 */
export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

/**
 * 测试用最小 React 运行时：只覆盖 client.js 用到的 createElement 与 hooks，
 * 让组件能在无 DOM 的 Node 测试里执行，不替代真实 React 的调度/渲染语义。
 */
export function createFakeReact() {
  class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }

    setState(next) {
      const patch = typeof next === 'function' ? next(this.state) : next;
      this.state = { ...this.state, ...patch };
    }
  }

  function createElement(type, props, ...children) {
    return { type, props: { ...(props ?? {}), children } };
  }

  return {
    createElement,
    Component,
    Fragment: Symbol('Fragment'),
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}];
    },
    useEffect() {},
    useLayoutEffect() {},
    useRef(value) {
      return { current: value };
    },
    useMemo(factory) {
      return factory();
    },
    useCallback(callback) {
      return callback;
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
  };
}

/**
 * 伪 BroadcastChannel 总线：同一总线上的同名频道互相投递，投递是同步的
 * （比真实浏览器更严格），用来确定性地验证认领消息顺序与胜者规则。
 * 记录频道名、消息、仍打开的实例数与关闭次数，便于断言清理。
 */
export function createBroadcastBus() {
  const instances = new Set();
  const names = [];
  const messages = [];
  let closed = 0;
  let nextId = 1;

  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.id = nextId;
      nextId += 1;
      this.onmessage = null;
      this.closed = false;
      instances.add(this);
      names.push(name);
    }

    postMessage(data) {
      if (this.closed) throw new Error('BroadcastChannel is closed');
      messages.push({ name: this.name, data });
      for (const other of [...instances]) {
        if (other === this || other.closed || other.name !== this.name) continue;
        if (typeof other.onmessage === 'function') other.onmessage({ data });
      }
    }

    close() {
      if (this.closed) return;
      this.closed = true;
      closed += 1;
      instances.delete(this);
    }
  }

  return {
    Ctor: FakeBroadcastChannel,
    names,
    messages,
    openCount: () => instances.size,
    closedCount: () => closed,
  };
}

/**
 * 解析 cordis.patch.yml 的常用子集：顶层 `- insert:` 列表，行内 `key: value`，
 * 以及 `config:` 这类缩进映射。支持字符串/布尔/数字/null、单双引号与行尾注释。
 * 遇到子集之外的结构直接抛错，避免结构变化被误判为通过。
 */
export function parsePatch(text) {
  const tokens = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]).replace(/\s+$/, '');
    if (line.trim() === '') continue;
    tokens.push({
      indent: line.length - line.trimStart().length,
      body: line.trim(),
      line: index + 1,
    });
  }

  if (tokens.length === 0) return [];

  const [entries, next] = parseList(tokens, 0, tokens[0].indent);
  if (next !== tokens.length) {
    throw new Error(`parsePatch：第 ${tokens[next].line} 行无法归属到任何结构`);
  }
  return entries;
}

function parseList(tokens, start, indent) {
  const list = [];
  let index = start;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.indent !== indent || !token.body.startsWith('- ')) break;

    const content = token.body.slice(2).trim();
    const field = splitKey(content);
    if (field === null) throw new Error(`parsePatch：第 ${token.line} 行列表项缺少 key`);

    const item = {};
    index += 1;

    if (field.value === '') {
      if (index < tokens.length && tokens[index].indent > indent) {
        const childIndent = tokens[index].indent;
        const [child, next] = tokens[index].body.startsWith('- ')
          ? parseList(tokens, index, childIndent)
          : parseMap(tokens, index, childIndent);
        item[field.key] = child;
        index = next;
      } else {
        item[field.key] = null;
      }
    } else {
      item[field.key] = parseScalar(field.value);
      if (index < tokens.length && tokens[index].indent > indent && !tokens[index].body.startsWith('- ')) {
        const [fields, next] = parseMap(tokens, index, tokens[index].indent);
        Object.assign(item, fields);
        index = next;
      }
    }

    list.push(item);
  }

  return [list, index];
}

function parseMap(tokens, start, indent) {
  const map = {};
  let index = start;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.indent !== indent || token.body.startsWith('- ')) break;

    const field = splitKey(token.body);
    if (field === null) throw new Error(`parsePatch：第 ${token.line} 行映射项缺少 key`);
    index += 1;

    if (field.value === '') {
      if (index < tokens.length && tokens[index].indent > indent) {
        const childIndent = tokens[index].indent;
        const [child, next] = tokens[index].body.startsWith('- ')
          ? parseList(tokens, index, childIndent)
          : parseMap(tokens, index, childIndent);
        map[field.key] = child;
        index = next;
      } else {
        map[field.key] = null;
      }
    } else {
      map[field.key] = parseScalar(field.value);
    }
  }

  return [map, index];
}

function splitKey(body) {
  const match = body.match(/^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/);
  if (match === null) return null;
  return { key: match[1], value: (match[2] ?? '').trim() };
}

/**
 * 在 vm 中执行 client.js，返回被 __ModuleLoader__.load 记录的 entry，
 * 以及调用 factory 后的模块对象。factory 的 require 参数默认注入一个
 * 会抛错的桩，用来证明骨架没有隐式模块依赖。
 */
export function loadClientModule(options = {}) {
  const registrations = [];
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) {
          registrations.push(entry);
        },
      },
      ...(options.window ?? {}),
    },
    console,
    // vm 上下文只有 ECMAScript 内建，不含浏览器全局；结果桥的超时取消依赖
    // AbortController，这里补真实实现（属于运行环境，不是被测逻辑的桩）。
    AbortController,
  };

  const context = vm.createContext(sandbox);
  const script = new vm.Script(readText('client.js'), { filename: 'client.js' });
  script.runInContext(context);

  if (registrations.length !== 1) {
    throw new Error(`client.js 应调用一次 __ModuleLoader__.load，实际 ${registrations.length} 次`);
  }

  const entry = registrations[0];
  if (entry === null || typeof entry !== 'object') {
    throw new Error('__ModuleLoader__.load 的入参不是对象');
  }
  if (typeof entry.factory !== 'function') {
    throw new Error('__ModuleLoader__.load 入参缺少 factory 函数');
  }

  const fakeReact = options.react ?? createFakeReact();
  const requireStub = options.require ?? ((id) => {
    if (id === 'react') return fakeReact;
    throw new Error(`client factory 不应 require 模块：${id}`);
  });

  return { entry, factory: entry.factory(requireStub), registrations };
}

/**
 * 在无 DOM 的测试里模拟 React 渲染一个插槽元素：
 * - 函数组件直接执行；
 * - 类组件按 React 的最小语义实例化、render；若后代抛错且存在
 *   `getDerivedStateFromError`，走边界降级并调用 `componentDidCatch`。
 * 这不是 React 调度器，只覆盖本插件用到的错误边界路径。
 */
export function renderSlotElement(element) {
  if (element === null || element === undefined) return null;
  if (Array.isArray(element)) {
    if (element.length === 0) return null;
    if (element.length === 1) return renderSlotElement(element[0]);
    return element.map((child) => renderSlotElement(child));
  }
  if (typeof element !== 'object' || typeof element.type !== 'function') return element;

  const type = element.type;
  const isClass = type.prototype !== undefined && typeof type.prototype.render === 'function';
  if (!isClass) return renderSlotElement(type(element.props));

  const instance = new type(element.props);
  try {
    return renderSlotElement(instance.render());
  } catch (error) {
    if (typeof type.getDerivedStateFromError !== 'function') throw error;
    instance.state = { ...instance.state, ...type.getDerivedStateFromError(error) };
    if (typeof instance.componentDidCatch === 'function') instance.componentDidCatch(error);
    return renderSlotElement(instance.render());
  }
}

/** 取插槽元素下被错误边界包裹的组件 props（测试用）。 */
export function slotChildProps(element) {
  let current = element;
  for (let depth = 0; depth < 4; depth += 1) {
    const children = current?.props?.children;
    const child = Array.isArray(children) ? children[0] : children;
    if (child === null || typeof child !== 'object') break;
    if (child.type !== undefined
      && typeof child.type === 'function'
      && child.type.prototype !== undefined
      && typeof child.type.prototype.render === 'function') {
      current = child;
      continue;
    }
    return child.props ?? {};
  }
  return {};
}

/**
 * 最小客户端 ctx（WP6a 起含 effect/on/locale/remote/sessions）：
 * inject 立即执行回调，register 记录注册项并返回清理函数；
 * effect 记录清理函数，disposeAll 逆序执行；locale/remote 记录注册并暴露触发入口。
 * `options` 可覆盖初始 list/binding/localeSnapshot，便于按用例造数据。
 */
export function createFakeCtx(options = {}) {
  const injected = [];
  const registrations = [];
  const effects = [];
  const onHandlers = new Map();
  const remoteHandlers = new Map();
  const localeRegistrations = [];
  const localeListeners = new Set();
  const sessionState = {
    list: options.list ?? { phase: 'ready', ids: [], byId: {} },
    binding: options.binding ?? (() => undefined),
  };
  let localeSnapshot = options.localeSnapshot ?? Object.freeze({ active: 'zh', revision: 0 });

  function registerLocale(ns, localeOrDicts, dict) {
    const pairs = typeof localeOrDicts === 'string'
      ? [[localeOrDicts, dict]]
      : Object.entries(localeOrDicts ?? {});
    const records = pairs.map(([locale, entries]) => {
      const record = { ns, locale, dict: entries };
      localeRegistrations.push(record);
      return record;
    });
    return () => {
      for (const record of records) {
        const index = localeRegistrations.indexOf(record);
        if (index >= 0) localeRegistrations.splice(index, 1);
      }
    };
  }

  function dictFor(ns, locale) {
    return localeRegistrations.find((record) => record.ns === ns && record.locale === locale)?.dict;
  }

  function translate(ns, key, params) {
    const active = localeSnapshot?.active;
    const dict = dictFor(ns, active) ?? dictFor(ns, 'en') ?? dictFor(ns, 'zh');
    const value = dict?.[key];
    if (typeof value !== 'string') return key;
    if (params === null || typeof params !== 'object') return value;
    return value.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
  }

  const ctx = {
    slots: {
      inject(name, callback) {
        injected.push(name);
        return callback();
      },
      register(options, component) {
        const record = { options: { ...options }, component };
        registrations.push(record);
        return () => {
          const index = registrations.indexOf(record);
          if (index >= 0) registrations.splice(index, 1);
        };
      },
    },
    effect(callback) {
      const disposer = callback();
      if (typeof disposer === 'function') effects.push(disposer);
      return disposer;
    },
    on(name, handler) {
      const list = onHandlers.get(name) ?? [];
      list.push(handler);
      onHandlers.set(name, list);
      return () => {
        const current = onHandlers.get(name) ?? [];
        const index = current.indexOf(handler);
        if (index >= 0) current.splice(index, 1);
      };
    },
    locale: {
      register: registerLocale,
      bind(ns) {
        return (key, params) => translate(ns, key, params);
      },
      getSnapshot() {
        return localeSnapshot;
      },
      subscribe(listener) {
        localeListeners.add(listener);
        return () => localeListeners.delete(listener);
      },
    },
    remote: {
      $on(name, handler) {
        const list = remoteHandlers.get(name) ?? [];
        list.push(handler);
        remoteHandlers.set(name, list);
        return () => {
          const current = remoteHandlers.get(name) ?? [];
          const index = current.indexOf(handler);
          if (index >= 0) current.splice(index, 1);
        };
      },
    },
    sessions: {
      list: {
        getSnapshot: () => sessionState.list,
      },
      binding: (id) => sessionState.binding(id),
    },
    uiWorkspace: {
      opened: [],
      openSession(id) {
        this.opened.push(id);
      },
    },
  };

  return {
    ctx,
    injected,
    registrations,
    effects,
    localeRegistrations,
    slotProps: options.slotProps ?? {},
    remoteListenerCount(name) {
      return (remoteHandlers.get(name) ?? []).length;
    },
    setList(next) {
      sessionState.list = next;
    },
    setBinding(next) {
      sessionState.binding = next;
    },
    setLocale(active) {
      localeSnapshot = Object.freeze({ active, revision: (localeSnapshot.revision ?? 0) + 1 });
      for (const listener of [...localeListeners]) listener(localeSnapshot);
    },
    emit(name, ...args) {
      for (const handler of [...(onHandlers.get(name) ?? [])]) handler(...args);
    },
    emitRemote(name, ...args) {
      for (const handler of [...(remoteHandlers.get(name) ?? [])]) handler(...args);
    },
    disposeAll() {
      for (const disposer of effects.splice(0).reverse()) disposer();
    },
  };
}

/**
 * 最小宿主 ctx：effect/on/webServer.register 记录注册，emit 触发监听，
 * disposeAll 触发所有 effect 的清理函数。
 */
export function createFakeHostCtx() {
  const handlers = new Map();
  const routes = [];
  const effects = [];

  const ctx = {
    effect(callback) {
      const disposer = callback();
      if (typeof disposer === 'function') effects.push(disposer);
      return disposer;
    },
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => {
        const current = handlers.get(name) ?? [];
        const index = current.indexOf(handler);
        if (index >= 0) current.splice(index, 1);
      };
    },
    webServer: {
      register(route) {
        routes.push(route);
        return () => {
          const index = routes.indexOf(route);
          if (index >= 0) routes.splice(index, 1);
        };
      },
    },
  };

  return {
    ctx,
    handlers,
    routes,
    effects,
    emit(name, ...args) {
      for (const handler of [...(handlers.get(name) ?? [])]) handler(...args);
    },
    disposeAll() {
      for (const disposer of effects.splice(0)) disposer();
    },
  };
}

/** 伪 IncomingMessage。 */
export function createFakeRequest(method, url) {
  return { method, url };
}

/** 伪 ServerResponse：记录状态码、响应头与响应体。 */
export function createFakeResponse() {
  return {
    statusCode: 0,
    headers: undefined,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
}

/** 解析伪响应的 JSON 体。 */
export function readResponseJson(res) {
  return JSON.parse(res.body);
}

/** 直接调用注册到伪 webServer 的路由处理器。 */
export function requestRoute(route, method, url) {
  const res = createFakeResponse();
  route.handler(createFakeRequest(method, url), res);
  return res;
}

/** 去掉行尾注释，同时不误伤引号内的 #。 */
function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

/** 解析 YAML 标量（引号字符串、布尔、null、数字、空数组/空对象）。 */
function parseScalar(raw) {
  const value = raw.trim();
  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted !== null) return quoted[2];
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}
