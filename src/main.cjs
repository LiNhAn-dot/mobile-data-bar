const { app, BrowserWindow, ipcMain, Menu, screen, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { formatAmount } = require('./allowance.cjs');
const { createMonitor } = require('./monitor.cjs');
const { createPortal } = require('./portal.cjs');
const { popoverBounds } = require('./popover.cjs');

const PANEL_WIDTH = 242;
const REFRESH_INTERVAL = 20 * 60 * 1000;
let panel;
let tray;
let panelHeight = 140;
let dismissedAt = 0;

app.setName('流量监控');
if (process.env.MOBILE_DATA_BAR_DATA_DIR) app.setPath('userData', path.resolve(process.env.MOBILE_DATA_BAR_DATA_DIR));

function placePanel() {
  if (!panel || panel.isDestroyed() || !tray) return;
  const bounds = tray.getBounds();
  const anchor = bounds.width > 0 ? bounds : { ...screen.getCursorScreenPoint(), width: 1, height: 1 };
  const workArea = screen.getDisplayMatching(anchor).workArea;
  panel.setBounds(popoverBounds(anchor, workArea, { width: PANEL_WIDTH, height: panelHeight }));
}

function dismissPanel() {
  if (!panel?.isVisible()) return;
  dismissedAt = Date.now();
  panel.hide();
}

function updateTray({ status, balance }) {
  if (!tray) return;
  const amount = balance?.amount;
  if (process.platform === 'darwin') tray.setTitle(amount ?? '', { fontType: 'monospacedDigit' });
  const needsLogin = status === 'need-login' ? ' · 需要验证' : '';
  tray.setToolTip(amount ? `流量监控 · ${amount}${needsLogin}` : `流量监控${needsLogin}`);
}

function loadCache(file) {
  try {
    const item = JSON.parse(fs.readFileSync(file, 'utf8'));
    const categoriesValid = Array.isArray(item.categories) && item.categories.every(category =>
      typeof category.label === 'string' && Number.isSafeInteger(category.bytes) && category.bytes >= 0);
    if (Number.isSafeInteger(item.bytes) && item.bytes >= 0 && categoriesValid
      && Number.isFinite(Date.parse(item.checkedAt))) return item;
  } catch {
    return null;
  }
  return null;
}

function saveCache(file, balance) {
  try {
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(balance), { mode: 0o600 });
    fs.renameSync(temp, file);
  } catch (error) {
    console.warn('Unable to persist last successful balance.', error.code);
  }
}

function displayState({ status, balance }) {
  if (!balance) return { status, balance: null };
  return {
    status,
    balance: {
      amount: formatAmount(balance.bytes),
      checkedAt: balance.checkedAt,
      categories: balance.categories.map(category => ({ label: category.label, amount: formatAmount(category.bytes) })),
      hasDetails: balance.hasDetails
    }
  };
}

function createPanel() {
  const window = new BrowserWindow({
    title: '流量监控',
    width: PANEL_WIDTH,
    height: panelHeight,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  window.setAlwaysOnTop(true, 'floating');
  window.removeMenu();
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('render-process-gone', () => app.quit());
  window.on('blur', dismissPanel);
  return window;
}

async function run() {
  const file = path.join(app.getPath('userData'), 'last-balance.json');
  const portal = createPortal(() => void monitor.refresh('current'));
  const monitor = createMonitor({
    cached: loadCache(file),
    query: portal.query,
    onChange: state => {
      if (state.status === 'ready') saveCache(file, state.balance);
      const display = displayState(state);
      updateTray(display);
      if (panel && !panel.isDestroyed()) panel.webContents.send('bar:state', display);
    }
  });

  panel = createPanel();
  screen.on('display-metrics-changed', placePanel);
  screen.on('display-added', placePanel);
  screen.on('display-removed', placePanel);

  function bind(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!panel || panel.isDestroyed() || event.sender !== panel.webContents) return;
      return handler(...args);
    });
  }

  const openPortal = () => portal.show().catch(() => {});
  bind('bar:get-state', () => displayState(monitor.state));
  const refresh = () => monitor.refresh('manual');
  bind('bar:refresh', refresh);
  bind('bar:open-portal', openPortal);
  bind('bar:resize', height => {
    if (!Number.isInteger(height) || height < 65 || height > 384) return;
    panelHeight = height;
    placePanel();
  });
  bind('bar:dismiss', dismissPanel);

  const menu = Menu.buildFromTemplate([
    { label: '打开中国移动营业厅', click: openPortal },
    { label: '刷新余量', click: refresh },
    { type: 'separator' },
    { label: '退出流量监控', role: 'quit' }
  ]);
  await panel.loadFile(path.join(__dirname, 'panel.html'));
  if (process.platform === 'darwin') app.dock?.hide();
  const icon = process.platform === 'win32' ? 'signal.ico' : 'signalTemplate.png';
  tray = new Tray(path.join(__dirname, 'icons', icon));
  updateTray(displayState(monitor.state));
  tray.on('click', () => {
    if (panel.isVisible()) {
      dismissPanel();
    } else if (Date.now() - dismissedAt > 175) {
      placePanel();
      panel.show();
    }
  });
  tray.on('right-click', () => tray.popUpContextMenu(menu));
  void monitor.refresh();
  const timer = setInterval(() => {
    if (monitor.state.status !== 'need-login') void monitor.refresh();
  }, REFRESH_INTERVAL);
  app.once('before-quit', () => {
    portal.prepareToQuit();
    clearInterval(timer);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(run).catch(error => {
    console.error(error);
    app.exit(1);
  });
}
