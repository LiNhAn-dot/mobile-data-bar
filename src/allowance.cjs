const UNITS = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
const LABELS = { general: '通用流量', directed: '定向流量', other: '其他流量' };

function parseAmount(value, unitHint = '') {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (/^(?:(?:流量)?已(?:用完|用尽|耗尽)|无剩余流量)$/.test(text)) return 0;
  const match = /^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(TB|GB|MB|KB|B|T|G|M|K)?$/i.exec(text);
  if (!match) return null;
  const unit = (match[2] || unitHint).trim().toUpperCase();
  if (!/^(?:[TKMG]B?|B)$/.test(unit)) return Number(match[1]) === 0 ? 0 : null;
  const bytes = Math.round(Number(match[1].replaceAll(',', '')) * UNITS[unit[0]]);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function categoryOf(name) {
  if (/定向|专属应用|专属APP|视频流量|咪咕|免流/i.test(name)) return 'directed';
  if (/闲时|夜间|漫游|校园|省内|区域|港澳台|境外/.test(name)) return 'other';
  if (/通用|国内流量|全国流量|^上网$|套餐流量/.test(name)) return 'general';
  return 'other';
}

function summarizeTable(rows) {
  const packages = { general: [], directed: [], other: [] };
  const subtotals = { general: [], directed: [], other: [] };
  const totals = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (!/流量|上网|定向|通用|闲时|漫游/.test(name)) continue;
    const bytes = parseAmount(row.remaining, row.unit);
    if (/^(?:流量合计|流量总计|总剩余流量|全部流量|流量合计剩余|剩余流量合计)$/.test(name)) {
      totals.push(bytes);
      continue;
    }
    const category = categoryOf(name);
    const group = /小计|合计|汇总/.test(name) ? subtotals : packages;
    group[category].push(bytes);
  }

  const categories = [];
  for (const [id, label] of Object.entries(LABELS)) {
    const detailed = packages[id];
    const summary = subtotals[id];
    if (!detailed.length && !summary.length) continue;
    if ([...detailed, ...summary].includes(null)) return null;
    const bytes = detailed.length ? detailed.reduce((sum, value) => sum + value, 0) : summary[0];
    if (summary.some(value => !matchesTotal(bytes, value))) return null;
    categories.push({ id, label, bytes });
  }
  return { categories, totals };
}

function matchesTotal(first, second) {
  // The site may independently round package and total amounts to two decimal places in GB.
  return first !== null && second !== null && Math.abs(first - second) <= UNITS.G * 0.005;
}

function summarizeAllowance({ tables = [], totals = [] }) {
  const distinctTables = [...new Map(tables.map(table => [JSON.stringify(table), table])).values()];
  const parsed = distinctTables.map(summarizeTable);
  if (parsed.includes(null)) return null;
  const reported = [...totals.map(value => parseAmount(value)), ...parsed.flatMap(table => table.totals)];
  if (reported.includes(null)) return null;
  const detailedTables = parsed.filter(table => table.categories.length);

  let categories = [];
  if (detailedTables.length === 1) {
    categories = detailedTables[0].categories;
  } else if (detailedTables.length > 1) {
    categories = detailedTables.flatMap(table => table.categories);
    if (new Set(categories.map(category => category.id)).size !== categories.length) return null;
    categories.sort((a, b) => Object.keys(LABELS).indexOf(a.id) - Object.keys(LABELS).indexOf(b.id));
  }
  if (!categories.length && !reported.length) return null;

  const bytes = categories.length ? categories.reduce((sum, category) => sum + category.bytes, 0) : reported[0];
  if (!Number.isSafeInteger(bytes) || reported.some(value => !matchesTotal(bytes, value))) return null;
  return { bytes, categories, hasDetails: categories.length > 0 };
}

function formatAmount(bytes) {
  for (const unit of ['T', 'G', 'M', 'K']) {
    if (bytes >= UNITS[unit]) {
      return `${Number((bytes / UNITS[unit]).toFixed(2))} ${unit}B`;
    }
  }
  return bytes === 0 ? '0 MB' : `${bytes} B`;
}

module.exports = { formatAmount, summarizeAllowance };
