import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import {
  PACKAGE_ROOT,
  readText,
  readJson,
  parsePatch,
  loadClientModule,
  createFakeCtx,
  createFakeHostCtx,
  renderSlotElement,
} from './harness.js';

const manifest = readJson('package.json');

const RUNTIME_FILES = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'locale/zh.json',
  'locale/en.json',
  'icon.svg',
  'lib/config.js',
  'lib/outcome-table.js',
  'lib/classify.js',
  'lib/host.js',
];

test('S1 清单：名称、版本、私有、ESM 与四个导出齐全', () => {
  assert.equal(manifest.name, '@local/task-complete-toast');
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, 'module');

  assert.deepEqual(
    Object.keys(manifest.exports).sort(),
    ['.', './client', './icon', './locale/*.json'].sort(),
  );
  assert.equal(manifest.exports['.'], './index.js');
  assert.equal(manifest.exports['./client'], './client.js');
  assert.equal(manifest.exports['./icon'], './icon.svg');
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json');

  for (const file of RUNTIME_FILES) {
    assert.ok(existsSync(path.join(PACKAGE_ROOT, file)), `缺少运行时文件：${file}`);
  }
  assert.deepEqual(manifest.files, [
    'index.js',
    'client.js',
    'cordis.patch.yml',
    'locale/*.json',
    'icon.svg',
    'lib/*.js',
  ]);
});

test('S2 清单：dsh.bundle.patch 与 dsh.client(web/immediately/空 inject)', () => {
  assert.deepEqual(manifest.dsh.bundle, { patch: './cordis.patch.yml' });
  assert.deepEqual(manifest.dsh.client, {
    platform: 'web',
    immediately: true,
    inject: [],
  });
});

test('S3 patch：insert 恰好一行宿主 entry 且 id/name 正确', () => {
  const entries = parsePatch(readText('cordis.patch.yml'));

  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]), ['insert']);
  assert.equal(entries[0].insert.length, 1);
  assert.deepEqual(entries[0].insert[0], {
    id: 'task-complete-toast',
    name: '@local/task-complete-toast',
  });
  assert.equal(entries[0].insert[0].name, manifest.name);
});

test('S4 客户端：factory 返回 inject/apply，并暴露 __test__（ADR-007）', () => {
  const { entry, factory } = loadClientModule();

  assert.equal(entry.id, manifest.name);
  assert.deepEqual(Object.keys(factory).sort(), ['__test__', 'apply', 'inject']);
  assert.deepEqual(Array.from(factory.inject), ['slots', 'locale', 'sessions', 'remote', 'uiWorkspace', 'uiSession']);
  assert.equal(typeof factory.apply, 'function');
  assert.equal(typeof factory.__test__.createStore, 'function');
  assert.equal(typeof factory.__test__.createInteractionStore, 'function');
  assert.equal(typeof factory.__test__.pendingInteractionOf, 'function');
  assert.equal(typeof factory.__test__.createResolver, 'function');
  assert.equal(typeof factory.__test__.classify, 'function');
  assert.equal(typeof factory.__test__.formatLine, 'function');
  assert.equal(typeof factory.__test__.titleOf, 'function');
  assert.equal(typeof factory.__test__.resolveNames, 'function');
  assert.equal(typeof factory.__test__.createDismissTimer, 'function');
  assert.equal(typeof factory.__test__.createNotifier, 'function');
  assert.equal(typeof factory.__test__.DEFAULTS, 'object');
  assert.equal(factory.__test__.DEFAULTS.coalesceMs, 250);
});

test('S5 客户端：apply 不抛错，注册一项，组件为函数且可渲染', () => {
  const { factory } = loadClientModule();
  const { ctx, injected, registrations } = createFakeCtx();

  assert.doesNotThrow(() => {
    factory.apply(ctx);
  });

  assert.deepEqual(injected, ['shell.overlay', 'settings.plugins.tab']);
  assert.equal(registrations.length, 2);

  const registration = registrations.find((record) => record.options.name === 'shell.overlay');
  assert.ok(registration, '必须注册 shell.overlay');
  const settingsRegistration = registrations.find((record) => record.options.name === 'settings.plugins.tab');
  assert.ok(settingsRegistration, '必须注册 settings.plugins.tab');
  assert.deepEqual(registration.options, {
    name: 'shell.overlay',
    id: 'task-complete-toast',
    order: 100,
  });
  assert.equal(typeof registration.component, 'function');

  const fakeStore = {
    subscribe: () => () => {},
    get: () => [],
  };
  const element = registration.component({
    store: fakeStore,
    t: (key) => key,
    useWorkspaces: () => null,
    useSessions: () => null,
  });
  assert.equal(typeof element, 'object');
  assert.equal(typeof element.type, 'function');

  const rendered = renderSlotElement(element);
  assert.ok(rendered !== null && typeof rendered === 'object');
  assert.equal(Array.isArray(rendered.props.children), true);

  // 有队列项时的结构：容器语义、内联样式、两行卡片、状态图标与关闭按钮。
  const items = [{ key: 'k-1', sessionId: 's-1', at: 1, outcome: 'completed' }];
  const filledStore = { subscribe: () => () => {}, get: () => items };
  const fakeTimers = { setTimeout: () => 0, clearTimeout: () => {} };
  const filledWrapper = registration.component({
    store: filledStore,
    timers: fakeTimers,
    t: (key) => key,
    useWorkspaces: () => ({ byId: { w: { title: '插件', sessionIds: ['s-1'] } } }),
    useSessions: () => ({ byId: { 's-1': { title: 'Toast' } } }),
  });
  const tree = renderSlotElement(filledWrapper);
  const style = tree.props.children[0];
  const container = tree.props.children[1];

  assert.equal(container.props.role, 'status');
  assert.equal(container.props['aria-live'], 'polite');
  assert.equal(container.props['data-position'], 'bottom-right');
  assert.equal(container.props['data-theme'], 'system');
  assert.equal(container.props['data-size'], 'standard');
  assert.equal(style.type, 'style');
  assert.match(style.props.children[0], /--dsw-alias-bg-overlay/);
  assert.match(style.props.children[0], /prefers-reduced-motion/);
  assert.match(style.props.children[0], /box-shadow: 0 10px 30px rgba\(0, 0, 0, 0.18\)/);
  assert.match(style.props.children[0], /data-theme="dark"/);
  assert.match(style.props.children[0], /data-size="compact"/);

  const cards = container.props.children[0];
  assert.equal(cards.length, 1);
  const boundary = cards[0];
  const card = boundary.props.children[0];
  assert.equal(typeof card.type, 'function');

  const cardTree = card.type(card.props);
  const [icon, body, close] = cardTree.props.children;
  assert.equal(cardTree.props['data-tone'], 'success');
  assert.equal(icon.props.className, 'dtt-icon dtt-icon-success');
  assert.equal(icon.props.children[0].props.children[0], '✓');
  assert.equal(body.props.children[0].props.children[0], 'titleCompleted');
  assert.equal(body.props.children[1].props.children[0], '插件[Toast] · statusIdle');
  assert.equal(close.props['aria-label'], 'actionClose');
  assert.equal(close.props.type, 'button');
  assert.equal(close.props.className, 'dtt-close');
});

test('S8 G4 外观纯函数：边界、联动、对比度', () => {
  const { factory } = loadClientModule();
  const {
    minCardWidth,
    normalizeAppearance,
    appearanceVars,
    contrastRatio,
  } = factory.__test__;

  assert.equal(minCardWidth(12), 280);
  assert.equal(minCardWidth(18), 324, '18px 时最小宽度 = 18×18');
  assert.equal(minCardWidth(16), 288);
  // client.js 在 vm 里执行，对象来自另一个 realm；先 spread 到本 realm 再比较。
  assert.deepEqual({ ...normalizeAppearance({ fontSize: 99, cardWidth: 999, backgroundColor: 'red', textColor: '#fff' }) }, {
    fontSize: 12,
    cardWidth: null,
    backgroundColor: null,
    textColor: null,
  });
  assert.deepEqual({ ...appearanceVars({
    fontSize: 18,
    cardWidth: 324,
    backgroundColor: '#112233',
    textColor: '#FFFFFF',
  }) }, {
    '--dtt-font-size': '18px',
    '--dtt-width': '324px',
    '--dtt-bg': '#112233',
    '--dtt-fg': '#FFFFFF',
  });
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  assert.equal(contrastRatio('red', '#FFFFFF'), 1);
});

test('S9 设置页可渲染：字体只读、联动边界、预览卡片', () => {
  const { factory } = loadClientModule();
  const { ctx, registrations } = createFakeCtx();
  factory.apply(ctx);
  const registration = registrations.find((record) => record.options.name === 'settings.plugins.tab');
  assert.ok(registration, '设置页必须注册到 settings.plugins.tab');
  assert.equal(registration.options.id, 'task-complete-toast');
  assert.equal(typeof registration.options.label, 'function');

  const tree = renderSlotElement(registration.component({}));
  assert.equal(tree.props.className, 'dtt-settings');
  const json = JSON.stringify(tree, (key, value) => (key === 'type' && typeof value === 'function' ? undefined : value));
  assert.match(json, /dtt-preview/);
  assert.match(json, /settingsFontValue|跟随系统正文字体/);
  assert.match(json, /settingsCardWidth|卡片宽度/);
  assert.match(json, /dtt-card/);
});

test('S6 资源：locale 只含 meta，icon 为合法且不超 256 KiB 的 SVG', () => {
  for (const locale of ['zh', 'en']) {
    const dict = readJson(`locale/${locale}.json`);
    assert.deepEqual(Object.keys(dict), ['meta']);
    assert.deepEqual(Object.keys(dict.meta).sort(), ['description', 'title']);
    assert.equal(typeof dict.meta.title, 'string');
    assert.ok(dict.meta.title.trim().length > 0, `${locale}.meta.title 不能为空`);
    assert.equal(typeof dict.meta.description, 'string');
    assert.ok(dict.meta.description.trim().length > 0, `${locale}.meta.description 不能为空`);
    // 插件介绍必须描述当前能力，不得残留早期骨架文案（2026-11-05 修正的回归保护）。
    assert.doesNotMatch(
      dict.meta.description,
      /骨架|空占位|仅注册|skeleton|placeholder/i,
      `${locale}.meta.description 仍在描述骨架/占位，与实际功能不符`,
    );
  }

  const iconPath = path.join(PACKAGE_ROOT, 'icon.svg');
  const size = statSync(iconPath).size;
  assert.ok(size > 0 && size <= 256 * 1024, `icon.svg 体积异常：${size} 字节`);

  const svg = readText('icon.svg');
  assert.match(svg, /^<svg\s/);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.equal(/<script\b/i.test(svg), false, 'icon.svg 不应包含脚本');
  assert.equal(/(?:href|url\()/i.test(svg), false, 'icon.svg 不应引用外部资源');
});

test('S7 宿主：导出 apply/inject 与 Standard Schema Config，调用不抛错', async () => {
  const host = await import(pathToFileURL(path.join(PACKAGE_ROOT, 'index.js')).href);

  assert.deepEqual(Object.keys(host).sort(), ['Config', 'apply', 'inject']);
  assert.deepEqual(Array.from(host.inject), ['webServer']);
  assert.equal(typeof host.apply, 'function');
  assert.equal(host.Config['~standard'].version, 1);
  assert.equal(host.Config['~standard'].vendor, 'task-complete-toast');
  assert.equal(typeof host.Config['~standard'].validate, 'function');
  assert.equal(host.Config.type, 'object');

  const fake = createFakeHostCtx();
  assert.doesNotThrow(() => {
    host.apply(fake.ctx, undefined);
  });
  assert.equal(fake.routes.length, 2);
});
