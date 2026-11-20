const { BrowserWindow, session } = require('electron');
const { setTimeout: delay } = require('node:timers/promises');
const { summarizeAllowance } = require('./allowance.cjs');
const { readVisibleAllowance, openVisibleAllowanceLink, hasSignInChallenge } = require('./page-reader.cjs');

const PORTAL = 'https://shop.10086.cn/i/?f=packremainqry';
const SIGN_IN_SETTLE_MS = 1800;

function isOfficial(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname === '10086.cn' || url.hostname.endsWith('.10086.cn'));
  } catch {
    return false;
  }
}

function isSignIn(value) {
  return isOfficial(value) && (new URL(value).hostname === 'login.10086.cn'
    || /\/(?:login|ssoLogin)(?:[./]|$)/i.test(new URL(value).pathname));
}

function createPortal(onReturnToPortal) {
  let window;
  let navigationInProgress;
  let refreshAfterSignIn = false;
  let quitting = false;
  const carrierSession = session.fromPartition('persist:china-mobile');
  carrierSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
  carrierSession.setPermissionCheckHandler(() => false);

  function ensureWindow() {
    if (window && !window.isDestroyed()) return window;
    window = new BrowserWindow({
      title: '中国移动官方营业厅 · 10086.cn',
      show: false,
      width: 960,
      height: 720,
      minWidth: 540,
      minHeight: 460,
      webPreferences: {
        session: carrierSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });
    window.removeMenu();
    const contents = window.webContents;
    const guard = (event, target) => {
      if (!isOfficial(typeof target === 'string' ? target : target?.url)) event.preventDefault();
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.setWindowOpenHandler(({ url }) => {
      if (isOfficial(url)) {
        setImmediate(() => {
          if (!contents.isDestroyed()) contents.loadURL(url).catch(() => {});
        });
      }
      return { action: 'deny' };
    });
    contents.on('did-navigate', (_event, url) => {
      if (isSignIn(url)) {
        refreshAfterSignIn = true;
      } else if (refreshAfterSignIn && isOfficial(url)) {
        refreshAfterSignIn = false;
        onReturnToPortal();
      }
    });
    window.on('close', event => {
      if (quitting) return;
      event.preventDefault();
      window.hide();
    });
    window.on('closed', () => {
      window = undefined;
      refreshAfterSignIn = false;
    });
    return window;
  }

  function navigate(target) {
    if (navigationInProgress) return navigationInProgress;
    const contents = target.webContents;
    let timeout;
    let onSignIn;
    const signIn = new Promise(resolve => {
      onSignIn = (_event, url) => { if (isSignIn(url)) resolve(); };
      contents.on('did-navigate', onSignIn);
    });
    navigationInProgress = Promise.race([
      target.loadURL(PORTAL).catch(error => {
        if (!contents.isDestroyed() && (isSignIn(contents.getURL()) || error.errno === -3 || error.code === 'ERR_ABORTED')) return;
        throw error;
      }),
      signIn,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          if (!contents.isDestroyed() && !target.isVisible()) contents.stop();
          reject(new Error('Portal navigation timed out'));
        }, 16000);
      })
    ]).finally(() => {
      clearTimeout(timeout);
      contents.removeListener('did-navigate', onSignIn);
      navigationInProgress = undefined;
    });
    return navigationInProgress;
  }

  async function scan(target) {
    if (target.isDestroyed()) return { status: 'error' };
    const contents = target.webContents;
    let opened = false;
    let signInSince;
    const deadline = Date.now() + 12500;
    while (!contents.isDestroyed() && Date.now() < deadline) {
      const url = contents.getURL();
      if (isSignIn(url)) {
        signInSince ??= Date.now();
        if (Date.now() - signInSince >= SIGN_IN_SETTLE_MS) {
          const challenge = await contents.mainFrame.executeJavaScript(`(${hasSignInChallenge})(document)`).catch(() => false);
          if (challenge && isSignIn(contents.getURL())) return { status: 'need-login' };
        }
        await delay(600);
        continue;
      }
      signInSince = undefined;
      const frames = contents.mainFrame.framesInSubtree.filter(frame => isOfficial(frame.url) && !isSignIn(frame.url));
      const all = await Promise.all(frames.map(async frame => {
        try {
          return await frame.executeJavaScript(`(${readVisibleAllowance})(document)`);
        } catch {
          return { tables: [], totals: [] };
        }
      }));
      const balance = summarizeAllowance({
        tables: all.flatMap(result => result.tables),
        totals: all.flatMap(result => result.totals)
      });
      if (balance) balance.queriedAt = all.find(result => result.queriedAt)?.queriedAt;
      if (balance?.hasDetails) return { status: 'ready', balance };
      if (!opened) {
        for (const frame of frames) {
          try {
            opened = await frame.executeJavaScript(`(${openVisibleAllowanceLink})(document)`);
          } catch {
            continue;
          }
          if (opened) break;
        }
      }
      if (balance && !opened) return { status: 'ready', balance };
      if (balance && Date.now() + 700 >= deadline) return { status: 'ready', balance };
      await delay(600);
    }
    const remainsOnSignIn = !contents.isDestroyed() && isSignIn(contents.getURL());
    return { status: remainsOnSignIn ? 'need-login' : 'unverified' };
  }

  async function query(mode) {
    const target = ensureWindow();
    if (!target.webContents.getURL() || (mode !== 'current' && !target.isVisible())) {
      await navigate(target);
    }
    const result = await scan(target);
    if (result.status === 'ready') {
      carrierSession.flushStorageData();
      await carrierSession.cookies.flushStore().catch(() => {});
    }
    return result;
  }

  async function show() {
    const target = ensureWindow();
    target.show();
    target.focus();
    if (!target.webContents.getURL() || !isOfficial(target.webContents.getURL())) await navigate(target);
  }

  return { query, show, prepareToQuit: () => { quitting = true; } };
}

module.exports = { createPortal };
