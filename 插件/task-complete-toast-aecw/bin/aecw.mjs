#!/usr/bin/env node
/**
 * AECW 生态原型 v0.1 — 零依赖文件系统 CLI
 * 用法：node bin/aecw.mjs <command> <dir> [--flags]
 * 设计：人类 / 集群 / 工作区三域；STATUS.md 单一当前状态；异议与事实台账；门禁一页纸。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.join(ROOT, 'core');
const DATE = new Date().toISOString().slice(0, 10);

function usage() {
  console.log(`AECW 生态原型 v0.1

用法：
  node bin/aecw.mjs init <dir> --name <名字> --owner <人类所有者> [--goal <目标>]
  node bin/aecw.mjs blueprint <dir> [--stage <阶段>] [--force]
  node bin/aecw.mjs freeze <dir> --charter-confirmed --stage <阶段> --scope <范围> --budget <预算> --stop <停止> --acceptance <验收>
  node bin/aecw.mjs start <dir> [--by <人类>] [--first-report <报告点>]
  node bin/aecw.mjs change <dir> --type task|blueprint|charter --title <变更> [--reason <理由>] [--impact <影响>] [--by <提出者>] [--decision 接受|拒绝|挂起]
  node bin/aecw.mjs change <dir> --id CR-001 --decision 接受|拒绝|挂起 [--reason <理由>]
  node bin/aecw.mjs status <dir>
  node bin/aecw.mjs dissent <dir> --severity S1|S2|S3|S4 --type <类型> --claim <主张> [--evidence <证据>] [--route 本地|直达]
  node bin/aecw.mjs fact <dir> --statement <陈述> --source <来源> [--status 已捕获|已核验|有争议] [--verifier <核验人>]
  node bin/aecw.mjs gate <dir> --name <门禁名> [--decision 通过|有条件通过|退回补证|暂停] [--host <主持人>]
  node bin/aecw.mjs resolve <dir> --id DR-001 --decision <裁决> [--reason <理由>]
  node bin/aecw.mjs accept <dir> --item <项> --decision <接受|有条件接受|拒绝> [--evidence <证据>] [--risk <剩余风险>] [--by <接受者>]
  node bin/aecw.mjs log <dir> --decision <决策> [--reason <理由>]
  node bin/aecw.mjs check <dir>
  node bin/aecw.mjs demo [--force]

原则：
  - 人类只做方向/S1/S2/最终验收/抽样；S3/S4 本地处理。
  - 异议必须到达有权者；S1/S2 进 inbox/，不能只留在聊天里。
  - 事实有来源/状态；模型输出默认是“主张”，不是事实。
  - STATUS.md 是唯一当前状态；旧文档标 SUPERSEDED。
  - 蓝图是“怎么做”的共享基线；开工令是人类的“现在开始”，两者都不是整个项目授权。
`);
}

function parse(argv) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfAbsent(p, content, force = false) {
  if (!force && fs.existsSync(p)) return false;
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
  return true;
}

function readTemplate(name, vars = {}) {
  let s = fs.readFileSync(path.join(CORE, name), 'utf8');
  for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v));
  return s;
}

function appendTableRow(text, heading, row) {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`section not found: ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length);
  const end = next < 0 ? text.length : next;
  const lines = text.slice(start, end).split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].trimStart().startsWith('|')) last = i;
  if (last < 0) lines.push('', row);
  else lines.splice(last + 1, 0, row);
  return text.slice(0, start) + lines.join('\n') + text.slice(end);
}

function appendLastTableRow(text, row) {
  const lines = text.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].trimStart().startsWith('|')) last = i;
  if (last < 0) lines.push('', row);
  else lines.splice(last + 1, 0, row);
  return lines.join('\n');
}

function nextId(text, prefix) {
  const re = new RegExp(`${prefix}-(\\d+)`, 'g');
  let max = 0;
  let m;
  while ((m = re.exec(text))) max = Math.max(max, Number(m[1]));
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function openHigh(text) {
  return text
    .split('\n')
    .filter((l) => l.startsWith('|') && /\|\s*(S1|S2)\s*\|/.test(l) && /\|\s*open\s*\|/.test(l)).length;
}

function openChanges(text) {
  const start = text.indexOf('## C. 变更台账');
  if (start < 0) return [];
  const next = text.indexOf('\n## ', start + 5);
  const section = text.slice(start, next < 0 ? text.length : next);
  return section
    .split('\n')
    .filter((l) => l.startsWith('| CR-') && /\|\s*open\s*\|/.test(l));
}

function slug(s) {
  return String(s || 'gate').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '') || 'gate';
}

function ownerOf(status) {
  const m = status.match(/人类所有者：([^\n|]+)/);
  return m ? m[1].trim() : '';
}

function stageOf(status) {
  const m = status.match(/- 阶段：([^\n（(]+)/);
  return m ? m[1].trim().split(/\s*\/\s*/)[0] : '';
}

function stageStateOf(raw) {
  return String(raw || '').trim().split(/[（(/]/)[0].trim().toLowerCase();
}

function latestGate(p, needle) {
  if (!fs.existsSync(p.gates)) return '';
  const files = fs.readdirSync(p.gates).filter((f) => f.includes(needle)).sort();
  return files.length ? files[files.length - 1] : '';
}

function blueprintMeta(p) {
  if (!fs.existsSync(p.blueprint)) return { ok: false, reason: '缺少 BLUEPRINT.md' };
  const text = fs.readFileSync(p.blueprint, 'utf8');
  const approved = /^- 状态：\s*approved\s*$/m.test(text);
  const approverMatch = text.match(/^- 批准人：([^\n]+)/m);
  const approver = approverMatch ? approverMatch[1].trim() : '';
  const versionMatch = text.match(/^- 版本：([^\n]+)/m);
  const version = versionMatch ? versionMatch[1].trim() : 'v?';
  const named = Boolean(approver) && !/待批准|待补|未具名|TODO/i.test(approver);
  return { ok: approved && named, approved, approver, version, text };
}

function projectPaths(dir) {
  return {
    dir,
    status: path.join(dir, 'STATUS.md'),
    direction: path.join(dir, 'human', 'direction.md'),
    blueprint: path.join(dir, 'BLUEPRINT.md'),
    decisions: path.join(dir, 'human', 'decisions.md'),
    acceptance: path.join(dir, 'human', 'acceptance.md'),
    ledger: path.join(dir, 'ledger.md'),
    board: path.join(dir, 'cluster', 'board.md'),
    roster: path.join(dir, 'cluster', 'roster.md'),
    runs: path.join(dir, 'cluster', 'runs.md'),
    learning: path.join(dir, 'cluster', 'learning.md'),
    work: path.join(dir, 'workspace', 'work'),
    evidence: path.join(dir, 'workspace', 'evidence'),
    memory: path.join(dir, 'workspace', 'memory'),
    landing: path.join(dir, 'workspace', 'landing'),
    gates: path.join(dir, 'gates'),
    inbox: path.join(dir, 'inbox'),
  };
}

function cmdInit(args, flags) {
  const target = args[0] || flags.dir;
  if (!target) fail('init 需要一个目标目录：node bin/aecw.mjs init <dir> --name ... --owner ...');
  const dir = path.resolve(target);
  const name = String(flags.name || path.basename(dir));
  const owner = String(flags.owner || '待补');
  const goal = String(flags.goal || '（待填）');
  const p = projectPaths(dir);
  const vars = { PROJECT: name, OWNER: owner, DATE, GOAL: goal, STAGE: 'seed' };

  ensureDir(p.dir);
  for (const d of [path.join(dir, 'human'), path.join(dir, 'cluster'), p.work, p.evidence, p.memory, p.landing, p.gates, p.inbox]) ensureDir(d);

  const created = [];
  const add = (file, content) => { if (writeIfAbsent(file, content, Boolean(flags.force))) created.push(file); };

  add(p.status, readTemplate('status.template.md', vars));
  add(p.direction, readTemplate('direction.template.md', vars));
  add(p.blueprint, readTemplate('blueprint.template.md', vars));
  add(p.ledger, readTemplate('ledger.template.md', vars));
  add(p.acceptance, readTemplate('acceptance.template.md', vars));

  add(p.decisions, `# 人类决策记录 · ${name}\n\n> 只记“决定 / 理由 / 影响”。S1/S2 见 ledger 与 inbox。\n\n| 日期 | 决策 | 理由 | 影响 |\n|---|---|---|---|\n| - | - | - | - |\n`);
  add(p.roster, `# 集群名册 · ${name}\n\n> 默认是“单 agent + 人类”；角色是功能，不是必须新增的人头。\n\n| 角色 | 谁 | 职责 | 当前状态 |\n|---|---|---|---|\n| 人类方向所有者 | ${owner} | 方向/边界/S1/S2/最终验收 | active |\n| 集群管家 | （待填） | 路由、任务板、S3/S4、升级 | active |\n| 实现者 | （待填） | 实现/测试/事实记录 | active |\n| 验证者（可选/轮值） | （待填） | 高影响事实复核 | on-demand |\n| 工作区策展 | （待填） | STATUS/台账/证据/时效 | active |\n`);
  add(p.board, `# 任务板 · ${name}\n\n| ID | 任务 | 负责人 | 状态 | 输入 | 输出 | 验收 |\n|---|---|---|---|---|---|---|\n| T-001 | （待填） | （待填） | todo | - | - | - |\n`);
  add(p.runs, `# 运行记录 · ${name}\n\n| 时间 | agent | 任务 | 结果 | 证据 |\n|---|---|---|---|---|\n| - | - | - | - | - |\n`);
  add(p.learning, `# 学习账 · ${name}\n\n> 观察/教训/候选；不自动晋升为规则。\n\n| 日期 | 观察 | 教训 | 状态 |\n|---|---|---|---|\n| - | - | - | - |\n`);

  add(path.join(p.work, 'README.md'), `# workspace/work\n\n任务产物、草稿、候选。候选不得当作已验收事实；当前状态见 ../../STATUS.md。\n`);
  add(path.join(p.evidence, 'README.md'), `# workspace/evidence\n\n原始证据：测试输出、日志、截图、复现步骤。E1 放这里；E2 人类目视要写清“无截图”或附截图。\n`);
  add(path.join(p.memory, 'README.md'), `# workspace/memory\n\n项目记忆：决策、判例、负记忆、术语。判断/规范必须引用事实；过期条目标 SUPERSEDED。\n`);
  add(path.join(p.landing, 'README.md'), `# workspace/landing\n\n落地清单/交接/退役：可用、可运维、可交接、可审计、成本、遗留接受、照护者。\n`);
  add(path.join(p.gates, 'README.md'), `# gates\n\n每道门一页；用 \`node bin/aecw.mjs gate <dir> --name <name>\` 生成。没有关键事实不开门。\n`);
  add(path.join(p.inbox, 'README.md'), `# inbox（S1/S2 与变更详情）\n\nS1/S2 的完整异议记录放这里，不能被集群管家过滤。人类必须回应；未回应默认暂停/缩小。\nblueprint/charter 变更的详情（CR-xxx）也放这里；裁决状态以 ledger C 表为准。\n`);

  console.log(`AECW 项目已初始化：${dir}`);
  console.log(`  项目：${name}｜人类所有者：${owner}`);
  console.log(`  当前状态：${p.status}`);
  console.log(`  已创建/跳过：${created.length} 个文件`);
  console.log(`下一步：填 human/direction.md 和 BLUEPRINT.md，批准蓝图后 freeze，再 start`);
  return dir;
}

function needDir(args, cmd) {
  const dir = args[0] ? path.resolve(args[0]) : '';
  if (!dir) fail(`${cmd} 需要一个项目目录`);
  if (!fs.existsSync(path.join(dir, 'STATUS.md'))) fail(`不是 AECW 项目（缺 STATUS.md）：${dir}`);
  return dir;
}

function cmdDissent(args, flags) {
  const dir = needDir(args, 'dissent');
  const p = projectPaths(dir);
  const severity = String(flags.severity || 'S3').toUpperCase();
  if (!['S1', 'S2', 'S3', 'S4'].includes(severity)) fail('severity 必须是 S1/S2/S3/S4');
  const type = String(flags.type || 'risk');
  const claim = String(flags.claim || '（未填主张）');
  const evidence = String(flags.evidence || '-');
  const route = String(flags.route || (severity === 'S1' || severity === 'S2' ? '直达' : '本地'));
  const owner = String(flags.owner || '集群管家');
  let ledger = fs.readFileSync(p.ledger, 'utf8');
  const id = nextId(ledger, 'DR');
  const row = `| ${id} | ${DATE} | ${severity} | ${type} | ${claim} | ${evidence} | ${owner} | open | - |`;
  ledger = appendTableRow(ledger, '## A. 异议台账', row);
  fs.writeFileSync(p.ledger, ledger, 'utf8');

  if (severity === 'S1' || severity === 'S2') {
    const detail = `# ${id} · ${severity} · ${type}\n\n- 日期：${DATE}\n- 路由：${route}\n- 提出者/角色：${owner}\n- 一句话主张：${claim}\n- 事实依据：${evidence}\n- 不确定性：\n- 影响（谁/什么/可逆性）：\n- 建议替代：\n- 什么会改变我的判断：\n- 请求动作：\n\n> S1/S2：人类必须在 SLA 内回应；未回应默认暂停/缩小。\n`;
    writeIfAbsent(path.join(p.inbox, `${id}.md`), detail, true);
  }

  console.log(`${id} 已记录（${severity} / ${type}）`);
  if (severity === 'S1' || severity === 'S2') {
    console.log(`  → 直达人类：${path.join(p.inbox, `${id}.md`)}`);
    console.log('  → 未解决前，高风险门禁应暂停/缩小；不要只留在聊天里。');
  } else {
    console.log('  → 本地处理；周会记录，人类抽样。');
  }
}

function cmdFact(args, flags) {
  const dir = needDir(args, 'fact');
  const p = projectPaths(dir);
  const statement = String(flags.statement || '（未填陈述）');
  const source = String(flags.source || '-');
  const status = String(flags.status || '已捕获');
  const verifier = String(flags.verifier || '-');
  const link = String(flags.link || '-');
  let ledger = fs.readFileSync(p.ledger, 'utf8');
  const id = nextId(ledger, 'F');
  const row = `| ${id} | ${DATE} | ${statement} | ${source} | ${status} | ${verifier} | ${link} |`;
  ledger = appendTableRow(ledger, '## B. 事实台账', row);
  fs.writeFileSync(p.ledger, ledger, 'utf8');
  console.log(`${id} 已记录（${status}）`);
  console.log('  模型输出默认是“主张”；高影响事实需非作者核验。');
}

function cmdGate(args, flags) {
  const dir = needDir(args, 'gate');
  const p = projectPaths(dir);
  const name = String(flags.name || 'gate');
  const decision = String(flags.decision || '有条件通过');
  const host = String(flags.host || '集群管家');
  const ledger = fs.existsSync(p.ledger) ? fs.readFileSync(p.ledger, 'utf8') : '';
  const open = openHigh(ledger);
  const file = path.join(p.gates, `${DATE}-${slug(name)}.md`);
  const vars = {
    PROJECT: path.basename(dir),
    GATE: name,
    DATE,
    HOST: host,
    DECISION: decision,
    OPEN_S1S2: open > 0 ? `${open} 条（阻断高风险）` : '0',
  };
  const content = readTemplate('gate.template.md', vars);
  writeIfAbsent(file, content, true);
  console.log(`门禁已生成：${file}`);
  console.log(`  开放 S1/S2：${open}${open > 0 ? '（高风险动作应暂停/缩小）' : ''}`);
}

function cmdResolve(args, flags) {
  const dir = needDir(args, 'resolve');
  const p = projectPaths(dir);
  const id = String(flags.id || '');
  const decision = String(flags.decision || '接受');
  if (!id) fail('resolve 需要 --id DR-001');
  let ledger = fs.readFileSync(p.ledger, 'utf8');
  const lines = ledger.split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(`| ${id} `)) continue;
    const parts = lines[i].split('|');
    if (parts.length < 10) continue;
    parts[8] = ' closed ';
    parts[9] = ` ${decision} `;
    lines[i] = parts.join('|');
    found = true;
    break;
  }
  if (!found) fail(`未找到异议 ${id}`);
  fs.writeFileSync(p.ledger, lines.join('\n'), 'utf8');
  console.log(`${id} 已关闭：${decision}`);
}

function cmdAccept(args, flags) {
  const dir = needDir(args, 'accept');
  const p = projectPaths(dir);
  const item = String(flags.item || '（未填项）');
  const decision = String(flags.decision || '接受');
  const evidence = String(flags.evidence || '-');
  const risk = String(flags.risk || '-');
  const by = String(flags.by || '人类所有者（待补）');
  let text = fs.readFileSync(p.acceptance, 'utf8');
  text = appendLastTableRow(text, `| ${DATE} | ${item} | ${decision} | ${evidence} | ${risk} | ${by} |`);
  fs.writeFileSync(p.acceptance, text, 'utf8');
  console.log(`验收已记录：${item} → ${decision}（${by}）`);
}

function cmdLog(args, flags) {
  const dir = needDir(args, 'log');
  const p = projectPaths(dir);
  const decision = String(flags.decision || '（未填决策）');
  const reason = String(flags.reason || '-');
  let text = fs.readFileSync(p.decisions, 'utf8');
  const row = `| ${DATE} | ${decision} | ${reason} | - |`;
  text = appendLastTableRow(text, row);
  fs.writeFileSync(p.decisions, text, 'utf8');
  console.log(`决策已记录：${decision}`);
}

function cmdBlueprint(args, flags) {
  const dir = needDir(args, 'blueprint');
  const p = projectPaths(dir);
  const status = fs.readFileSync(p.status, 'utf8');
  const owner = ownerOf(status);
  const stage = String(flags.stage || stageOf(status) || 'stage-1');

  if (fs.existsSync(p.blueprint) && !flags.force) {
    let text = fs.readFileSync(p.blueprint, 'utf8');
    const approved = /^- 状态：\s*approved\s*$/m.test(text);
    if (flags.stage && !approved) {
      text = text.replace(/^- 阶段：.*$/m, `- 阶段：${flags.stage}`);
      fs.writeFileSync(p.blueprint, text, 'utf8');
      console.log(`蓝图阶段已更新：${flags.stage}`);
    }
    console.log(`蓝图已存在：${p.blueprint}`);
    console.log(`  状态：${approved ? 'approved（已批准）' : 'draft（未批准）'}`);
    console.log('  填完后由人类把 `- 状态：draft` 改为 `- 状态：approved`，并填 `- 批准人：<人类>`。');
    console.log('  需要重建模板时加 --force（会覆盖，旧版本先自行归档）。');
    return;
  }

  const content = readTemplate('blueprint.template.md', {
    PROJECT: path.basename(dir),
    STAGE: stage,
    DATE,
    OWNER: owner || '（待补）',
  });
  fs.writeFileSync(p.blueprint, content, 'utf8');
  console.log(`施工蓝图已创建：${p.blueprint}`);
  console.log('  下一步：填工作包/接口/未知/阶段验收；人类批准后改状态为 approved。');
  console.log('  蓝图未批准，freeze 会拒绝；没有 freeze/start，集群不开工。');
}

function cmdFreeze(args, flags) {
  const dir = needDir(args, 'freeze');
  const p = projectPaths(dir);
  const status = fs.readFileSync(p.status, 'utf8');
  const ownerMatch = status.match(/人类所有者：([^\n|]+)/);
  const owner = ownerMatch ? ownerMatch[1].trim() : '';
  if (!owner || /待补|未具名|TODO/i.test(owner)) fail('人类所有者未具名；先补 owner 再冻结');
  if (!flags['charter-confirmed']) fail('freeze 需要 --charter-confirmed（人类确认宪章）');

  const direction = fs.readFileSync(p.direction, 'utf8');
  if (/（待填）|（明确不做|（待填：/.test(direction)) {
    fail('direction 还有未填模板项（失败定义/非目标等）；先填完再冻结');
  }

  const bp = blueprintMeta(p);
  if (!bp.ok) {
    fail(`蓝图未获人类批准：${p.blueprint}（需要 “- 状态：approved” 和具名批准人）`);
  }

  const ledger = fs.existsSync(p.ledger) ? fs.readFileSync(p.ledger, 'utf8') : '';
  const open = openHigh(ledger);
  if (open > 0) fail(`还有 ${open} 条开放 S1/S2；先 resolve 再冻结阶段基线`);

  const stage = String(flags.stage || 'stage-1');
  const bpStageMatch = bp.text.match(/^- 阶段：([^\n]+)/m);
  const bpStage = bpStageMatch ? bpStageMatch[1].trim() : '';
  if (bpStage && bpStage !== stage) {
    fail(`蓝图阶段（${bpStage}）与 freeze 阶段（${stage}）不一致；先改蓝图或用 blueprint --stage`);
  }
  const scope = String(flags.scope || '（未填范围）');
  const budget = String(flags.budget || '（未填预算）');
  const stop = String(flags.stop || '（未填停止）');
  const acceptance = String(flags.acceptance || '（未填验收）');
  const file = path.join(p.gates, `${DATE}-charter-freeze.md`);

  const content = `# 宪章冻结与阶段授权 · ${path.basename(dir)}

- 日期：${DATE}
- 人类所有者：${owner}
- 宪章：human/direction.md（人类确认：是）
- 蓝图：BLUEPRINT.md ${bp.version}（批准人：${bp.approver}）
- 异议状态：开放 S1/S2 = 0；S3/S4 已记录/抽样
- 阶段：${stage}
- 范围：${scope}
- 预算：${budget}
- 停止：${stop}
- 验收：${acceptance}

## 授权

集群只可执行**本阶段**；阶段结束必须停止、报告、等下一道门。
不得把本授权解释为“整个项目”或“继续做下去”的授权；新增范围需重新冻结。

## 冻结依据

- 宪章无开放 S1/S2；
- 人类已确认宪章；
- 阶段范围/预算/停止/验收已写明；
- 当前状态写入 STATUS.md，旧文档标 SUPERSEDED。

## 签署

- 人类所有者：${owner}
- 集群管家：
`;

  fs.writeFileSync(file, content, 'utf8');

  let s = status
    .replace(/- 阶段：.*/, `- 阶段：${stage}（baseline frozen）`)
    .replace(/- 当前门禁：.*/, `- 当前门禁：${DATE}-charter-freeze`);
  s = s.replace(/- 阶段状态：.*/, '- 阶段状态：frozen');
  if (!/- 阶段状态：/.test(s)) s = s.replace(/(- 阶段：.*\n)/, '$1- 阶段状态：frozen\n');
  s = s.replace(/\n## 7\. 阶段授权（冻结）[\s\S]*$/, '');
  s = s.trimEnd() + `\n\n## 7. 阶段授权（冻结）\n\n- 阶段：${stage}\n- 蓝图：${bp.version}（批准：${bp.approver}）\n- 范围：${scope}\n- 预算：${budget}\n- 停止：${stop}\n- 验收：${acceptance}\n- 冻结：${DATE}；宪章确认：${owner}\n- 集群只可执行本阶段；阶段结束必须停、报告、等下一道门。\n`;
  fs.writeFileSync(p.status, s, 'utf8');

  console.log(`阶段基线已冻结：${file}`);
  console.log(`  阶段：${stage}｜范围：${scope}`);
  console.log('  集群只可执行本阶段；阶段结束必须停、报告、等下一道门。');
}

function cmdStart(args, flags) {
  const dir = needDir(args, 'start');
  const p = projectPaths(dir);
  const status = fs.readFileSync(p.status, 'utf8');
  const owner = ownerOf(status);
  if (!owner || /待补|未具名|TODO/i.test(owner)) fail('人类所有者未具名；先补 owner 再下开工令');

  const by = String(flags.by || owner);
  if (!by || /待补|未具名|TODO/i.test(by)) fail('开工令下达人未具名');

  const freeze = latestGate(p, 'charter-freeze');
  if (!freeze) fail('没有 charter-freeze；先 freeze 阶段基线，再下开工令');

  const bp = blueprintMeta(p);
  if (!bp.ok) fail('蓝图未获人类批准；先让人类批准 BLUEPRINT.md，再下开工令');

  const ledger = fs.existsSync(p.ledger) ? fs.readFileSync(p.ledger, 'utf8') : '';
  const open = openHigh(ledger);
  if (open > 0) fail(`还有 ${open} 条开放 S1/S2；先裁决再开工`);

  const stateMatch = status.match(/- 阶段状态：([^\n]+)/);
  const state = stateMatch ? stateMatch[1].trim() : '';
  if (/executing|执行中/i.test(state)) fail('阶段已在执行；如需重开，先暂停/关闭或重新 freeze');

  const stage = stageOf(status);
  if (!stage) fail('STATUS.md 没有阶段名；先 freeze 或填写阶段');
  const bpStageMatch = bp.text.match(/^- 阶段：([^\n]+)/m);
  const bpStage = bpStageMatch ? bpStageMatch[1].trim() : '';
  if (bpStage && bpStage !== stage) {
    fail(`蓝图阶段（${bpStage}）与当前阶段（${stage}）不一致；先改蓝图或重新 freeze`);
  }
  const firstReport = String(flags['first-report'] || '阶段结束、触发 S1/S2、或预算耗尽时');
  const file = path.join(p.gates, `${DATE}-start-order.md`);

  const content = `# 开工令 · ${stage}

- 日期：${DATE}
- 下达人：${by}
- 阶段：${stage}
- 蓝图：BLUEPRINT.md ${bp.version}（批准人：${bp.approver}）
- 冻结门禁：${freeze}
- 开工条件：宪章确认；蓝图批准；开放 S1/S2 = 0
- 首次报告点：${firstReport}
- 预算/停止：见冻结门禁与 STATUS.md 第 7 节

## 授权

集群可以开始执行**本阶段**，但只限冻结蓝图和冻结范围；任务板/证据/异议按原型规则记录。

## 不授权

- 不授权整个项目；
- 不授权阶段结束后自动续跑；
- 不授权改变验收判据；
- 不授权新增范围、依赖或外部发布；
- 不授权绕过开放 S1/S2。

## 暂停权

人类可以在任何时候暂停、收缩或终止；集群应立即停止、保存证据、更新 STATUS.md。

## 签署

- 人类：${by}
- 集群管家：
`;

  fs.writeFileSync(file, content, 'utf8');

  let s = status
    .replace(/- 阶段状态：.*/, '- 阶段状态：executing')
    .replace(/- 当前门禁：.*/, `- 当前门禁：${DATE}-start-order`);
  if (!/- 阶段状态：/.test(s)) s = s.replace(/(- 阶段：.*\n)/, '$1- 阶段状态：executing\n');
  s = s.replace(/\n## 8\. 开工令[\s\S]*$/, '');
  s = s.trimEnd() + `\n\n## 8. 开工令\n\n- 下达人：${by}\n- 日期：${DATE}\n- 首次报告点：${firstReport}\n- 依据：${freeze} + BLUEPRINT.md ${bp.version}\n- 只授权本阶段；阶段结束或触发停止条件必须停、报告、等下一道门。\n`;
  fs.writeFileSync(p.status, s, 'utf8');

  console.log(`开工令已下达：${file}`);
  console.log(`  阶段：${stage}｜蓝图：${bp.version}｜下达人：${by}`);
  console.log(`  首次报告点：${firstReport}`);
  console.log('  只授权本阶段；阶段结束或触发停止条件必须停。');
}

function normalizeDecision(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['接受', 'accepted', 'accept'].includes(v)) return 'accepted';
  if (['拒绝', 'rejected', 'reject'].includes(v)) return 'rejected';
  if (['挂起', 'defer', 'deferred', '推迟'].includes(v)) return 'deferred';
  return '';
}

function cmdChange(args, flags) {
  const dir = needDir(args, 'change');
  const p = projectPaths(dir);
  let ledger = fs.readFileSync(p.ledger, 'utf8');

  if (!ledger.includes('## C. 变更台账')) {
    ledger = ledger.trimEnd() + `\n\n## C. 变更台账\n\n| ID | 日期 | 类型 | 变更 | 理由 | 影响 | 提出者 | 状态 | 裁决 |\n|---|---|---|---|---|---|---|---|---|\n| - | - | - | - | - | - | - | - | - |\n`;
  }

  const id = String(flags.id || '');
  if (id) {
    const decision = normalizeDecision(flags.decision);
    if (!decision) fail('--decision 必须是 接受/拒绝/挂起');
    const lines = ledger.split('\n');
    let found = false;
    let type = '';
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith(`| ${id} `)) continue;
      const parts = lines[i].split('|');
      if (parts.length < 11) continue;
      type = parts[3].trim();
      parts[8] = ` ${decision} `;
      parts[9] = ` ${String(flags.reason || decision)} `;
      lines[i] = parts.join('|');
      found = true;
      break;
    }
    if (!found) fail(`未找到变更 ${id}`);
    fs.writeFileSync(p.ledger, lines.join('\n'), 'utf8');
    console.log(`${id} 已裁决：${decision}`);
    if (decision === 'accepted' && (type === 'blueprint' || type === 'charter')) {
      console.log('  → 不得原地修改冻结基线：升蓝图版本，重新 freeze + start（charter 变更先停）。');
    }
    return;
  }

  const type = String(flags.type || 'task').toLowerCase();
  if (!['task', 'blueprint', 'charter'].includes(type)) fail('--type 必须是 task/blueprint/charter');
  const title = String(flags.title || '（未填变更）');
  const reason = String(flags.reason || '-');
  const impact = String(flags.impact || '-');
  const by = String(flags.by || '集群管家');
  const decision = normalizeDecision(flags.decision);
  const state = decision || 'open';
  const crId = nextId(ledger, 'CR');
  const row = `| ${crId} | ${DATE} | ${type} | ${title} | ${reason} | ${impact} | ${by} | ${state} | ${decision || '-'} |`;
  ledger = appendTableRow(ledger, '## C. 变更台账', row);
  fs.writeFileSync(p.ledger, ledger, 'utf8');

  const detail = `# ${crId} · ${type} 变更

- 日期：${DATE}
- 提出者：${by}
- 类型：${type}
- 变更：${title}
- 理由：${reason}
- 影响：${impact}
- 状态：${state}
- 裁决：${decision || '待人类裁决'}

## 影响分析（提出者填）

- 影响哪个阶段/工作包：
- 已完成的什么会作废/返工：
- 预算/时间影响：
- 验收判据是否改变：
- 风险/外部性：

## 选项

1. 接受（新版本 + 重新 freeze/start）：
2. 拒绝/推迟（维持当前基线）：
3. 缩小/替代：

## 裁决

- 人类：
- 日期：
- 理由：
`;
  writeIfAbsent(path.join(p.inbox, `${crId}.md`), detail, true);

  console.log(`${crId} 已记录（${type} / ${state}）`);
  console.log(`  → 详情：${path.join(p.inbox, `${crId}.md`)}`);
  if (type === 'task') {
    console.log('  → 阶段内处理；记 board/runs；若改验收/范围/预算，升级为 blueprint。');
  } else if (type === 'blueprint') {
    console.log('  → 需影响分析 + 人类裁决 + 新蓝图版本 + 重新 freeze/start；不得原地改冻结基线。');
  } else {
    console.log('  → 先停；重谈宪章；新 freeze；可能按新项目处理。');
  }
}

function cmdStatus(args) {
  const dir = needDir(args, 'status');
  console.log(fs.readFileSync(path.join(dir, 'STATUS.md'), 'utf8'));
}

function cmdCheck(args) {
  const dir = args[0] ? path.resolve(args[0]) : '';
  if (!dir) fail('check 需要一个项目目录');
  const p = projectPaths(dir);
  const required = [p.status, p.direction, p.blueprint, p.ledger, p.board, p.work, p.evidence, p.memory, p.landing, p.gates, p.inbox];
  const missing = required.filter((x) => !fs.existsSync(x));
  let failCount = 0;
  let warnCount = 0;
  console.log(`检查：${dir}`);
  if (missing.length) {
    failCount += missing.length;
    console.log(`  FAIL 缺少 ${missing.length} 个必需文件/目录：`);
    for (const m of missing) console.log(`    - ${m}`);
  } else {
    console.log('  OK   必需文件/目录齐全');
  }

  const status = fs.existsSync(p.status) ? fs.readFileSync(p.status, 'utf8') : '';
  const ownerMatch = status.match(/人类所有者：([^\n|]+)/);
  const owner = ownerMatch ? ownerMatch[1].trim() : '';
  if (!owner || /待补|未具名|TODO/i.test(owner)) {
    failCount++;
    console.log(`  FAIL 人类所有者未具名：“${owner || '（空）'}”`);
  } else {
    console.log(`  OK   人类所有者：${owner}`);
  }

  const ledger = fs.existsSync(p.ledger) ? fs.readFileSync(p.ledger, 'utf8') : '';
  const open = openHigh(ledger);
  if (open > 0) {
    warnCount++;
    console.log(`  WARN 开放 S1/S2：${open} 条（高风险门禁应暂停/缩小）`);
  } else {
    console.log('  OK   无开放 S1/S2');
  }

  const openCRs = openChanges(ledger);
  if (openCRs.length) {
    const high = openCRs.filter((l) => /\|\s*(charter|blueprint)\s*\|/.test(l));
    if (high.length) {
      warnCount++;
      console.log(`  WARN 开放变更：${high.length} 条 charter/blueprint（未裁决前不得扩大范围）`);
    } else {
      console.log(`  OK   开放变更：${openCRs.length} 条 task（阶段内处理）`);
    }
  } else {
    console.log('  OK   无开放变更');
  }

  if (fs.existsSync(p.status)) {
    const age = (Date.now() - fs.statSync(p.status).mtimeMs) / 86400000;
    if (age > 14) {
      warnCount++;
      console.log(`  WARN STATUS.md 已 ${age.toFixed(0)} 天未更新（>14 天）`);
    } else {
      console.log(`  OK   STATUS.md 更新于 ${age.toFixed(1)} 天前`);
    }
  }

  const stage = stageOf(status);
  const stateMatch = status.match(/- 阶段状态：([^\n]+)/);
  let stageState = stateMatch ? stageStateOf(stateMatch[1]) : '';
  if (!stageState) {
    if (/executing|执行中/i.test(stage)) stageState = 'executing';
    else if (/frozen|冻结/i.test(stage)) stageState = 'frozen';
    else stageState = 'seed';
  }

  const hasFreeze = Boolean(latestGate(p, 'charter-freeze'));
  const hasStart = Boolean(latestGate(p, 'start-order'));
  const bp = blueprintMeta(p);

  if (stageState !== 'seed') {
    if (!hasFreeze) {
      failCount++;
      console.log(`  FAIL 阶段已离开 seed 但没有 charter-freeze：${stage}`);
    } else {
      console.log('  OK   阶段基线已冻结（charter-freeze）');
    }

    if (!bp.ok) {
      failCount++;
      console.log(`  FAIL 蓝图未获人类批准：${bp.reason || '状态不是 approved 或批准人未具名'}`);
    } else {
      console.log(`  OK   蓝图已批准：${bp.version}（${bp.approver}）`);
    }

    if (stageState === 'executing') {
      if (!hasStart) {
        failCount++;
        console.log('  FAIL 阶段已在执行但没有 start-order（开工令）');
      } else {
        console.log('  OK   阶段已开工（start-order）');
      }
    } else if (hasStart) {
      if (stageState === 'frozen') {
        failCount++;
        console.log('  FAIL 阶段状态为 frozen 但已有 start-order；重新冻结后必须重新 start');
      } else {
        console.log(`  OK   阶段状态为 ${stageState}（保留开工令历史）`);
      }
    } else {
      console.log(`  OK   阶段状态为 ${stageState}，尚未开工（等待 start）`);
    }
  } else if (hasFreeze) {
    console.log('  OK   阶段基线已冻结（charter-freeze）');
  } else {
    console.log('  OK   仍在 seed（未冻结；执行前请 freeze + start）');
  }

  console.log(`结果：FAIL ${failCount}｜WARN ${warnCount}`);
  if (failCount) process.exit(1);
}

function demoDissentDetail() {
  return `# DR-001 · S2 · 风险/质量

- 日期：${DATE}
- 路由：直达（人类收件箱）
- 提出者/角色：人类目视（示例）
- 一句话主张：G2 常驻提醒遮挡授权/回答按钮，人类必须先关卡片才能操作。
- 事实依据：真机目视（示例，无截图）；F-002。
- 不确定性：无截图；G2-3 操作路径未记录。
- 影响：人类必须先关闭/移开卡片才能批准/回答；可逆但不可接受 → R2。
- 建议替代：不要求常驻；进入会话即收起卡片并关闭系统通知。
- 什么会改变我的判断：进入会话后卡片收起、按钮可点，且处理后不补弹。
- 请求动作：暂停 G2 高风险声明；修复后复验 G2-1~G2-7。

> S2：1 个工作日内接收、3 个工作日内裁决；未回应默认暂停/缩小。
`;
}

function demoGateBlocked() {
  return `# 门禁检查单 · G2-blocked

- 项目：demo-notify
- 日期：${DATE}
- 主持人：集群管家
- 决策：**暂停**

## 1. 关键事实（3–5 条）

| # | 事实 | 来源 | 状态 | 核验人 |
|---|---|---|---|---|
| 1 | 自动化 160/160 通过 | F-001 | 已核验 | verifier-agent |
| 2 | G2 常驻提醒遮挡授权/回答按钮 | F-002 | E2 人类目视（无截图） | 人类目视（示例） |

## 2. 主张 vs 事实（只列影响裁决的）

| 主张 | 来源 | 状态 | 差异 |
|---|---|---|---|
| “G2 可用” | 开发叙述 | **被反证** | 遮挡按钮，人类无法直接操作 |

## 3. 异议

- **开放 S1/S2：1 条（DR-001，阻断高风险）**
- 本周 S3/S4：0
- 需要人类裁决：进入会话即收起，是否接受？

## 4. 负事实

- G2-1 不通过；无截图；G2-3 操作路径未记录。

## 5. 决策与理由

- 结论：**暂停** G2 高风险声明。
- 理由：开放 S2 + 直接证据显示遮挡。
- 剩余风险与接受者：暂不接受；等修复复验。

## 6. 签署

- 集群管家：agent（示例）
- 工作区策展：agent（示例）
- 人类：待 DR-001 裁决
`;
}

function demoGateResolved() {
  return `# 门禁检查单 · G2-resolved

- 项目：demo-notify
- 日期：${DATE}
- 主持人：集群管家
- 决策：**有条件通过**

## 1. 关键事实（3–5 条）

| # | 事实 | 来源 | 状态 | 核验人 |
|---|---|---|---|---|
| 1 | DR-001 已关闭；改为“进入会话即收起” | ledger / DR-001 | 已核验 | 集群管家 |
| 2 | G2-1~G2-7 复验通过；G2-8 挂起 | 真机复验（示例） | E2 人类目视（无截图） | 人类目视（示例） |

## 2. 主张 vs 事实（只列影响裁决的）

| 主张 | 来源 | 状态 | 差异 |
|---|---|---|---|
| “G2-1 遮挡已消除” | 复验记录 | 已核验（有限） | 仅本机、无截图 |

## 3. 异议

- **开放 S1/S2：0**
- 本周 S3/S4：0
- 需要人类裁决：G2-8 未测，是否接受为遗留？

## 4. 负事实

- G2-8 双会话并发未测；无截图。

## 5. 决策与理由

- 结论：**有条件通过**。
- 理由：DR-001 关闭；G2-1~G2-7 通过；G2-8 由人类接受为遗留。
- 剩余风险与接受者：G2-8 未测 → Human Owner (demo)。

## 6. 签署

- 集群管家：agent（示例）
- 工作区策展：agent（示例）
- 人类：Human Owner (demo)
`;
}

function demoDirection() {  return `# 方向与边界 · demo-notify

> 人类所有者：Human Owner (demo)｜版本：v0.1｜日期：${DATE}
> 示例项目：演示“通知遮挡人类操作”如何被异议/事实/门禁接住。

## 1. 方向

- **目的**：让 agent 完成/等待授权时可见，不必盯着屏幕；不替人做决定。
- **受益者**：本机使用 DSH 的人类；成本由人类承担。
- **价值排序**：可信 > 不打扰 > 可定制 > 功能多。
- **成功定义**：完成与等待授权时提醒；不遮挡人类操作；可关闭。
- **失败定义**：误报/漏报关键授权；遮挡按钮；替人批准/拒绝；读会话正文。

## 2. 非目标

- 任务管理、通知历史、托盘/声音、自动操作、外部发布承诺。

## 3. 风险分级

| 级别 | 定义 | 例子 | 默认动作 |
|---|---|---|---|
| S1 | 迫近伤害/违法/不可逆/隐私 | 替人批准、外发数据 | 立即停；1h 知会；24h 人裁 |
| S2 | 高风险/越界/重大分歧 | 遮挡授权按钮 | 1 工作日内报告；未修复暂停能力 |
| S3 | 质量/进度受损 | 文案错、延迟 | 本地修；周会 |
| S4 | 改进建议 | 样式微调 | 本地/周会 |

## 4. 预算与停止

- 时间：2 周；成本：20 个有效 agent 回合。
- 停止：触发 S1；信号无法取证；需要新增依赖/改宿主；连续两道门禁失败。

## 5. 升级触发

- S1/S2 → 直达人类；S3/S4 → 集群管家 + 人类周抽样。
- 人类注意力预算：≤2 小时/周。

## 6. 边界变更

- 只有 Human Owner (demo) 能改方向/红线；升版本 + 理由 + 影响 + 确认。
`;
}

function demoBlueprint() {
  return `# 施工蓝图 · demo-notify

- 版本：v1
- 阶段：grow-1
- 日期：${DATE}
- 状态：approved
- 批准人：Human Owner (demo)

> 示例：这是“怎么做”的阶段基线，不是方向。只做 grow-1，不覆盖整个项目。

## 1. 本阶段目标

- 对应宪章目的：完成/等待授权可见，不替人操作。
- 本阶段可观察结果：提醒不遮挡按钮；进入会话即收起；可关闭。
- 本阶段非目标：任务管理、通知历史、托盘/声音、自动操作、外部发布。

## 2. 工作包

| ID | 工作包 | 负责人 | 输入 | 输出 | 验收判据 | 依赖 |
|---|---|---|---|---|---|---|
| WP-1 | 完成/授权提醒 | agent | 事件探针 | 提醒卡 | G1 5/5；不遮挡 | 无 |
| WP-2 | 会话进入即收起 | agent | WP-1 | 收起逻辑 | G2-1~7 通过；处理后不补弹 | WP-1 |
| WP-3 | 外观/关闭 | agent | WP-1 | 样式/开关 | G3 6/6 | WP-1 |

## 3. 接口与契约

| 接口 | 谁提供 | 谁消费 | 契约（输入/输出/错误） | 兼容策略 |
|---|---|---|---|---|
| 事件 → 提醒 | DSH 事件 | 提醒卡 | outcome/need-auth；未知事件忽略 | 只读，不改宿主 |
| 提醒卡 → 人类 | 提醒卡 | 人类 | 可见、可关、不遮挡授权按钮 | 失败即回退为静默 |

## 4. 未知与假设

| # | 未知/假设 | 影响 | 怎么验证 | 什么时候必须有答案 |
|---|---|---|---|---|
| 1 | 双会话并发行为 | G2-8 未测 | 两窗口实测 | 发布前 |
| 2 | 卡片时长是否够读 | G3-4b 未单独 | 真机计时 | 发布前 |

## 5. 本阶段不做

- 不做通知历史、托盘、声音、自动批准、外部发布。

## 6. 阶段验收

- 聚合判据：G1 5/5；G2 7/8；G3 6/6。
- 证据要求：E1 自动化输出；E2 人类真机目视（无截图要标注）。
- 允许的遗留：G2-8 / G3-4b，由人类书面接受。

## 7. 变更记录

| 版本 | 日期 | 变更 | 理由 | 批准人 |
|---|---|---|---|---|
| v1 | ${DATE} | 初版 | 进入 grow-1 | Human Owner (demo) |
`;
}

function demoStatus() {
  return `# STATUS · demo-notify

> **唯一当前状态页。** 最后更新：${DATE}｜人类所有者：Human Owner (demo)
> 规则：本页是当前状态；其他文档是证据/历史。冲突以本页为准。
> 证据等级：**E1** 运行事实｜**E2** 人类目视（无截图）｜**E3** 文档主张。

## 1. 当前阶段

- 阶段：land（示例）
- 阶段状态：seed
- 版本：v0.1.0-demo
- 当前目标：完成/等待授权可见，不替人操作
- 当前门禁：G2（blocked → resolved；最终有条件通过）

## 2. 当前证据

### 2.1 E1（运行事实）
- 自动化 160/160；node --check 17/17（示例数据）。
- 入口/路由探针：GET /outcome → 400/404（示例数据）。

### 2.2 E2（人类目视，无截图）
- G1 5/5；G2 7/8；G3 6/6（示例数据；本 demo 不声称真实）。

### 2.3 E3（文档主张）
- 历史 142/142、10-1-13（示例历史，未复核）。

## 3. 已接受遗留

| 项 | 内容 | 接受者 | 证据 |
|---|---|---|---|
| G2-8 | 双会话并发未测 | Human Owner (demo) | acceptance.md |
| G3-4b | 提醒卡时长未单独 | Human Owner (demo) | acceptance.md |

## 4. 未测 / 开放

| # | 项 | 状态 | 下一步 |
|---|---|---|---|
| 1 | 真机截图/录屏 | 零 | 下次真机默认截图 |
| 2 | 具名所有者 | 已填（demo） | 真实项目替换 |

## 5. 文档时效

| 文档 | 时效 | 说明 |
|---|---|---|
| STATUS.md | 当前 | 唯一当前状态 |
| human/direction.md | 当前 | 方向/边界 |
| BLUEPRINT.md | 当前 | 施工蓝图（grow-1） |
| ledger.md | 当前 | 异议/事实/变更 |
| gates/ | 历史 | 每道门当时的记录 |

## 6. 下一步

1. 真实项目把 demo 数据换成 E1/E2 实测。
2. 补 G2-8/G3-4b 真机 + 截图。
3. 每周抽样 1–2 条 S3/S4。
`;
}

function cmdDemo(args, flags) {
  const target = path.join(ROOT, 'examples', 'demo-project');
  const rel = path.relative(path.join(ROOT, 'examples'), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('demo 目标越界，拒绝删除');
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  cmdInit([target], { name: 'demo-notify', owner: 'Human Owner (demo)', goal: '完成/等待授权可见，不替人操作', force: true });
  const p = projectPaths(target);
  fs.writeFileSync(p.direction, demoDirection(), 'utf8');
  fs.writeFileSync(p.status, demoStatus(), 'utf8');
  fs.writeFileSync(p.blueprint, demoBlueprint(), 'utf8');
  cmdFreeze([target], {
    'charter-confirmed': true,
    stage: 'grow-1',
    scope: 'G2 授权提醒 + G3 外观；不含外部发布',
    budget: '2 周 / 20 个有效 agent 回合',
    stop: 'S1 / 预算耗尽 / 连续两道门禁失败',
    acceptance: 'G1 5/5、G2 7/8、G3 6/6；G2-8/G3-4b 可由人类接受为遗留',
  });
  cmdStart([target], {
    by: 'Human Owner (demo)',
    'first-report': 'G2 门禁前，或触发 S2 / 预算耗尽时',
  });
  // 变更示例：task 级吸收；blueprint 级被拒绝，防止范围蔓延
  cmdChange([target], {
    type: 'task',
    title: '提醒卡文案改为中文',
    reason: '人类可读',
    impact: '不改验收判据',
    by: 'agent',
    decision: '接受',
  });
  cmdChange([target], {
    type: 'blueprint',
    title: '把 G2-8 双会话并发纳入本阶段',
    reason: '希望一次做完',
    impact: '需两窗口实测，+1 周；可能超预算',
    by: 'Human Owner (demo)',
    decision: '拒绝',
  });
  fs.writeFileSync(
    path.join(p.landing, 'manifest.md'),
    `# 落地清单 · demo-notify\n\n- 版本：v0.1.0-demo\n- 可用：完成/授权提醒，不遮挡\n- 可运维：本机自用；重启/刷新路径已写\n- 可交接：STATUS + 台账 + 门禁\n- 可审计：事实/异议均有 ID\n- 成本：本机零依赖\n- 遗留：G2-8、G3-4b 已接受（示例）\n- 照护者：Human Owner (demo)\n- 退役：删除插件 + 还原 profile\n`,
    'utf8',
  );

  // 示例异议/事实/门禁/裁决
  cmdFact([target], { statement: '自动化 160/160 通过，node --check 17/17', source: 'node --test（示例输出）', status: '已核验', verifier: 'verifier-agent' });
  cmdFact([target], { statement: 'G2 常驻提醒遮挡会话底部授权/回答按钮', source: '人类目视（示例，无截图）', status: '已捕获', verifier: '人类目视' });
  cmdDissent([target], { severity: 'S2', type: '风险/质量', claim: 'G2 常驻提醒遮挡授权/回答按钮，人类必须先关卡片才能操作', evidence: '真机目视（示例，无截图）', route: '直达', owner: '人类目视（示例）' });
  fs.writeFileSync(path.join(p.inbox, 'DR-001.md'), demoDissentDetail(), 'utf8');
  cmdGate([target], { name: 'G2-blocked', decision: '暂停', host: '集群管家' });
  fs.writeFileSync(path.join(p.gates, `${DATE}-g2-blocked.md`), demoGateBlocked(), 'utf8');
  cmdResolve([target], { id: 'DR-001', decision: '接受：改为进入会话即收起；复验 G2-1~G2-7 通过' });
  cmdGate([target], { name: 'G2-resolved', decision: '有条件通过', host: '集群管家' });
  fs.writeFileSync(path.join(p.gates, `${DATE}-g2-resolved.md`), demoGateResolved(), 'utf8');
  cmdAccept([target], { item: 'G2 7/8；G2-8 未测', decision: '有条件接受', evidence: '真机目视（示例，无截图）', risk: 'G2-8 双会话并发未测', by: 'Human Owner (demo)' });
  cmdAccept([target], { item: 'G3 6/6；G3-4b 未单独', decision: '有条件接受', evidence: '真机目视（示例，无截图）', risk: 'G3-4b 未单独实测', by: 'Human Owner (demo)' });
  cmdLog([target], { decision: '发布 v0.1.0-demo', reason: 'G2-1 遮挡已修复；接受 G2-8/G3-4b 遗留' });

  let finalStatus = fs.readFileSync(p.status, 'utf8')
    .replace(/- 阶段：.*/, '- 阶段：grow-1（closed）')
    .replace(/- 阶段状态：.*/, '- 阶段状态：closed');
  fs.writeFileSync(p.status, finalStatus, 'utf8');

  console.log('\n=== Demo 完成 ===');
  console.log(`项目：${target}`);
  console.log('阅读顺序：STATUS.md → human/direction.md → BLUEPRINT.md → gates/（charter-freeze → start-order → g2-blocked → g2-resolved）→ ledger.md → workspace/landing/manifest.md');
  console.log(`检查：node bin/aecw.mjs check "${target}"`);
  console.log('说明：这是原型演示数据，不是真实验收；真实项目必须换成 E1/E2 实测。');
}

function main() {
  const { args, flags } = parse(process.argv.slice(2));
  const cmd = args.shift();
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return usage();
  switch (cmd) {
    case 'init': return cmdInit(args, flags);
    case 'blueprint': return cmdBlueprint(args, flags);
    case 'freeze': return cmdFreeze(args, flags);
    case 'start': return cmdStart(args, flags);
    case 'change': return cmdChange(args, flags);
    case 'status': return cmdStatus(args);
    case 'dissent': return cmdDissent(args, flags);
    case 'fact': return cmdFact(args, flags);
    case 'gate': return cmdGate(args, flags);
    case 'resolve': return cmdResolve(args, flags);
    case 'accept': return cmdAccept(args, flags);
    case 'log': return cmdLog(args, flags);
    case 'check': return cmdCheck(args);
    case 'demo': return cmdDemo(args, flags);
    default: return fail(`未知命令：${cmd}（用 help 查看）`);
  }
}

main();
