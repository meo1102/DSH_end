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

test('D02 暂停不 dismiss，恢复后按剩余时间 dismiss', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 5000, () => {
    fired += 1;
  });

  timer.start();
  clock.advance(3000);
  timer.pause();
  clock.advance(10000);
  assert.equal(fired, 0, '暂停期间不得消失');
  assert.equal(timer.remaining(), 2000);

  timer.resume();
  clock.advance(1999);
  assert.equal(fired, 0, '恢复后未到剩余时间不得消失');
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

test('D04 挂载前 pause/resume 为无操作，start 才计时', () => {
  const clock = createClock();
  let fired = 0;
  const timer = createTimer(clock, 1000, () => {
    fired += 1;
  });

  timer.pause();
  timer.resume();
  clock.advance(5000);
  assert.equal(fired, 0);
  timer.start();
  clock.advance(1000);
  assert.equal(fired, 1);
});
