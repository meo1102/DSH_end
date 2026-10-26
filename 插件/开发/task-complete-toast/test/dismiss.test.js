import test from 'node:test';
import assert from 'node:assert/strict';

import { loadClientModule } from './harness.js';

const { factory } = loadClientModule();
const { createDismissTimer } = factory.__test__;

function createClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => time,
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: time + Math.max(0, delay), callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = time + Math.max(0, ms);
      for (;;) {
        let due = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (due === null || timer.at < due.timer.at)) {
            due = { id, timer };
          }
        }
        if (due === null) break;
        timers.delete(due.id);
        time = due.timer.at;
        due.timer.callback();
      }
      time = target;
    },
  };
}

function createTimer(clock, durationMs, onExpire) {
  return createDismissTimer({
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  }, durationMs, onExpire);
}

test('D01 durationMs 到期触发 dismiss', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 5000, () => {
    fired += 1;
  });

  timer.start();
  clock.advance(4999);
  assert.equal(fired, 0);
  clock.advance(1);
  assert.equal(fired, 1);
  timer.dispose();
});

test('D03 dispose 后不再触发', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 1000, () => {
    fired += 1;
  });

  timer.start();
  timer.dispose();
  clock.advance(5000);
  assert.equal(fired, 0);
});

test('D04 挂载前 enter/leave 为无操作，start 才计时', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 1000, () => {
    fired += 1;
  });

  timer.enter();
  timer.leave();
  clock.advance(5000);
  assert.equal(fired, 0);
  timer.start();
  clock.advance(1000);
  assert.equal(fired, 1);
});

test('D05 移入后等待 10s 不消失，移出后重新完整 5s', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 5000, () => {
    fired += 1;
  });

  timer.start();
  clock.advance(3000);
  timer.enter();
  clock.advance(10000);
  assert.equal(fired, 0, '移入期间不得消失');

  timer.leave();
  clock.advance(4999);
  assert.equal(fired, 0, '移出后未满完整 5s 不得消失');
  clock.advance(1);
  assert.equal(fired, 1);
  timer.dispose();
});

test('D06 第 3 秒移出 → 第 8 秒消失（不恢复剩余）', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 5000, () => {
    fired += 1;
  });

  timer.start();
  clock.advance(1000);
  timer.enter();
  clock.advance(2000); // t=3000 移出
  timer.leave();

  clock.advance(4999); // t=7999：旧语义会在 t=7000 消失
  assert.equal(fired, 0, '移出后必须重新等满 5s');
  clock.advance(1); // t=8000
  assert.equal(fired, 1);
  timer.dispose();
});

test('D07 第 3 秒移出、第 7 秒移入、第 9 秒移出 → 第 14 秒消失', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 5000, () => {
    fired += 1;
  });

  timer.start();
  clock.advance(1000);
  timer.enter();
  clock.advance(2000); // t=3000
  timer.leave();
  clock.advance(4000); // t=7000
  timer.enter();
  clock.advance(2000); // t=9000
  timer.leave();

  clock.advance(4999); // t=13999
  assert.equal(fired, 0, '每次移出都重新起算 5s');
  clock.advance(1); // t=14000
  assert.equal(fired, 1);
  timer.dispose();
});

test('D08 焦点进入取消、离开重新 5s；held 期间重复 enter 不重置', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 5000, () => {
    fired += 1;
  });

  timer.start();
  timer.enter();
  clock.advance(1000);
  timer.enter(); // 卡片内部换焦点：held 状态下重复 enter 必须无操作
  clock.advance(4000);
  assert.equal(fired, 0, 'held 期间不得消失');

  timer.leave();
  clock.advance(4999);
  assert.equal(fired, 0, '离开后重新完整 5s');
  clock.advance(1);
  assert.equal(fired, 1);
  timer.dispose();
});
