#!/usr/bin/env node
/**
 * AECW EV-001：运行态探针（只读，零依赖）。
 *
 * 用途：每道门/接手前确认“文档说已安装”是否成立：
 *   包版本、profile link、junction 目标、bundles、patch 配置、两条 HTTP 路由。
 * 不读会话正文/工具参数/文件内容/密钥；不写任何文件；不改配置。
 *
 * 用法：
 *   node scripts/probe.mjs
 *   node scripts/probe.mjs --url http://127.0.0.1:36574 --profile desktop
 * 环境：DSH_HOME / DSH_PROFILE / DSH_WEB_URL
 * 退出码：0 = 全部通过；1 = 有失败（用于门禁前阻断）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};

const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const profile = arg('profile', process.env.DSH_PROFILE ?? 'desktop');
const baseUrl = String(arg('url', process.env.DSH_WEB_URL ?? '')).replace(/\/+$/, '');
const profileDir = path.join(DSH_HOME, 'profiles', profile);
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (error) {
    results.push({ name, ok: false, detail: String(error?.message ?? error) });
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

await check('宿主 package.json', () => {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  if (pkg.name !== '@local/task-complete-toast') throw new Error(`unexpected name ${pkg.name}`);
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) throw new Error('missing version');
  return `${pkg.name}@${pkg.version}`;
});

await check('profile dependency link', () => {
  const pkg = readJson(path.join(profileDir, 'package.json'));
  const link = pkg.dependencies?.['@local/task-complete-toast'];
  if (typeof link !== 'string') throw new Error('dependency missing');
  if (!link.includes('task-complete-toast-aecw')) throw new Error(`not pointing to AECW copy: ${link}`);
  return link;
});

await check('profile bundles', () => {
  const pkg = readJson(path.join(profileDir, 'package.json'));
  const bundles = pkg.dsh?.profile?.bundles ?? [];
  if (!bundles.includes('@local/task-complete-toast')) throw new Error('bundle entry missing');
  return '@local/task-complete-toast';
});

await check('junction target', () => {
  const link = path.join(profileDir, 'node_modules', '@local', 'task-complete-toast');
  const target = fs.realpathSync(link);
  if (!target.includes('task-complete-toast-aecw')) throw new Error(`unexpected target: ${target}`);
  return target;
});

await check('profile patch config', () => {
  const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
  if (!/id:\s*task-complete-toast\b/.test(patch)) throw new Error('task-complete-toast patch entry missing');
  if (!/appearance:\s*/.test(patch)) throw new Error('appearance config missing');
  return 'task-complete-toast + appearance';
});

await check('HTTP outcome route (expect 400)', async () => {
  if (baseUrl === '') throw new Error('DSH_WEB_URL/--url missing');
  const res = await fetch(`${baseUrl}/dsh-task-complete/outcome`, { signal: AbortSignal.timeout(3000) });
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  return '400';
});

await check('HTTP settings route (expect 400/422, no write)', async () => {
  if (baseUrl === '') throw new Error('DSH_WEB_URL/--url missing');
  const res = await fetch(`${baseUrl}/dsh-task-complete/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ __probe: 1 }),
    signal: AbortSignal.timeout(3000),
  });
  if (res.status !== 400 && res.status !== 422) throw new Error(`expected 400/422, got ${res.status}`);
  return String(res.status);
});

for (const row of results) {
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
}
const failed = results.filter((row) => !row.ok).length;
console.log(`\nAECW EV-001 probe: ${results.length - failed}/${results.length} passed${baseUrl ? ` · ${baseUrl}` : ' · no url'}`);
process.exit(failed === 0 ? 0 : 1);
