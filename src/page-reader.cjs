function readVisibleAllowance(document) {
  const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const text = element => normalize(element?.innerText);
  const visible = element => element && element.getClientRects().length > 0
    && document.defaultView.getComputedStyle(element).visibility === 'visible';
  const totals = new Set();
  const balanceLabels = /^(?:流量总剩余|剩余总流量|总剩余流量|全部流量剩余|流量剩余总量|总流量余量|剩余流量合计|流量剩余合计)$/;
  const amountPattern = /^(?:0+(?:\.0+)?|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:TB|GB|MB|KB|B|T|G|M|K))$/i;
  const exhaustedPattern = /(?:^|[\s%])((?:流量)?已(?:用完|用尽|耗尽)|无剩余流量)$/;

  for (const element of document.querySelectorAll('dt, label, p, div, span, strong, th')) {
    if (element.children.length > 3 || !visible(element)) continue;
    const label = text(element);
    if (label.length > 46) continue;
    const [caption, ...value] = label.split(':');
    if (!balanceLabels.test(caption.trim())) continue;
    const amount = value.join(':').trim() || (visible(element.nextElementSibling) ? text(element.nextElementSibling) : '');
    if (amountPattern.test(amount) || exhaustedPattern.exec(amount)?.[1] === amount) totals.add(amount);
  }

  const body = document.body?.innerText ?? '';
  const reportedTime = body.match(/查询时间\s*[:：]\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{2}:\d{2}:\d{2})/);
  const parsedTime = reportedTime
    ? Date.parse(`${reportedTime[1]}-${reportedTime[2].padStart(2, '0')}-${reportedTime[3].padStart(2, '0')}T${reportedTime[4]}+08:00`)
    : NaN;
  const queriedAt = Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : null;
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
    .filter(visible).map(text);
  const completeAllowanceSection = headings.includes('套餐余量查询') && headings.includes('套餐外计费信息');
  const hasAllowanceCards = completeAllowanceSection || (queriedAt && /套餐余量查询/.test(body));
  const cards = [];
  const tables = [];
  for (const table of document.querySelectorAll('table, [role="table"], [role="grid"]')) {
    if (!visible(table)) continue;
    const rows = Array.from(table.querySelectorAll('tr, [role="row"]'))
      .filter(row => visible(row) && row.closest('table, [role="table"], [role="grid"]') === table);
    // The personal center renders each allowance as a separate three-row table.
    if (hasAllowanceCards && rows.length === 3
      && rows.every(row => row.cells?.length === 1)) {
      const title = text(rows[0]);
      const name = text(rows[1]).split(/共\s*(?=\d)/)[0].trim();
      const resource = text(rows[2]);
      const remaining = resource.match(exhaustedPattern)?.[1]
        ?? resource.match(/剩余(?:流量|量)?\s*:?\s*(.+)$/)?.[1];
      if (name.length <= 100 && /流量|上网/.test(name) && !/(?:通话时长|语音|短信|彩信)$/.test(name)) {
        cards.push({ name: `${title} ${name}`, remaining: remaining?.slice(0, 64) ?? '', unit: '' });
        continue;
      }
    }
    let nameIndex = -1;
    let balanceIndex = -1;
    let unit = '';
    const packages = [];
    for (const row of rows) {
      const columns = Array.from(row.children)
        .filter(cell => cell.matches('th, td, [role="cell"], [role="columnheader"], [role="rowheader"], [role="gridcell"]') && visible(cell))
        .map(text);
      if (balanceIndex < 0) {
        nameIndex = columns.findIndex(label => /^(?:名称|资源|套餐|类型|项目|流量包|(?:套餐|产品|业务|资源|流量包|包|项目)名称|(?:流量|资源)类型)$/.test(label));
        balanceIndex = columns.findIndex(label => /^(?:(?:本月|当前)?(?:剩余|可用)(?:资源)?(?:流量|用量|量)?|余量)(?:\s*\((?:[TKMG]B?|B)\))?$/i.test(label));
        if (balanceIndex >= 0 && columns.length > 1 && nameIndex < 0
          && /^(?:剩余流量|流量余量|余量)/.test(columns[balanceIndex])) nameIndex = balanceIndex === 0 ? 1 : 0;
        if (nameIndex < 0 || balanceIndex < 0 || nameIndex === balanceIndex) {
          balanceIndex = -1;
          continue;
        }
        unit = columns[balanceIndex].match(/\(([TKMG]B?|B)\)/i)?.[1] ?? '';
        continue;
      }
      const name = columns[nameIndex] ?? '';
      if (name.length > 100 || !/流量|上网|通用|定向|闲时|漫游/.test(name)) continue;
      packages.push({ name, remaining: (columns[balanceIndex] ?? '').slice(0, 64), unit });
    }
    if (packages.length) tables.push(packages);
  }
  if (cards.length) tables.push(cards);
  return { tables, totals: [...totals], queriedAt };
}

function openVisibleAllowanceLink(document) {
  const labels = new Set(['套餐余量查询', '流量余量查询', '套餐余量', '余量查询']);
  const link = Array.from(document.querySelectorAll('a, button, [role="button"], [role="tab"]'))
    .find(element => element.getClientRects().length && labels.has(element.innerText?.replace(/\s/g, '')));
  if (!link) return false;
  link.click();
  return true;
}

function hasSignInChallenge(document) {
  const text = document.body?.innerText ?? '';
  return /扫码登录|短信验证码|(?:请输入|请完成)验证码/.test(text);
}

module.exports = { readVisibleAllowance, openVisibleAllowanceLink, hasSignInChallenge };
