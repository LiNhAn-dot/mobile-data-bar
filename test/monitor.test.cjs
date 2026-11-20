const test = require('node:test');
const assert = require('node:assert/strict');
const { createMonitor } = require('../src/monitor.cjs');

const saved = { bytes: 123, categories: [], hasDetails: false, checkedAt: '2026-11-20T01:00:00.000Z' };

test('coalesces concurrent refreshes and records the successful time', async () => {
  let count = 0;
  const changes = [];
  const monitor = createMonitor({
    query: async () => { count++; return { status: 'ready', balance: saved }; },
    now: () => new Date('2026-11-20T02:00:00Z'),
    onChange: state => changes.push(state)
  });
  await Promise.all([monitor.refresh(), monitor.refresh()]);
  assert.equal(count, 1);
  assert.equal(monitor.state.balance.checkedAt, '2026-11-20T02:00:00.000Z');
  assert.deepEqual(changes.map(state => state.status), ['refreshing', 'ready']);
});

test('sign-in and failed lookups preserve the last confirmed result and timestamp', async () => {
  const monitor = createMonitor({
    cached: saved,
    query: async mode => {
      if (mode === 'throw') throw new Error('network error');
      return { status: 'need-login' };
    }
  });
  await monitor.refresh('throw');
  assert.equal(monitor.state.status, 'error');
  assert.deepEqual(monitor.state.balance, saved);
  await monitor.refresh();
  assert.equal(monitor.state.status, 'need-login');
  assert.deepEqual(monitor.state.balance, saved);
});

test('uses the carrier query timestamp when the page supplies one', async () => {
  const queriedAt = '2026-11-20T01:50:00.000Z';
  const monitor = createMonitor({
    query: async () => ({ status: 'ready', balance: { ...saved, queriedAt } }),
    now: () => new Date('2026-11-20T02:00:00Z')
  });
  await monitor.refresh();
  assert.equal(monitor.state.balance.checkedAt, queriedAt);
});
