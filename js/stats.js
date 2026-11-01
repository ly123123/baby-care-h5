/**
 * 宝宝成长记 · 统计聚合与统计页
 *
 * 公开 API：
 *   computeReport(period, anchorKey)  period: 'week' | 'month' | 'quarter'
 *   mountStatsPage(root)              root = #page-stats，负责内部重渲染与事件委托
 *   reportTitle(period, startKey)     「11月第2周」/「2026年11月」/「2026年第4季度」
 *
 * 说明：
 * - 所有数字均从 store 实时读取；不缓存数据，只缓存视图状态（period / anchor）。
 * - 平均值的分母是「本周期从首次记录到今天的天数」（effectiveDays），补剂/护理完成率同理；
 *   这样既不会把「还没开始记录的日子」算成 0，也会保留中间漏记的日子。
 * - 季度按 7 天一段聚合（每段最多 13 段），值为该段的日均奶量，跨季度也不会超过 13 个点。
 */

import {
  SUPPLEMENTS,
  CARES,
  EARLY_EDU,
  todayKey,
  isDateKey,
  addDays,
  rangeKeys,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  formatDateCN,
  weekdayCN,
  monthTitle,
  parseDateKey,
  formatMinutes,
  summarizeDay,
  getDay,
  subscribe,
} from './store.js';
import { barChart, groupedBarChart, lineChart } from './charts.js';
import { icon } from './ui.js';

const PERIODS = ['week', 'month', 'quarter'];
const PERIOD_LABEL = { week: '周', month: '月', quarter: '季' };
const AVERAGE_FIELDS = ['milkMl', 'feedCount', 'poopCount', 'diaperCount', 'sleepMin'];
const MAX_QUARTER_POINTS = 13;

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}

function fmtInt(value) {
  const n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function ratePct(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return 0;
  return Math.max(0, Math.min(100, Math.round(r * 100)));
}

function sum(list, pick) {
  return (list || []).reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);
}

function rangeText(startKey, endKey, today = todayKey()) {
  const startYear = startKey.slice(0, 4);
  const endYear = endKey.slice(0, 4);
  const currentYear = today.slice(0, 4);
  const withYear = startYear !== endYear || startYear !== currentYear;
  if (startKey === endKey) return formatDateCN(startKey, withYear);
  return formatDateCN(startKey, withYear) + ' - ' + formatDateCN(endKey, withYear);
}

/** 周期边界（周一为一周开始，季度按自然季度） */
function periodBounds(period, anchorKey) {
  const anchor = isDateKey(anchorKey) ? anchorKey : todayKey();
  if (period === 'month') {
    return { anchor, startKey: startOfMonth(anchor), endKey: endOfMonth(anchor) };
  }
  if (period === 'quarter') {
    return { anchor, startKey: startOfQuarter(anchor), endKey: endOfQuarter(anchor) };
  }
  return { anchor, startKey: startOfWeek(anchor), endKey: endOfWeek(anchor) };
}

/** 周期标题：11月第2周 / 2026年11月 / 2026年第4季度 */
export function reportTitle(period, startKey) {
  const key = isDateKey(startKey) ? startKey : todayKey();
  const date = parseDateKey(key);
  if (period === 'month') return monthTitle(key);
  if (period === 'quarter') {
    return date.getFullYear() + '年第' + (Math.floor(date.getMonth() / 3) + 1) + '季度';
  }
  const weekOfMonth = Math.floor((date.getDate() - 1) / 7) + 1;
  return date.getMonth() + 1 + '月第' + weekOfMonth + '周';
}

/** 季度按 7 天一段分桶，超过 13 段时把末尾段并入前一段 */
function weekChunks(dates) {
  const chunks = [];
  for (let i = 0; i < dates.length; i += 7) chunks.push(dates.slice(i, i + 7));
  while (chunks.length > MAX_QUARTER_POINTS) {
    const last = chunks.pop();
    chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(last);
  }
  return chunks;
}

function shortDayLabel(period, key) {
  if (period === 'week') return weekdayCN(key);
  return String(parseDateKey(key).getDate());
}

function emptyTotals() {
  return {
    milkMl: 0,
    formulaMl: 0,
    bottleMl: 0,
    breastMin: 0,
    feedCount: 0,
    poopCount: 0,
    diaperCount: 0,
    sleepMin: 0,
    supplementDone: 0,
    careDone: 0,
    earlyDone: 0,
    earlyMin: 0,
  };
}

function emptyAverages() {
  return { milkMl: 0, feedCount: 0, poopCount: 0, diaperCount: 0, sleepMin: 0 };
}

/** 取某段天数（用于上一周期同期）的日均值 */
function averageOver(days, count) {
  const list = (days || []).slice(0, Math.max(0, Math.min(count, (days || []).length)));
  const averages = emptyAverages();
  if (!list.length) return averages;
  const sums = emptyTotals();
  list.forEach((day) => {
    const s = day.summary;
    sums.milkMl += s.milkMl;
    sums.formulaMl += s.formulaMl;
    sums.bottleMl += s.bottleMl;
    sums.breastMin += s.breastMin;
    sums.feedCount += s.feedCount;
    sums.poopCount += s.poopCount;
    sums.diaperCount += s.diaperCount;
    sums.sleepMin += s.sleepMin;
  });
  AVERAGE_FIELDS.forEach((field) => {
    averages[field] = sums[field] / list.length;
  });
  return averages;
}

/* ------------------------------------------------------------------ */
/* 聚合                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 计算某周期统计报告
 * @param {'week'|'month'|'quarter'} period
 * @param {string} anchorKey 周期内任意一天（YYYY-MM-DD）
 * @returns {object} 见 docs/SPEC.md 第 6 节
 */
export function computeReport(period, anchorKey) {
  const safePeriod = PERIODS.includes(period) ? period : 'week';
  return buildReport(safePeriod, isDateKey(anchorKey) ? anchorKey : todayKey(), true);
}

function buildReport(period, anchorKey, withPrev) {
  const today = todayKey();
  const bounds = periodBounds(period, anchorKey);
  const startKey = bounds.startKey;
  const endKey = bounds.endKey;
  const dates = rangeKeys(startKey, endKey);
  const isCurrent = startKey <= today && today <= endKey;

  // 只统计「已经过去的日子」，未来日期不进入分母，也不在图上留空柱
  const activeKeys = dates.filter((key) => key <= today);
  const elapsedDays = activeKeys.length;
  const totalDays = dates.length;

  const days = dates.map((key) => ({ key, summary: summarizeDay(key) }));
  const activeDays = days.filter((day) => day.key <= today);
  const recordedDays = activeDays.filter((day) => day.summary.hasData).length;

  const totals = emptyTotals();
  activeDays.forEach((day) => {
    const s = day.summary;
    totals.milkMl += s.milkMl;
    totals.formulaMl += s.formulaMl;
    totals.bottleMl += s.bottleMl;
    totals.breastMin += s.breastMin;
    totals.feedCount += s.feedCount;
    totals.poopCount += s.poopCount;
    totals.diaperCount += s.diaperCount;
    totals.sleepMin += s.sleepMin;
    totals.supplementDone += s.supplementDone;
    totals.careDone += s.careDone;
    totals.earlyDone += s.earlyDone;
    totals.earlyMin += s.earlyMin;
  });

  // 「开始记录之前」的日子不计入日均与完成率分母：
  // 从本周期第一笔记录算起，中间漏记的日子仍然计入（更贴近家长对「这几天」的直觉）。
  let firstRecordedIndex = -1;
  for (let i = 0; i < activeDays.length; i += 1) {
    if (activeDays[i].summary.hasData) {
      firstRecordedIndex = i;
      break;
    }
  }
  const effectiveStartKey = firstRecordedIndex >= 0 ? activeKeys[firstRecordedIndex] : startKey;
  const effectiveDays = firstRecordedIndex >= 0 ? activeKeys.length - firstRecordedIndex : elapsedDays;

  const averages = emptyAverages();
  if (effectiveDays > 0) {
    AVERAGE_FIELDS.forEach((field) => {
      averages[field] = totals[field] / effectiveDays;
    });
  }

  /* 每日明细 */
  const daily = activeKeys.map((key) => {
    const summary = summarizeDay(key);
    return {
      key,
      summary,
      label: shortDayLabel(period, key),
      sub: formatDateCN(key) + ' ' + weekdayCN(key),
    };
  });

  // 图表序列同样从「本周期第一笔记录」开始，避免把「还没开始记」误读成「宝宝没吃没睡」
  const seriesDays = firstRecordedIndex >= 0 ? daily.slice(firstRecordedIndex) : daily;

  /* 序列：周/月按天，季度按 7 天一段的日均 */
  let series;
  let buckets;
  if (period === 'quarter') {
    buckets = 'week';
    const points = weekChunks(seriesDays).map((chunk) => {
      const chunkStart = chunk[0].key;
      const chunkEnd = chunk[chunk.length - 1].key;
      const divisor = chunk.length || 1;
      const sums = { milkMl: 0, diaperCount: 0, poopCount: 0, sleepMin: 0 };
      chunk.forEach((item) => {
        const s = item.summary;
        sums.milkMl += s.milkMl;
        sums.diaperCount += s.diaperCount;
        sums.poopCount += s.poopCount;
        sums.sleepMin += s.sleepMin;
      });
      const startDate = parseDateKey(chunkStart);
      return {
        label: startDate.getMonth() + 1 + '/' + startDate.getDate(),
        sub: formatDateCN(chunkStart) + ' - ' + formatDateCN(chunkEnd),
        milk: round1(sums.milkMl / divisor),
        diapers: round1(sums.diaperCount / divisor),
        poop: round1(sums.poopCount / divisor),
        sleep: round1(sums.sleepMin / divisor),
      };
    });
    series = {
      milk: points.map((p) => ({ label: p.label, value: p.milk, sub: p.sub })),
      diapers: points.map((p) => ({ label: p.label, value: p.diapers, sub: p.sub })),
      poop: points.map((p) => ({ label: p.label, value: p.poop, sub: p.sub })),
      sleep: points.map((p) => ({ label: p.label, value: p.sleep, sub: p.sub })),
    };
  } else {
    buckets = 'day';
    series = {
      milk: seriesDays.map((d) => ({ label: d.label, value: d.summary.milkMl, sub: d.sub })),
      diapers: seriesDays.map((d) => ({ label: d.label, value: d.summary.diaperCount, sub: d.sub })),
      poop: seriesDays.map((d) => ({ label: d.label, value: d.summary.poopCount, sub: d.sub })),
      sleep: seriesDays.map((d) => ({ label: d.label, value: d.summary.sleepMin, sub: d.sub })),
    };
  }

  const seriesStartKey = seriesDays.length ? seriesDays[0].key : startKey;
  const seriesEndKey = seriesDays.length ? seriesDays[seriesDays.length - 1].key : startKey;
  const seriesTrimmed = Boolean(firstRecordedIndex > 0);

  /* 补剂 / 护理 / 早教（分母为已过去的天数） */
  const supplements = SUPPLEMENTS.map((def) => {
    let doneDays = 0;
    activeKeys.forEach((key) => {
      const day = getDay(key);
      if (day.supplements && day.supplements[def.key] && day.supplements[def.key].done) doneDays += 1;
    });
    return {
      key: def.key,
      label: def.label,
      hint: def.hint || '',
      doneDays,
      rate: effectiveDays > 0 ? doneDays / effectiveDays : 0,
    };
  });

  const cares = CARES.map((def) => {
    let doneDays = 0;
    activeKeys.forEach((key) => {
      const day = getDay(key);
      if (day.cares && day.cares[def.key] && day.cares[def.key].done) doneDays += 1;
    });
    return {
      key: def.key,
      label: def.label,
      hint: def.hint || '',
      doneDays,
      rate: effectiveDays > 0 ? doneDays / effectiveDays : 0,
    };
  });

  const early = EARLY_EDU.map((def) => {
    let doneDays = 0;
    let minutes = 0;
    activeKeys.forEach((key) => {
      const day = getDay(key);
      const item = day.early && day.early[def.key];
      if (item && item.done) {
        doneDays += 1;
        minutes += Number(item.minutes) || 0;
      }
    });
    return {
      key: def.key,
      label: def.label,
      hint: def.hint || '',
      doneDays,
      minutes,
    };
  });

  const title = reportTitle(period, startKey);
  const report = {
    period,
    anchor: bounds.anchor,
    startKey,
    endKey,
    dates,
    days,
    title,
    // 当前周期只展示到今天，避免让家人误以为是整段区间
    rangeText: rangeText(startKey, isCurrent ? today : endKey, today),
    isCurrent,
    elapsedDays,
    effectiveStartKey,
    effectiveDays,
    recordedDays,
    totalDays,
    totals,
    averages,
    series,
    buckets,
    seriesStartKey,
    seriesEndKey,
    seriesTrimmed,
    supplements,
    cares,
    early,
    prevTotals: null,
    deltas: {},
    insights: [],
  };

  /* 上一周期对比（按日均比较，部分周期与整周期才公平） */
  if (withPrev) {
    const prevAnchor = addDays(startKey, -1);
    const prev = buildReport(period, prevAnchor, false);
    report.prevTotals = prev.totals;
    // 可比天数取 min(本周期有效记录天数, 上一周期总天数)，
    // 避免「只记了 13 天」直接去比「上一整月 31 天」
    const comparableDays = Math.min(effectiveDays, prev.totalDays);
    const prevAverages =
      comparableDays > 0 && comparableDays < prev.totalDays
        ? averageOver(prev.days, comparableDays)
        : prev.averages;
    report.prevCompareDays = comparableDays;
    AVERAGE_FIELDS.forEach((field) => {
      const prevAvg = prevAverages[field];
      report.deltas[field] = prevAvg > 0 ? (averages[field] - prevAvg) / prevAvg : null;
    });
    report._prevAverages = prevAverages; // 供 insights 使用，不对外承诺
  }

  report.insights = buildInsights(report, activeKeys);
  return report;
}

/* ------------------------------------------------------------------ */
/* 洞察文案                                                             */
/* ------------------------------------------------------------------ */

function feedKindCounts(keys) {
  const info = { breastFeeds: 0, bottleFeeds: 0, formulaFeeds: 0 };
  keys.forEach((key) => {
    const day = getDay(key);
    (day.feeds || []).forEach((feed) => {
      if (feed.kind === 'breast') info.breastFeeds += 1;
      else if (feed.kind === 'bottle') info.bottleFeeds += 1;
      else info.formulaFeeds += 1;
    });
  });
  return info;
}

function buildInsights(report, activeKeys) {
  if (report.recordedDays === 0) {
    return [
      '这一周期还没有记录。',
      '从今天的奶量、尿布或睡眠开始，都会慢慢长成宝宝的小档案。',
    ];
  }

  const out = [];
  const totals = report.totals;
  const averages = report.averages;
  const deltas = report.deltas || {};
  const feeds = feedKindCounts(activeKeys);
  const comparePrefix = report.isCurrent ? '较上一周期同期' : '较上一周期';
  const periodPrefix = report.isCurrent ? '本周期至今' : '这一周期';

  // 1. 奶量趋势 / 日均
  const milkDelta = deltas.milkMl;
  if (milkDelta != null && Number.isFinite(milkDelta)) {
    const changePct = Math.round(Math.abs(milkDelta) * 100);
    if (changePct < 3) {
      out.push(periodPrefix + '日均奶量与上一周期基本持平，约 ' + fmtInt(averages.milkMl) + ' ml。');
    } else {
      out.push(comparePrefix + '，日均奶量' + (milkDelta > 0 ? '增加' : '减少') + ' ' + changePct + '%。');
    }
  } else if (totals.milkMl > 0) {
    out.push(periodPrefix + '日均奶量 ' + fmtInt(averages.milkMl) + ' ml，共记录 ' + report.recordedDays + ' 天。');
  }

  // 2. 睡眠
  if (totals.sleepMin > 0) {
    const sleepDelta = deltas.sleepMin;
    let text = '日均睡眠 ' + formatMinutes(averages.sleepMin) + '，共 ' + formatMinutes(totals.sleepMin) + '。';
    if (sleepDelta != null && Number.isFinite(sleepDelta) && Math.abs(sleepDelta) >= 0.05) {
      text += comparePrefix + (sleepDelta > 0 ? '增加' : '减少') + ' ' + Math.round(Math.abs(sleepDelta) * 100) + '%。';
    }
    out.push(text);
  }

  // 3. 喂养构成 / 尿布
  if (totals.feedCount > 0) {
    out.push(
      '共喂养 ' + totals.feedCount + ' 次，其中母乳亲喂 ' + feeds.breastFeeds + ' 次、配方奶 ' + feeds.formulaFeeds + ' 次。'
    );
  } else if (totals.diaperCount > 0) {
    out.push(
      '这一周期记录尿布 ' + totals.diaperCount + ' 张，其中大便 ' + totals.poopCount + ' 次，日均 ' + round1(averages.diaperCount) + ' 张。'
    );
  }

  // 4. 补剂与护理
  if (report.effectiveDays > 0 && (totals.supplementDone > 0 || totals.careDone > 0)) {
    const suppRate = ratePct(sum(report.supplements, (i) => i.doneDays) / (report.effectiveDays * report.supplements.length));
    const careRate = ratePct(sum(report.cares, (i) => i.doneDays) / (report.effectiveDays * report.cares.length));
    out.push('补剂完成率 ' + suppRate + '%，护理完成率 ' + careRate + '%，一点一滴都算数。');
  }

  // 5. 早教
  const earlyDays = sum(report.early, (i) => i.doneDays);
  const earlyMin = sum(report.early, (i) => i.minutes);
  if (earlyDays > 0) {
    out.push('早教陪伴 ' + earlyDays + ' 次，累计 ' + earlyMin + ' 分钟。');
  }

  // 6. 奶量最高的一天（周/月）
  if (report.period !== 'quarter' && report.recordedDays > 1) {
    let best = null;
    report.days.forEach((day) => {
      if (day.key > todayKey()) return;
      if (!best || day.summary.milkMl > best.summary.milkMl) best = day;
    });
    if (best && best.summary.milkMl > 0) {
      out.push('奶量最多的一天是 ' + formatDateCN(best.key) + '（' + fmtInt(best.summary.milkMl) + ' ml）。');
    }
  }

  // 保底：至少 2 条
  if (out.length < 2) {
    const recordCount = sum(report.days.filter((d) => d.key <= todayKey()), (d) => d.summary.recordCount);
    out.push('这一周期留下了 ' + recordCount + ' 条记录，谢谢你把宝宝的日常记下来。');
  }
  if (out.length < 2) {
    out.push('记录不必完美，能记下的每一天都珍贵。');
  }

  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* 统计页渲染                                                           */
/* ------------------------------------------------------------------ */

const view = { period: 'week', anchor: todayKey() };
let currentRoot = null;
let currentClickHandler = null;
let currentUnsubscribe = null;

/**
 * 把统计页挂载到 root（#page-stats），重建 DOM 并绑定事件委托
 * @param {HTMLElement} root
 */
export function mountStatsPage(root, options = {}) {
  if (!root) return;
  const preserveView = Boolean(options && options.preserveView);

  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  if (currentRoot && currentClickHandler) {
    currentRoot.removeEventListener('click', currentClickHandler);
  }

  if (!PERIODS.includes(view.period)) view.period = 'week';
  // 从底部导航进入统计页时回到「今天」所在周期；实时同步等重绘时保留当前查看的周期
  if (!preserveView) view.anchor = todayKey();

  currentRoot = root;
  currentClickHandler = (event) => handleClick(event, root);
  root.addEventListener('click', currentClickHandler);

  try {
    currentUnsubscribe = subscribe((type) => {
      if (type === 'day' || type === 'import' || type === 'reset' || type === 'reload' || type === 'profile') {
        render(root);
      }
    });
  } catch (err) {
    currentUnsubscribe = null;
  }

  render(root);
}

function handleClick(event, root) {
  const target = event.target instanceof Element ? event.target.closest('[data-action], [data-period]') : null;
  if (!target || !root.contains(target)) return;

  const action = target.getAttribute('data-action');
  if (action === 'share') {
    openShare();
    return;
  }
  if (action === 'prev') {
    shiftPeriod(-1);
    return;
  }
  if (action === 'next') {
    shiftPeriod(1);
    return;
  }
  if (action === 'today') {
    view.anchor = todayKey();
    render(root);
    return;
  }
  if (action === 'go-today') {
    document.dispatchEvent(new CustomEvent('baby:go-today'));
    return;
  }

  const period = target.getAttribute('data-period');
  if (period && PERIODS.includes(period)) {
    if (period === view.period) {
      // 再次点击当前周期 = 回到今天
      view.anchor = todayKey();
    } else {
      // 正在看当前周期时切换周期类型，直接落到「今天」所在的新周期；
      // 正在回看历史周期时保留锚点（例如回看 9 月，切到季仍然看 Q3）
      const current = computeReport(view.period, view.anchor);
      if (current.isCurrent) view.anchor = todayKey();
      view.period = period;
    }
    render(root);
  }
}

function shiftPeriod(direction) {
  if (!currentRoot) return;
  const report = computeReport(view.period, view.anchor);
  const targetKey = direction < 0 ? addDays(report.startKey, -1) : addDays(report.endKey, 1);
  if (targetKey > todayKey()) return; // 不能翻到未来
  view.anchor = targetKey;
  render(currentRoot);
}

function openShare() {
  if (!currentRoot) return;
  const report = computeReport(view.period, view.anchor);
  document.dispatchEvent(
    new CustomEvent('baby:share-brief', { detail: { period: report.period, anchor: report.startKey } })
  );
}

function render(root) {
  if (!root) return;
  if (!view.anchor) view.anchor = todayKey();
  const report = computeReport(view.period, view.anchor);
  root.innerHTML = pageHtml(report);
  paintCharts(root, report);
}

function paintCharts(root, report) {
  if (report.recordedDays === 0) return;
  const labels = report.series.milk.map((point) => point.label);

  const milkNode = root.querySelector('[data-chart="milk"]');
  if (milkNode) {
    barChart(milkNode, {
      labels,
      values: report.series.milk.map((point) => point.value),
      average: report.averages.milkMl,
      color: 'var(--coral)',
      unit: 'ml',
      height: 200,
      emptyText: '这一周期还没有奶量记录',
    });
  }

  const diaperNode = root.querySelector('[data-chart="diaper"]');
  if (diaperNode) {
    groupedBarChart(diaperNode, {
      labels,
      series: [
        { name: '尿布', values: report.series.diapers.map((point) => point.value), color: 'var(--sky)' },
        { name: '大便', values: report.series.poop.map((point) => point.value), color: 'var(--amber)' },
      ],
      height: 220,
      emptyText: '这一周期还没有尿布记录',
    });
  }

  const sleepNode = root.querySelector('[data-chart="sleep"]');
  if (sleepNode) {
    lineChart(sleepNode, {
      labels,
      values: report.series.sleep.map((point) => point.value / 60),
      color: 'var(--lilac)',
      height: 200,
      valueFormat: (value) => Math.round(Number(value) * 10) / 10 + 'h',
      emptyText: '这一周期还没有睡眠记录',
    });
  }
}

/* ---------------------------- HTML 片段 ---------------------------- */

function headHtml(report) {
  const canShare = report.recordedDays > 0;
  return (
    '<header class="page-head">' +
    '<div class="page-head-top">' +
    '<div>' +
    '<p class="eyebrow">成长数据</p>' +
    '<h1 class="page-title">统计</h1>' +
    '<p class="page-sub">把这一段的喂养、睡眠与陪伴，慢慢看一遍</p>' +
    '</div>' +
    '<button type="button" class="icon-btn st-share-btn" data-action="share" aria-label="' +
    (canShare ? '生成成长简报' : '还没有记录，暂时无法生成简报') + '"' +
    (canShare ? '' : ' disabled') + '>' +
    icon('share', 20) +
    '</button>' +
    '</div></header>'
  );
}

function segHtml() {
  return (
    '<div class="segmented st-seg" role="tablist" aria-label="统计周期">' +
    PERIODS.map((period) => {
      const active = period === view.period;
      return (
        '<button type="button" class="seg-btn' + (active ? ' is-active' : '') + '" role="tab" data-period="' + period +
        '" aria-selected="' + (active ? 'true' : 'false') + '">' + PERIOD_LABEL[period] + '</button>'
      );
    }).join('') +
    '</div>'
  );
}

function periodBarHtml(report) {
  return (
    '<div class="st-periodbar">' +
    '<button type="button" class="st-nav" data-action="prev" aria-label="上一周期">' + icon('chevron-left', 20) + '</button>' +
    '<div class="st-period-main">' +
    '<div class="st-period-line">' +
    '<span class="st-period-title">' + esc(report.title) + '</span>' +
    (report.isCurrent ? '<span class="st-period-now">进行中</span>' : '<button type="button" class="st-today" data-action="today">回到今天</button>') +
    '</div>' +
    '<p class="st-period-range" aria-live="polite">' + esc(report.rangeText) + '</p>' +
    '</div>' +
    '<button type="button" class="st-nav" data-action="next" aria-label="下一周期"' + (report.isCurrent ? ' disabled' : '') + '>' +
    icon('chevron-right', 20) + '</button>' +
    '</div>'
  );
}

function deltaText(field, report) {
  const delta = report.deltas ? report.deltas[field] : null;
  if (delta == null || !Number.isFinite(delta)) return '';
  const changePct = Math.round(delta * 100);
  const prefix = report.isCurrent ? '较上一周期同期' : '较上一周期';
  if (changePct === 0) return prefix.replace('较', '与') + '持平';
  return prefix + ' ' + (changePct > 0 ? '+' : '') + changePct + '%';
}

function kpiSubHtml(lines) {
  const list = Array.isArray(lines) ? lines : [lines];
  return list
    .filter((line) => line != null && line !== '')
    .map((line) => '<span class="st-sub-line">' + esc(line) + '</span>')
    .join('');
}

function kpiHtml(tintClass, iconName, label, value, unit, subLines) {
  return (
    '<article class="kpi st-kpi ' + tintClass + '">' +
    '<div class="kpi-top"><span class="kpi-ico">' + icon(iconName, 17) + '</span>' +
    '<span class="kpi-label">' + esc(label) + '</span></div>' +
    '<p class="kpi-value"><span class="num">' + esc(value) + '</span>' +
    (unit ? '<span class="kpi-unit">' + esc(unit) + '</span>' : '') + '</p>' +
    '<p class="kpi-sub">' + kpiSubHtml(subLines) + '</p>' +
    '</article>'
  );
}

function kpiGridHtml(report) {
  const totals = report.totals;
  const averages = report.averages;
  const milkSubLines = ['日均 ' + fmtInt(averages.milkMl) + ' ml'];
  if (totals.breastMin > 0) milkSubLines.push('母乳 ' + formatMinutes(totals.breastMin));
  else milkSubLines.push('共 ' + report.recordedDays + ' 天记录');

  const avgSub = deltaText('milkMl', report) || '共记录 ' + report.recordedDays + ' 天';
  const sleepAvg = report.effectiveDays > 0 ? (averages.sleepMin / 60).toFixed(1) : '0.0';

  return (
    '<section class="kpi-grid st-kpis" aria-label="核心指标">' +
    kpiHtml('tint-coral', 'bottle', '总奶量', fmtInt(totals.milkMl), 'ml', milkSubLines) +
    kpiHtml('tint-sage', 'droplet', '日均奶量', fmtInt(averages.milkMl), 'ml', avgSub) +
    kpiHtml('tint-amber', 'diaper', '大便次数', String(totals.poopCount), '次', '尿布 ' + totals.diaperCount + ' 张') +
    kpiHtml('tint-lilac', 'moon', '日均睡眠', sleepAvg, '小时', '共 ' + formatMinutes(totals.sleepMin)) +
    '</section>'
  );
}

function feedingCardHtml(report) {
  const totals = report.totals;
  const keys = report.dates.filter((key) => key <= todayKey());
  const info = feedKindCounts(keys);
  const rows = [
    { label: '母乳亲喂', main: info.breastFeeds + ' 次', side: formatMinutes(totals.breastMin) },
    { label: '瓶喂母乳', main: fmtInt(totals.bottleMl) + ' ml', side: '' },
    { label: '配方奶', main: fmtInt(totals.formulaMl) + ' ml', side: '' },
    { label: '总喂养次数', main: totals.feedCount + ' 次', side: '日均 ' + round1(report.averages.feedCount) + ' 次' },
  ];
  return (
    '<section class="card st-card">' +
    '<div class="card-head"><h2 class="card-title">喂养概览</h2>' +
    '<span class="card-sub">母乳 ' + formatMinutes(totals.breastMin) + '</span></div>' +
    '<div class="st-list">' +
    rows
      .map(
        (row) =>
          '<div class="list-row st-row">' +
          '<div class="list-row-main"><span class="list-row-title">' + esc(row.label) + '</span></div>' +
          '<div class="list-row-side"><span class="num">' + esc(row.main) + '</span>' +
          (row.side ? '<span class="st-row-side-sub">' + esc(row.side) + '</span>' : '') +
          '</div></div>'
      )
      .join('') +
    '</div></section>'
  );
}

function chartCardsHtml(report) {
  const isWeek = report.buckets === 'week';
  const trimNote = report.seriesTrimmed ? '自 ' + formatDateCN(report.seriesStartKey) + ' 首次记录起 · ' : '';
  const milkTitle = isWeek ? '每周日均奶量' : '每日奶量';
  const milkSub = isWeek
    ? trimNote + '每根柱子为一周的日均，虚线为整期日均 ' + fmtInt(report.averages.milkMl) + ' ml'
    : trimNote + '虚线为这一周期的日均 ' + fmtInt(report.averages.milkMl) + ' ml';
  const diaperTitle = isWeek ? '尿布与大便（周均）' : '尿布与大便';
  const diaperSub = trimNote + (isWeek ? '按周平均到每天' : '每日尿布张数与大便次数');
  const sleepTitle = isWeek ? '睡眠时长（周均）' : '睡眠时长';
  const sleepSub = trimNote + '总睡眠 ' + formatMinutes(report.totals.sleepMin) + '，日均 ' + formatMinutes(report.averages.sleepMin);

  return (
    '<section class="card st-card">' +
    '<div class="card-head"><div><h2 class="card-title">' + milkTitle + '</h2>' +
    '<p class="card-sub">' + esc(milkSub) + '</p></div></div>' +
    '<div class="chart st-chart" data-chart="milk"></div></section>' +
    '<section class="card st-card">' +
    '<div class="card-head"><div><h2 class="card-title">' + diaperTitle + '</h2>' +
    '<p class="card-sub">' + esc(diaperSub) + '</p></div></div>' +
    '<div class="chart st-chart" data-chart="diaper"></div></section>' +
    '<section class="card st-card">' +
    '<div class="card-head"><div><h2 class="card-title">' + sleepTitle + '</h2>' +
    '<p class="card-sub">' + esc(sleepSub) + '</p></div></div>' +
    '<div class="chart st-chart" data-chart="sleep"></div></section>'
  );
}

function progressRowHtml(item, effectiveDays, className) {
  const pct = effectiveDays > 0 ? ratePct(item.doneDays / effectiveDays) : 0;
  const meta = effectiveDays > 0 ? item.doneDays + '/' + effectiveDays + ' 天' : '—';
  return (
    '<div class="st-prog">' +
    '<div class="st-prog-head"><span class="st-prog-label">' + esc(item.label) + '</span>' +
    '<span class="st-prog-meta">' + esc(meta) + '</span></div>' +
    '<div class="progress st-progress"><div class="progress-track st-track">' +
    '<div class="progress-fill st-fill ' + className + '" style="width:' + pct + '%"></div>' +
    '</div></div></div>'
  );
}

function completionCardHtml(report) {
  const effective = report.effectiveDays;
  const suppPct = effective > 0 ? ratePct(sum(report.supplements, (i) => i.doneDays) / (effective * report.supplements.length)) : 0;
  const carePct = effective > 0 ? ratePct(sum(report.cares, (i) => i.doneDays) / (effective * report.cares.length)) : 0;
  const startNote = report.seriesTrimmed ? '自 ' + formatDateCN(report.effectiveStartKey) + ' 起 · ' : '';

  return (
    '<section class="card st-card">' +
    '<div class="card-head"><div><h2 class="card-title">补剂</h2>' +
    '<p class="card-sub">' + esc(startNote + '每天的小小坚持') + '</p></div>' +
    '<span class="st-card-rate">完成率 <b>' + suppPct + '%</b></span></div>' +
    '<div class="st-progress-list">' +
    report.supplements.map((item) => progressRowHtml(item, effective, 'is-sage')).join('') +
    '</div></section>' +
    '<section class="card st-card">' +
    '<div class="card-head"><div><h2 class="card-title">护理</h2>' +
    '<p class="card-sub">' + esc(startNote + '洗脸、洗澡、保湿……') + '</p></div>' +
    '<span class="st-card-rate">完成率 <b>' + carePct + '%</b></span></div>' +
    '<div class="st-progress-list">' +
    report.cares.map((item) => progressRowHtml(item, effective, 'is-sky')).join('') +
    '</div></section>'
  );
}

function earlyCardHtml(report) {
  const totalDays = sum(report.early, (i) => i.doneDays);
  const totalMin = sum(report.early, (i) => i.minutes);
  return (
    '<section class="card st-card">' +
    '<div class="card-head"><div><h2 class="card-title">早教</h2>' +
    '<p class="card-sub">陪伴也是练习</p></div>' +
    '<span class="card-sub">共 ' + totalDays + ' 次 · ' + totalMin + ' 分钟</span></div>' +
    '<div class="st-early-grid">' +
    report.early
      .map(
        (item) =>
          '<div class="st-early">' +
          '<span class="st-early-label">' + esc(item.label) + '</span>' +
          '<span class="st-early-value num">' + item.doneDays + '<small>次</small></span>' +
          '<span class="st-early-sub">' + item.minutes + ' 分钟</span>' +
          '</div>'
      )
      .join('') +
    '</div></section>'
  );
}

function insightHtml(report) {
  return (
    '<section class="insight-card st-insight">' +
    '<h2 class="st-insight-title">' + esc(report.isCurrent ? '这个小周期' : '那一小段日子') + '</h2>' +
    '<div class="st-insight-list">' +
    report.insights.map((text) => '<p class="insight-line">' + esc(text) + '</p>').join('') +
    '</div>' +
    '<p class="st-disclaimer">数据仅供家庭记录参考，不构成医疗建议。</p>' +
    '</section>'
  );
}

function actionHtml(report) {
  return (
    '<div class="st-actions">' +
    '<button type="button" class="btn btn-primary btn-block st-brief-btn" data-action="share">' +
    icon('share', 18, 'st-btn-icon') + '<span>生成简报图片</span>' +
    '</button>' +
    '<p class="st-actions-hint">生成一张 ' + esc(report.title) + ' 的成长简报，保存或发到家庭群。</p>' +
    '</div>'
  );
}

function emptyStateHtml(report) {
  return (
    '<section class="empty st-empty">' +
    '<div class="empty-icon">' + icon('bottle', 26) + '</div>' +
    '<h3>这一周期还没有记录</h3>' +
    '<p>' +
    (report.isCurrent
      ? '宝宝的第一口奶从几点开始？记录之后，这里会慢慢长出属于你们的小数据。'
      : '这一段日子还没有记录，可以切换周期看看，或者去记录今天的日常。') +
    '</p>' +
    '<div class="empty-actions">' +
    '<button type="button" class="btn btn-primary" data-action="go-today">去记录</button>' +
    '</div>' +
    '</section>'
  );
}

function pageHtml(report) {
  const isEmpty = report.recordedDays === 0;
  return (
    '<div class="st-page">' +
    headHtml(report) +
    '<div class="st-toolbar">' + segHtml() + periodBarHtml(report) + '</div>' +
    (isEmpty
      ? emptyStateHtml(report)
      : kpiGridHtml(report) +
        feedingCardHtml(report) +
        chartCardsHtml(report) +
        completionCardHtml(report) +
        earlyCardHtml(report) +
        insightHtml(report) +
        actionHtml(report)) +
    '</div>'
  );
}
