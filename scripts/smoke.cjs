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
  let unavailable = false;
  let loginRequests = 0;
  const html = body => new Response(body, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  carrier.protocol.handle('https', request => {
    const url = new URL(request.url);
    if (unavailable) return html('<main>查询暂不可用</main>');
    if (url.searchParams.has('restored')) return html(fixture);
    if (url.hostname === 'shop.10086.cn') return Response.redirect('https://login.10086.cn/test');
    loginRequests++;
    const page = canRestore
      ? `正在登录<script>setTimeout(() => location.replace(${JSON.stringify(queryUrl)}), 400)</script>`
      : '<main>扫码登录</main>';
    return html(page);
  });

  let restoredNavigations = 0;
  const portal = createPortal(() => { restoredNavigations++; });
  const result = await portal.query();
  assert.equal(result.status, 'ready');
  assert.equal(formatAmount(result.balance.bytes), '13.42 GB');
  assert.equal(restoredNavigations, 1);
  canRestore = false;
  assert.deepEqual(await portal.query(), { status: 'need-login' });
  await portal.show();
  const requestsBeforeRefresh = loginRequests;
  assert.deepEqual(await portal.query('manual'), { status: 'need-login' });
  assert.equal(loginRequests, requestsBeforeRefresh, 'Refreshing leaves verification in progress alone');
  portal.prepareToQuit();

  const retry = createPortal(() => {});
  unavailable = true;
  await retry.show();
  unavailable = false;
  canRestore = true;
  const refreshed = await retry.query('manual');
  assert.equal(refreshed.status, 'ready', 'Manual refresh makes a new request even with the portal open');
  assert.equal(formatAmount(refreshed.balance.bytes), '13.42 GB');
  retry.prepareToQuit();
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
  const withoutTimestamp = fs.readFileSync(path.join(__dirname, '../test/fixtures/card-allowance.html'), 'utf8')
    .replace(/<p>查询时间：[^<]*<\/p>/, '');
  await portal.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(withoutTimestamp)}`);
  const undatedCards = await portal.webContents.executeJavaScript(`(${readVisibleAllowance})(document)`);
  assert.equal(undatedCards.queriedAt, null);
  assert.equal(formatAmount(summarizeAllowance(undatedCards)?.bytes ?? 0), '13.42 GB',
    'A complete allowance section is readable without a carrier timestamp');
  const exhausted = withoutTimestamp.replace(/剩余 [\d.]+ (?:GB|MB)/g, '已用完');
  await portal.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(exhausted)}`);
  const exhaustedCards = await portal.webContents.executeJavaScript(`(${readVisibleAllowance})(document)`);
  assert.equal(summarizeAllowance(exhaustedCards)?.bytes, 0, 'Exhausted packages still report a balance');
  await portal.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<p>剩余流量合计：0</p>'));
  const unitlessZero = await portal.webContents.executeJavaScript(`(${readVisibleAllowance})(document)`);
  assert.equal(summarizeAllowance(unitlessZero)?.bytes, 0, 'An explicitly labeled zero total needs no unit');
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
