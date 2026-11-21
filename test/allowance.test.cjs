const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAllowance, formatAmount } = require('../src/allowance.cjs');

const gb = 1024 ** 3;
const row = (name, remaining, unit = '') => ({ name, remaining, unit });

test('all package types count, and summary rows and cloned tables do not double count', () => {
  const table = [
    row('国内通用流量', '8.42 GB'),
    row('视频定向流量', '4096 MB'),
    row('闲时流量', '1GB'),
    row('流量合计', '13.42 GB'),
    row('国内语音', '20 分钟')
  ];
  const balance = summarizeAllowance({ tables: [table, table], totals: ['13.42 GB'] });
  assert.equal(formatAmount(balance.bytes), '13.42 GB');
  assert.deepEqual(balance.categories.map(item => [item.label, formatAmount(item.bytes)]), [
    ['通用流量', '8.42 GB'], ['定向流量', '4 GB'], ['其他流量', '1 GB']
  ]);
});

test('includes separate same-name packs and accepts units in the column heading', () => {
  const table = [row('国内流量', '0 MB'), row('通用流量加油包', '512', 'MB'), row('通用流量加油包', '512 MB')];
  assert.equal(summarizeAllowance({ tables: [table] }).bytes, gb);
});

test('prefers complete detail over a matching per-category subtotal', () => {
  const table = [row('通用流量小计', '2 GB'), row('国内通用流量', '1 GB'), row('通用加油包', '1 GB')];
  assert.equal(summarizeAllowance({ tables: [table] }).bytes, 2 * gb);
});

test('recognizes aggregate voice-and-data tables without treating voice as a package', () => {
  const table = [row('上网', '512MB'), row('短信', '4条'), row('本地语音', '5分钟')];
  assert.equal(summarizeAllowance({ tables: [table] }).bytes, gb / 2);
});

test('uses a clearly labeled total alone with a flag for missing package detail', () => {
  assert.deepEqual(summarizeAllowance({ totals: ['0MB'] }), { bytes: 0, categories: [], hasDetails: false });
});

test('a carrier package explicitly marked exhausted has zero remaining', () => {
  const balance = summarizeAllowance({
    tables: [[row('国内通用流量', '已用完'), row('定向流量', '0'), row('闲时流量', '无剩余流量')]]
  });
  assert.equal(formatAmount(balance.bytes), '0 MB');
  assert.equal(balance.categories.length, 3);
});

test('unreadable rows and conflicting totals never appear as complete balances', () => {
  assert.equal(summarizeAllowance({ tables: [[row('通用流量', '1 GB'), row('定向流量', '--')]] }), null);
  assert.equal(summarizeAllowance({ tables: [[row('通用流量', '1 GB')]], totals: ['4 GB'] }), null);
  assert.equal(summarizeAllowance({ tables: [[row('通用流量', '1 GB')], [row('国内通用流量', '2 GB')]] }), null);
  assert.equal(summarizeAllowance({ tables: [[row('通用流量', '1 GB / 3 GB')]] }), null);
  assert.equal(summarizeAllowance({ tables: [] }), null);
});
