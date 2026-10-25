#!/usr/bin/env node
// TaskFlow 可执行入口：把命令行参数交给 cli.run，退出码由它决定。
import { run } from '../src/cli.js';

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error('未预期的错误：', error);
  process.exitCode = 1;
}