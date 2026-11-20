const assert = require('node:assert/strict');
const test = require('node:test');
const { popoverBounds } = require('../src/popover.cjs');

test('opens below a menu-bar item and keeps the right edge on screen', () => {
  assert.deepEqual(popoverBounds(
    { x: 1420, y: 0, width: 65, height: 28 },
    { x: 0, y: 28, width: 1512, height: 950 },
    { width: 242, height: 200 }
  ), { x: 1270, y: 32, width: 242, height: 200 });
});

test('opens above a bottom taskbar on a secondary display', () => {
  assert.deepEqual(popoverBounds(
    { x: -104, y: 1041, width: 24, height: 32 },
    { x: -1920, y: 0, width: 1920, height: 1040 },
    { width: 242, height: 200 }
  ), { x: -242, y: 837, width: 242, height: 200 });
});
