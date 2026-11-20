const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, Tray } = require('electron');
const { formatAmount, summarizeAllowance } = require('../src/allowance.cjs');
const { readVisibleAllowance } = require('../src/page-reader.cjs');
const { createPortal } = require('../src/portal.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'data-bar-smoke-'));
app.setPath('userData', directory);
app.on('window-all-closed', () => {});

async function testCarrierRedirect() {
  const carrier = session.fromPartition('persist:china-mobile');
  const fixture = fs.readFileSync(path.join(__dirname, '../test/fixtures/card-allowance.html'), 'utf8');
  const queryUrl = 'https://shop.10086.cn/i/?f=packremainqry&restored=1';
  let canRestore = true;
  carrier.protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.searchParams.has('restored')) {
      return new Response(fixture, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
    if (url.hostname === 'shop.10086.cn') return Response.redirect('https://login.10086.cn/test');
    const page = canRestore
      ? `正在登录<script>setTimeout(() => location.replace(${JSON.stringify(queryUrl)}), 400)</script>`
      : '<main>扫码登录</main>';
    return new Response(page, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  });

  let restoredNavigations = 0;
  const portal = createPortal(() => { restoredNavigations++; });
  const result = await portal.query();
  assert.equal(result.status, 'ready');
  assert.equal(formatAmount(result.balance.bytes), '13.42 GB');
  assert.equal(restoredNavigations, 1);
  canRestore = false;
  assert.deepEqual(await portal.query(), { status: 'need-login' });
  portal.prepareToQuit();
}

async function test() {
  const portal = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await portal.loadFile(path.join(__dirname, '../test/fixtures/allowance.html'));
  const source = await portal.webContents.executeJavaScript(`(${readVisibleAllowance})(document)`);
  assert.deepEqual(source.totals, ['13.42 GB']);
  assert.equal(source.tables[0].length, 3);
  const balance = summarizeAllowance(source);
  assert.equal(formatAmount(balance.bytes), '13.42 GB');
  await portal.loadFile(path.join(__dirname, '../test/fixtures/card-allowance.html'));
  const cards = await portal.webContents.executeJavaScript(`(${readVisibleAllowance})(document)`);
  assert.equal(cards.tables[0].length, 4);
  assert.equal(formatAmount(summarizeAllowance(cards).bytes), '13.42 GB');
  assert.equal(cards.queriedAt, '2026-11-20T12:00:00.000Z');
  portal.destroy();

  const icon = process.platform === 'win32' ? 'signal.ico' : 'signalTemplate.png';
  const tray = new Tray(path.join(__dirname, '../src/icons', icon));
  if (process.platform === 'darwin') {
    tray.setTitle('13.42 GB');
    assert.equal(tray.getTitle(), '13.42 GB');
  }
  assert.ok(tray.getBounds().width > 0);
  const panel = new BrowserWindow({
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    width: 242,
    height: 140,
    webPreferences: { sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, '../src/preload.cjs') }
  });
  const displayedBalance = {
    amount: formatAmount(balance.bytes),
    categories: balance.categories.map(category => ({ label: category.label, amount: formatAmount(category.bytes) })),
    checkedAt: '2026-11-20T02:00:00Z',
    hasDetails: true
  };
  ipcMain.handle('bar:get-state', () => ({ status: 'ready', balance: displayedBalance }));
  ipcMain.handle('bar:resize', (_event, height) => panel.setContentSize(242, height));
  await panel.loadFile(path.join(__dirname, '../src/panel.html'));
  await panel.webContents.executeJavaScript(`new Promise(resolve => {
    if (document.querySelector('#detail-amount').textContent === '13.42 GB') resolve();
    else new MutationObserver((_, observer) => { observer.disconnect(); resolve(); })
      .observe(document.querySelector('#detail-amount'), { childList: true });
  })`);
  assert.equal(panel.isAlwaysOnTop(), true);
  assert.equal(panel.isVisible(), false);
  assert.equal(await panel.webContents.executeJavaScript("document.querySelectorAll('#categories dt').length"), 3);
  panel.webContents.send('bar:state', { status: 'need-login', balance: displayedBalance });
  await panel.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(resolve))`);
  assert.equal(await panel.webContents.executeJavaScript("document.querySelector('#status').textContent"), '需要验证');
  assert.equal(await panel.webContents.executeJavaScript("document.querySelector('#detail-amount').textContent"), '13.42 GB');
  assert.equal(await panel.webContents.executeJavaScript("document.querySelector('#updated').dateTime"), displayedBalance.checkedAt);
  panel.destroy();
  tray.destroy();
  await testCarrierRedirect();
  console.log('Electron fixture smoke test passed on ' + process.platform);
}

app.whenReady().then(test).then(() => app.exit(0), error => {
  console.error(error);
  app.exit(1);
});
