const details = document.getElementById('details');
const detailAmount = document.getElementById('detail-amount');
const summary = document.getElementById('summary');
const status = document.getElementById('status');
const categories = document.getElementById('categories');
const guidance = document.getElementById('guidance');
const updated = document.getElementById('updated');
const refresh = document.getElementById('refresh');
const login = document.getElementById('login');

const labels = {
  idle: '正在查询',
  refreshing: '正在查询',
  ready: '已更新',
  cached: '上次结果',
  'need-login': '需要验证',
  unverified: '余量待核对',
  error: '暂时查不到'
};

function render(state) {
  if (!state) return;
  const { status: kind, balance } = state;
  status.textContent = labels[kind];
  status.dataset.kind = kind;
  refresh.disabled = kind === 'refreshing';
  summary.hidden = !balance;
  detailAmount.textContent = balance?.amount ?? '';
  categories.hidden = !balance?.categories.length;
  const entries = balance?.categories ?? [];
  categories.replaceChildren(...entries.map(entry => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = entry.label;
    value.textContent = entry.amount;
    row.append(label, value);
    return row;
  }));
  const messages = {
    'need-login': '请在营业厅完成验证后刷新。',
    unverified: '请在营业厅打开「套餐余量查询」后刷新。',
    error: '请稍后刷新，或打开营业厅查看。'
  };
  const message = messages[kind] ?? (balance && !balance.hasDetails ? '官网只显示了合计，分类明细待核对。' : '');
  guidance.hidden = !message;
  guidance.textContent = message;

  const time = balance?.checkedAt ? new Date(balance.checkedAt) : null;
  updated.dateTime = balance?.checkedAt ?? '';
  updated.textContent = time
    ? `更新于 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(time)}`
    : '';
  void window.dataBar.resize(Math.ceil(details.getBoundingClientRect().height) + 8);
}

login.addEventListener('click', () => { void window.dataBar.openPortal(); });
refresh.addEventListener('click', () => { void window.dataBar.refresh(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') void window.dataBar.dismiss();
});
window.dataBar.onState(render);
void window.dataBar.initialState().then(render);
