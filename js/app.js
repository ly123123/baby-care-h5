/** 宝宝成长记 · 应用主逻辑（路由 / 今日 / 记录 / 统计入口 / 我的 / 弹层） */
import * as store from './store.js';
import { icon, esc, openSheet, closeSheet, confirmDialog, toast, haptic } from './ui.js';
import { mountStatsPage } from './stats.js';
import { openBriefSheet } from './share.js';
import { openPaperImport } from './paper-import.js';
import * as sync from './sync.js';

const APP_VERSION = '1.4.0';

const TABS = [
  { key: 'today', label: '今日', icon: 'baby' },
  { key: 'records', label: '记录', icon: 'calendar' },
  { key: 'stats', label: '统计', icon: 'chart' },
  { key: 'settings', label: '我的', icon: 'sliders' },
];

const QUICK_ACTIONS = [
  { key: 'feed', label: '喂奶', icon: 'bottle', tint: 'coral' },
  { key: 'diaper', label: '尿布', icon: 'diaper', tint: 'amber' },
  { key: 'sleep', label: '睡眠', icon: 'moon', tint: 'sky' },
  { key: 'supplement', label: '补剂', icon: 'pill', tint: 'sage' },
  { key: 'care', label: '护理', icon: 'heart', tint: 'lilac' },
  { key: 'early', label: '早教', icon: 'book', tint: 'peach' },
];

const TIMELINE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'feed', label: '喂养' },
  { key: 'diaper', label: '尿布' },
  { key: 'sleep', label: '睡眠' },
];

const state = {
  tab: 'today',
  date: store.todayKey(),
  timelineFilter: 'all',
  calMonth: store.todayKey().slice(0, 7),
};

const els = {};

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtInt(value) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(Number(value) || 0));
}

function fmtHours(minutes) {
  const value = (Number(minutes) || 0) / 60;
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function dateSubtitle(key) {
  return store.formatDateCN(key) + ' ' + store.weekdayCN(key);
}

function feedKindLabel(kind) {
  const found = store.FEED_KINDS.find((item) => item.key === kind);
  return found ? found.label : '喂奶';
}

function sideLabel(side) {
  const found = store.FEED_SIDES.find((item) => item.key === side);
  return found ? found.label : '';
}

function directionLabel(direction) {
  const found = store.SLEEP_DIRECTIONS.find((item) => item.key === direction);
  return found ? found.label : '';
}

function diaperTypeLabel(type) {
  const found = store.DIAPER_TYPES.find((item) => item.key === type);
  return found ? found.label : '尿';
}

function genderLabel(gender) {
  if (gender === 'girl') return '女宝';
  if (gender === 'boy') return '男宝';
  return '';
}

function getAgeText(key) {
  const profile = store.getProfile();
  if (!profile.birthday) return '';
  const days = store.ageDaysOn(key, profile.birthday);
  if (days == null) return '';
  const label = store.ageLabel(profile.birthday, key);
  if (!label) return '出生第 ' + days + ' 天';
  if (label === '出生第 ' + days + ' 天') return label;
  return label + ' · 第 ' + days + ' 天';
}

function chipRow(group, options, activeKey, extraClass = '') {
  return (
    '<div class="chip-row ' + extraClass + '" data-group="' + esc(group) + '">' +
    options
      .map((item) => {
        const key = typeof item === 'string' ? item : item.key;
        const label = typeof item === 'string' ? item : item.label;
        return (
          '<button type="button" class="chip' + (key === activeKey ? ' is-on' : '') + '" data-value="' + esc(key) + '" aria-pressed="' + (key === activeKey ? 'true' : 'false') + '">' +
          esc(label) +
          '</button>'
        );
      })
      .join('') +
    '</div>'
  );
}

function bindChipRow(root, selector) {
  const group = $(selector, root);
  if (!group) return;
  group.addEventListener('click', (event) => {
    const button = event.target.closest('[data-value]');
    if (!button) return;
    $$('[data-value]', group).forEach((item) => {
      item.classList.remove('is-on');
      item.setAttribute('aria-pressed', 'false');
    });
    button.classList.add('is-on');
    button.setAttribute('aria-pressed', 'true');
  });
}

function selectedChip(root, selector) {
  const selected = $('.' + selector + ' .chip.is-on', root) || $('.' + selector + ' [data-value].is-on', root);
  return selected ? selected.getAttribute('data-value') : '';
}

/* ------------------------------------------------------------------ */
/* 启动                                                                 */
/* ------------------------------------------------------------------ */

function init() {
  els.pages = $('#pages');
  els.pageToday = $('#page-today');
  els.pageRecords = $('#page-records');
  els.pageStats = $('#page-stats');
  els.pageSettings = $('#page-settings');
  els.tabbar = $('#tabbar');

  renderTabbar();
  bindGlobalEvents();
  activateTab('today', true);
  store.subscribe(onStoreChange);
  sync.subscribeStatus(onSyncStatusChange);
  sync.initSync();
  registerServiceWorker();
  requestPersistentStorage();
  setTimeout(maybeOnboarding, 520);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function renderTabbar() {
  els.tabbar.innerHTML = TABS.map(
    (tab) =>
      '<button type="button" class="tab-item" data-tab="' + tab.key + '" role="tab" aria-selected="false" aria-label="' + tab.label + '">' +
      '<span class="tab-icon">' + icon(tab.icon, 23) + '</span>' +
      '<span class="tab-label">' + tab.label + '</span>' +
      '</button>'
  ).join('');
}

function bindGlobalEvents() {
  els.tabbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    haptic();
    activateTab(button.getAttribute('data-tab'));
  });

  els.pageToday.addEventListener('click', onTodayClick);
  els.pageRecords.addEventListener('click', onRecordsClick);
  els.pageSettings.addEventListener('click', onSettingsClick);

  els.pageStats.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="go-today"]');
    if (button) activateTab('today');
  });

  document.addEventListener('baby:share-brief', (event) => {
    const detail = event.detail || {};
    Promise.resolve(openBriefSheet({ period: detail.period || 'week', anchor: detail.anchor || state.date })).catch((err) => {
      console.error('[share] 打开简报失败', err);
      toast('生成简报失败，请稍后重试', { icon: 'info' });
    });
  });

  document.addEventListener('baby:go-today', () => activateTab('today'));

  window.addEventListener('error', (event) => {
    if (event && event.message) console.warn('[app] 运行错误', event.message);
  });
}

function onSyncStatusChange() {
  if (state.tab === 'today') renderToday();
  else if (state.tab === 'settings') renderSettings();
}

function onStoreChange(type) {
  if (type === 'storage-error') {
    toast('本机存储空间不足，请先导出备份', { icon: 'info' });
    return;
  }
  if (state.tab === 'today') renderToday();
  else if (state.tab === 'records') renderRecords();
  else if (state.tab === 'settings') renderSettings();
  else if (state.tab === 'stats') mountStatsPage(els.pageStats, { preserveView: true });
}

function activateTab(tab, silent = false) {
  if (!TABS.some((item) => item.key === tab)) return;
  state.tab = tab;
  $$('.tab-item', els.tabbar).forEach((button) => {
    const active = button.getAttribute('data-tab') === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.page').forEach((page) => page.classList.toggle('is-active', page.id === 'page-' + tab));

  if (tab === 'today') renderToday();
  else if (tab === 'records') renderRecords();
  else if (tab === 'settings') renderSettings();
  else if (tab === 'stats') {
    try {
      mountStatsPage(els.pageStats);
    } catch (err) {
      console.error('[stats] 渲染失败', err);
      els.pageStats.innerHTML = '<div class="empty"><div class="empty-icon">' + icon('chart', 30) + '</div><h3>统计数据加载失败</h3><p>刷新页面后再试试。</p></div>';
    }
  }

  if (!silent) window.scrollTo({ top: 0, behavior: 'auto' });
}

function goToDate(key) {
  if (!key) return;
  state.date = key;
  state.calMonth = key.slice(0, 7);
  if (state.tab !== 'today') activateTab('today');
  else renderToday();
}

let lastKnownToday = store.todayKey();

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  const today = store.todayKey();
  if (today === lastKnownToday) return;
  const wasViewingToday = state.date === lastKnownToday;
  lastKnownToday = today;
  if (wasViewingToday) {
    state.date = today;
    state.calMonth = today.slice(0, 7);
    if (state.tab === 'today') renderToday();
  }
}

/* ------------------------------------------------------------------ */
/* 今日页                                                               */
/* ------------------------------------------------------------------ */

function renderToday() {
  const key = state.date;
  const today = store.todayKey();
  const day = store.getDay(key);
  const summary = store.summarizeDay(key);
  const profile = store.getProfile();
  const isToday = key === today;
  const isFuture = key > today;
  const name = profile.name || '宝宝';
  const syncStatus = sync.getStatus();
  const meta = [genderLabel(profile.gender), getAgeText(key)].filter(Boolean).join(' · ');
  const syncBanner = syncStatus.enabled ? renderSyncBanner(syncStatus) : '';

  const statusRow =
    '<div class="status-row">' +
      '<button type="button" class="status-pill ' + (day.weather ? 'is-set' : '') + '" data-action="edit-status">' +
        icon('sun', 16) + '<span>' + (day.weather ? esc(day.weather) : '天气') + '</span>' +
      '</button>' +
      '<button type="button" class="status-pill ' + (day.mood ? 'is-set' : '') + '" data-action="edit-status">' +
        icon('heart', 16) + '<span>' + (day.mood ? esc(day.mood) : '精神') + '</span>' +
      '</button>' +
      '<button type="button" class="status-pill ' + (day.temperature ? 'is-set' : '') + '" data-action="edit-status">' +
        icon('thermometer', 16) + '<span>' + (day.temperature ? esc(day.temperature) + '℃' : '体温') + '</span>' +
      '</button>' +
      '<button type="button" class="status-pill status-edit" data-action="edit-status" aria-label="编辑今日状态">' + icon('edit', 15) + '</button>' +
    '</div>';

  const historyBanner = !isToday
    ? '<div class="history-banner"><span>' + icon('clock', 15) + ' 正在查看 ' + esc(store.formatDateCN(key, true)) + ' 的记录</span><button type="button" data-action="today">回到今天</button></div>'
    : '';

  const agePrompt = !profile.birthday && isToday
    ? '<button type="button" class="age-prompt" data-action="edit-profile">' + icon('sparkle', 15) + ' 设置宝宝生日，显示出生天数</button>'
    : '';

  els.pageToday.innerHTML =
    '<div class="today-hero">' +
      '<div class="hero-glow" aria-hidden="true"></div>' +
      '<div class="hero-top">' +
        '<div class="baby-id">' +
          '<div class="brand-avatar">' + icon('baby', 26) + '</div>' +
          '<div class="baby-id-text">' +
            '<p class="eyebrow">宝宝成长记</p>' +
            '<h1 class="hero-name">' + esc(name) + '</h1>' +
            '<p class="hero-meta">' + (meta ? esc(meta) : '把每一天都记下来') + '</p>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="icon-btn glass" data-action="open-settings" aria-label="设置">' + icon('sliders', 21) + '</button>' +
      '</div>' +
      '<div class="date-switch">' +
        '<button type="button" class="icon-btn ghost" data-action="prev-day" aria-label="前一天">' + icon('chevron-left', 20) + '</button>' +
        '<button type="button" class="date-main" data-action="pick-date">' +
          '<span class="date-strong">' + esc(store.formatDateCN(key)) + '</span>' +
          '<span class="date-week">' + esc(store.weekdayCN(key)) + '</span>' +
          '<span class="date-tag ' + (isToday ? 'is-today' : '') + '">' + (isToday ? '今天' : key === store.addDays(today, -1) ? '昨天' : '历史') + '</span>' +
        '</button>' +
        '<button type="button" class="icon-btn ghost" data-action="next-day" aria-label="后一天"' + (key >= today ? ' disabled' : '') + '>' + icon('chevron-right', 20) + '</button>' +
      '</div>' +
      statusRow +
      agePrompt +
      syncBanner +
    '</div>' +
    '<main class="today-main">' +
      historyBanner +
      renderSummary(summary) +
      renderQuickActions() +
      renderTimeline(day, summary) +
      renderTrackers(day) +
      renderNote(day) +
      (isFuture ? '<p class="muted center">未来的日期还没有记录</p>' : '') +
    '</main>';

  if (isFuture) {
    els.pageToday.querySelector('.today-main').classList.add('is-future');
  }
}

function renderSyncBanner(status) {
  if (!status.enabled) return '';
  const memberText = status.members && status.members.length
    ? status.members.map((member) => member.name || '家人').slice(0, 2).join('、') + (status.members.length > 2 ? ' 等' : '')
    : '家人';
  const isOn = status.connected;
  const label = isOn ? '家庭共享 · ' + memberText : '家庭共享离线';
  const pendingText = status.pending > 0 ? status.pending + ' 条待同步' : isOn ? '实时同步中' : '联网后自动同步';
  return (
    '<button type="button" class="sync-banner ' + (isOn ? 'is-on' : 'is-off') + '" data-action="open-sync" aria-label="家庭共享设置">' +
      '<span class="sync-dot" aria-hidden="true"></span>' +
      '<span class="sync-banner-main">' + icon('users', 15) + '<span>' + esc(label) + '</span></span>' +
      '<span class="sync-banner-side">' + esc(pendingText) + icon('chevron-right', 13) + '</span>' +
    '</button>'
  );
}

function renderSummary(summary) {
  const milkLabel = summary.milkMl === 0 && summary.breastMin > 0 ? '母乳时长' : '总奶量';
  const milkValue = summary.milkMl > 0 ? fmtInt(summary.milkMl) : summary.breastMin > 0 ? fmtInt(summary.breastMin) : '0';
  const milkUnit = summary.milkMl > 0 ? 'ml' : summary.breastMin > 0 ? '分钟' : 'ml';
  const milkSub =
    summary.recordCount === 0
      ? '还没有喂养记录'
      : summary.breastMin > 0
        ? '亲喂 ' + summary.breastMin + ' 分钟 · ' + summary.feedCount + ' 次'
        : summary.feedCount + ' 次瓶喂';

  const peeCount = Math.max(0, summary.diaperCount - summary.poopCount);
  return (
    '<section class="kpi-grid" aria-label="今日汇总">' +
      kpiCard('tint-coral', 'bottle', milkLabel, milkValue, milkUnit, milkSub) +
      kpiCard('tint-amber', 'diaper', '大便', summary.poopCount, '次', '尿布共 ' + summary.diaperCount + ' 张') +
      kpiCard('tint-sky', 'droplet', '尿布', summary.diaperCount, '张', '小便 ' + peeCount + ' 次 · 大便 ' + summary.poopCount + ' 次') +
      kpiCard('tint-sage', 'moon', '睡眠', summary.sleepMin > 0 ? fmtHours(summary.sleepMin) : '0', '小时', summary.sleepMin > 0 ? '共 ' + store.formatMinutes(summary.sleepMin) : '还没有睡眠记录') +
    '</section>'
  );
}

function kpiCard(tint, iconName, label, value, unit, sub) {
  return (
    '<article class="kpi ' + tint + '">' +
      '<div class="kpi-top"><span class="kpi-ico">' + icon(iconName, 17) + '</span><span class="kpi-label">' + esc(label) + '</span></div>' +
      '<p class="kpi-value"><span class="num">' + esc(String(value)) + '</span><span class="kpi-unit">' + esc(unit) + '</span></p>' +
      '<p class="kpi-sub">' + esc(sub) + '</p>' +
    '</article>'
  );
}

function renderQuickActions() {
  const syncStatus = sync.getStatus();
  return (
    '<section class="quick-section">' +
      '<div class="section-head"><h2 class="section-title">快速记录</h2><div class="section-head-side"><span class="section-hint">' + icon(syncStatus.enabled ? 'users' : 'shield', 13) + ' ' + (syncStatus.enabled ? '家庭实时共享' : '仅保存在本机') + '</span><button type="button" class="section-link" data-action="paper-import">' + icon('camera', 14) + ' 纸质记录</button></div></div>' +
      '<div class="quick-grid">' +
      QUICK_ACTIONS.map(
        (action) =>
          '<button type="button" class="quick-action" data-quick="' + action.key + '">' +
          '<span class="quick-ico tint-' + action.tint + '">' + icon(action.icon, 22) + '</span>' +
          '<span class="quick-label">' + action.label + '</span>' +
          '</button>'
      ).join('') +
      '</div>' +
    '</section>'
  );
}

function buildTimeline(day) {
  const items = [];
  day.feeds.forEach((feed) => {
    let title = '';
    if (feed.kind === 'breast') title = '母乳亲喂 · ' + feed.minutes + ' 分钟';
    else if (feed.kind === 'bottle') title = '瓶喂母乳 · ' + feed.amountMl + ' ml';
    else title = '配方奶 · ' + feed.amountMl + ' ml';
    const subParts = [];
    if (feed.kind === 'breast' && feed.side) subParts.push(sideLabel(feed.side));
    if (feed.note) subParts.push(feed.note);
    if (!subParts.length) subParts.push(feed.kind === 'breast' ? '亲喂' : '已完成');
    items.push({ kind: 'feed', id: feed.id, time: feed.time, icon: 'bottle', tint: 'coral', title, sub: subParts.join(' · ') });
  });
  day.diapers.forEach((diaper) => {
    const subParts = [];
    if (diaper.color) subParts.push('颜色 ' + diaper.color);
    if (diaper.amount) subParts.push('量 ' + diaper.amount);
    if (diaper.note) subParts.push(diaper.note);
    if (!subParts.length) subParts.push('已记录');
    items.push({
      kind: 'diaper',
      id: diaper.id,
      time: diaper.time,
      icon: 'diaper',
      tint: 'amber',
      title: '尿布 · ' + diaperTypeLabel(diaper.type),
      sub: subParts.join(' · '),
    });
  });
  day.sleeps.forEach((sleep) => {
    const minutes = store.sleepMinutes(sleep.start, sleep.end);
    const subParts = [store.formatMinutes(minutes)];
    if (sleep.direction) subParts.push(directionLabel(sleep.direction));
    if (sleep.note) subParts.push(sleep.note);
    items.push({
      kind: 'sleep',
      id: sleep.id,
      time: sleep.start,
      icon: 'moon',
      tint: 'sky',
      title: '睡眠 ' + sleep.start + ' - ' + sleep.end,
      sub: subParts.join(' · '),
    });
  });
  return items.sort((a, b) => b.time.localeCompare(a.time));
}

function renderTimeline(day, summary) {
  const allItems = buildTimeline(day);
  const counts = {
    all: allItems.length,
    feed: allItems.filter((item) => item.kind === 'feed').length,
    diaper: allItems.filter((item) => item.kind === 'diaper').length,
    sleep: allItems.filter((item) => item.kind === 'sleep').length,
  };
  const filter = state.timelineFilter;
  const items = filter === 'all' ? allItems : allItems.filter((item) => item.kind === filter);

  const filterRow =
    '<div class="timeline-filters">' +
    TIMELINE_FILTERS.map((item) => {
      const disabled = counts[item.key] === 0 && item.key !== 'all';
      return (
        '<button type="button" class="filter-chip ' + (filter === item.key ? 'is-on' : '') + '" data-filter="' + item.key + '"' + (disabled ? ' disabled' : '') + '>' +
        item.label +
        '<span>' + counts[item.key] + '</span>' +
        '</button>'
      );
    }).join('') +
    '</div>';

  const list = items.length
    ? '<div class="timeline card">' +
      items
        .map(
          (item) =>
            '<button type="button" class="timeline-item" data-record-kind="' + item.kind + '" data-record-id="' + esc(item.id) + '">' +
            '<span class="tl-time">' + esc(item.time) + '</span>' +
            '<span class="tl-mark tint-' + item.tint + '">' + icon(item.icon, 17) + '</span>' +
            '<span class="tl-main"><strong>' + esc(item.title) + '</strong><small>' + esc(item.sub) + '</small></span>' +
            '<span class="tl-arrow">' + icon('chevron-right', 15) + '</span>' +
            '</button>'
        )
        .join('') +
      '</div>'
    : renderTimelineEmpty(filter, summary);

  return (
    '<section class="timeline-section">' +
      '<div class="section-head"><h2 class="section-title">今日时间线</h2><span class="section-hint">' + (allItems.length ? allItems.length + ' 条记录' : '还没有记录') + '</span></div>' +
      (allItems.length ? filterRow : '') +
      list +
    '</section>'
  );
}

function renderTimelineEmpty(filter, summary) {
  const text =
    filter === 'feed'
      ? '还没有喂养记录，记录第一口奶吧'
      : filter === 'diaper'
        ? '还没有尿布记录'
        : filter === 'sleep'
          ? '还没有睡眠记录'
          : summary.recordCount > 0
            ? '这个分类下暂时没有记录'
            : '宝宝的第一口奶，从几点开始？';
  return (
    '<div class="empty">' +
      '<div class="empty-icon">' + icon(filter === 'sleep' ? 'moon' : filter === 'diaper' ? 'diaper' : 'bottle', 30) + '</div>' +
      '<h3>' + (summary.recordCount > 0 ? '暂无记录' : '今天还没有记录') + '</h3>' +
      '<p>' + esc(text) + '</p>' +
      '<div class="empty-actions">' +
        '<button type="button" class="btn btn-primary" data-quick="feed">记录喂奶</button>' +
        '<button type="button" class="btn btn-soft" data-quick="diaper">记录尿布</button>' +
      '</div>' +
    '</div>'
  );
}

function renderTrackers(day) {
  const supplementDone = store.SUPPLEMENTS.filter((item) => day.supplements[item.key]).length;
  const careDone = store.CARES.filter((item) => day.cares[item.key]).length;
  const earlyList = store.EARLY_EDU.filter((item) => day.early[item.key]);
  const earlyMin = earlyList.reduce((sum, item) => sum + (day.early[item.key].minutes || 0), 0);
  const supplementPreview = store.SUPPLEMENTS.filter((item) => day.supplements[item.key]).map((item) => item.label).join(' · ');
  const carePreview = store.CARES.filter((item) => day.cares[item.key]).map((item) => item.label).join(' · ');
  const earlyPreview = earlyList.map((item) => item.label).join(' · ');

  return (
    '<section class="tracker-card card">' +
      trackerRow('supplement', 'pill', 'sage', '补剂 & 药物', supplementDone + '/' + store.SUPPLEMENTS.length, supplementPreview || 'AD、D3、DHA、铁…', supplementDone / store.SUPPLEMENTS.length) +
      trackerRow('care', 'heart', 'lilac', '护理记录', careDone + '/' + store.CARES.length, carePreview || '洗脸、洗澡、剪指甲…', careDone / store.CARES.length) +
      trackerRow('early', 'book', 'peach', '早教 / 锻炼', earlyList.length + ' 项', earlyPreview ? earlyPreview + (earlyMin ? ' · ' + earlyMin + ' 分钟' : '') : '视觉、听觉、大动作…', earlyList.length / store.EARLY_EDU.length) +
    '</section>'
  );
}

function trackerRow(openKey, iconName, tint, title, value, sub, progress) {
  const width = Math.max(0, Math.min(100, Math.round((Number(progress) || 0) * 100)));
  return (
    '<button type="button" class="tracker-row" data-open="' + openKey + '">' +
      '<span class="tracker-ico tint-' + tint + '">' + icon(iconName, 19) + '</span>' +
      '<span class="tracker-main">' +
        '<span class="tracker-title"><strong>' + title + '</strong><span class="tracker-value">' + esc(value) + '</span></span>' +
        '<span class="mini-bar"><i style="width:' + width + '%"></i></span>' +
        '<small>' + esc(sub) + '</small>' +
      '</span>' +
      '<span class="tl-arrow">' + icon('chevron-right', 15) + '</span>' +
    '</button>'
  );
}

function renderNote(day) {
  return (
    '<button type="button" class="note-card card" data-action="edit-note">' +
      '<span class="note-head"><span class="note-label">' + icon('note', 17) + ' 今日心得</span><span class="note-edit">' + icon('edit', 15) + ' 编辑</span></span>' +
      '<p class="note-text' + (day.note ? '' : ' is-empty') + '">' + (day.note ? esc(day.note) : '记下今天想说的话，或宝宝的小小进步…') + '</p>' +
    '</button>'
  );
}

function onTodayClick(event) {
  const target = event.target;
  const actionButton = target.closest('[data-action]');
  const quickButton = target.closest('[data-quick]');
  const filterButton = target.closest('[data-filter]');
  const recordButton = target.closest('[data-record-kind]');
  const openButton = target.closest('[data-open]');

  if (quickButton) {
    haptic();
    openQuickSheet(quickButton.getAttribute('data-quick'));
    return;
  }
  if (openButton) {
    haptic();
    openQuickSheet(openButton.getAttribute('data-open'));
    return;
  }
  if (filterButton) {
    state.timelineFilter = filterButton.getAttribute('data-filter');
    renderToday();
    return;
  }
  if (recordButton) {
    haptic();
    const kind = recordButton.getAttribute('data-record-kind');
    const id = recordButton.getAttribute('data-record-id');
    if (kind === 'feed') openFeedSheet(id);
    else if (kind === 'diaper') openDiaperSheet(id);
    else if (kind === 'sleep') openSleepSheet(id);
    return;
  }
  if (!actionButton) return;

  const action = actionButton.getAttribute('data-action');
  if (action === 'prev-day') goToDate(store.addDays(state.date, -1));
  else if (action === 'next-day') {
    if (state.date < store.todayKey()) goToDate(store.addDays(state.date, 1));
  } else if (action === 'today') goToDate(store.todayKey());
  else if (action === 'pick-date') pickDate(state.date, (key) => goToDate(key));
  else if (action === 'edit-status') openStatusSheet();
  else if (action === 'edit-note') openNoteSheet();
  else if (action === 'paper-import') {
    openPaperImport({
      dateKey: state.date,
      onSaved(key) {
        if (key !== state.date) goToDate(key);
        else renderToday();
      },
    });
  }
  else if (action === 'edit-profile') openProfileSheet();
  else if (action === 'open-settings') activateTab('settings');
  else if (action === 'open-sync') openFamilySheet();
}

/* ------------------------------------------------------------------ */
/* 记录页                                                               */
/* ------------------------------------------------------------------ */

function renderRecords() {
  const month = state.calMonth;
  const [year, monthNumber] = month.split('-').map(Number);
  const today = store.todayKey();
  const currentMonth = today.slice(0, 7);
  const firstKey = month + '-01';
  const startOffset = (store.parseDateKey(firstKey).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const isCurrentMonth = month === currentMonth;

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push('<span class="cal-cell is-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = month + '-' + String(day).padStart(2, '0');
    const summary = store.hasDay(key) ? store.summarizeDay(key) : null;
    const hasData = Boolean(summary && summary.hasData);
    const isToday = key === today;
    const isSelected = key === state.date;
    const isFuture = key > today;
    cells.push(
      '<button type="button" class="cal-cell' +
        (hasData ? ' has-data' : '') +
        (isToday ? ' is-today' : '') +
        (isSelected ? ' is-selected' : '') +
        '" data-date="' + key + '"' + (isFuture ? ' disabled' : '') + ' aria-label="' + store.formatDateCN(key, true) + (hasData ? '，有记录' : '') + '">' +
        '<span class="cal-num">' + day + '</span>' +
        (hasData ? '<span class="cal-dot"></span>' : '') +
        '</button>'
    );
  }

  const monthKeys = store.getRecordedDays().filter((key) => key.startsWith(month));
  const monthTotals = monthKeys.reduce(
    (acc, key) => {
      const summary = store.summarizeDay(key);
      acc.milk += summary.milkMl;
      acc.poop += summary.poopCount;
      acc.diaper += summary.diaperCount;
      acc.sleep += summary.sleepMin;
      acc.records += summary.recordCount;
      return acc;
    },
    { milk: 0, poop: 0, diaper: 0, sleep: 0, records: 0 }
  );
  const avgSleep = monthKeys.length ? monthTotals.sleep / monthKeys.length : 0;

  const dayCards = monthKeys
    .slice()
    .reverse()
    .map((key) => {
      const summary = store.summarizeDay(key);
      const date = store.parseDateKey(key);
      const weekday = store.weekdayCN(key);
      const isToday = key === today;
      return (
        '<button type="button" class="day-card card" data-date="' + key + '">' +
          '<span class="day-date"><strong>' + date.getDate() + '</strong><span>' + weekday + '</span>' + (isToday ? '<em>今天</em>' : '') + '</span>' +
          '<span class="day-body">' +
            '<span class="day-line"><b>' + (summary.milkMl ? fmtInt(summary.milkMl) + ' ml' : summary.breastMin ? summary.breastMin + ' 分钟' : '0 ml') + '</b><i>奶量</i><span class="dot-sep"></span><b>' + summary.poopCount + ' 次</b><i>大便</i><span class="dot-sep"></span><b>' + fmtHours(summary.sleepMin) + ' 小时</b><i>睡眠</i></span>' +
            '<span class="day-tags">' +
              '<span class="mini-tag">补剂 ' + summary.supplementDone + '/' + store.SUPPLEMENTS.length + '</span>' +
              '<span class="mini-tag">护理 ' + summary.careDone + '/' + store.CARES.length + '</span>' +
              (summary.earlyDone ? '<span class="mini-tag">早教 ' + summary.earlyDone + ' 项</span>' : '') +
              (store.getDay(key).note ? '<span class="mini-tag">有心得</span>' : '') +
            '</span>' +
          '</span>' +
          '<span class="tl-arrow">' + icon('chevron-right', 16) + '</span>' +
        '</button>'
      );
    })
    .join('');

  const empty =
    '<div class="empty card">' +
      '<div class="empty-icon">' + icon('calendar', 30) + '</div>' +
      '<h3>这个月还没有记录</h3>' +
      '<p>从今天开始，慢慢积累宝宝的成长足迹。</p>' +
      '<button type="button" class="btn btn-primary" data-action="go-today">去记录</button>' +
    '</div>';

  els.pageRecords.innerHTML =
    '<header class="page-head">' +
      '<div class="page-head-top">' +
        '<div><p class="eyebrow">成长足迹</p><h1 class="page-title">记录</h1><p class="page-sub">按天回看每一次喂养与护理</p></div>' +
        '<button type="button" class="icon-btn" data-action="today" aria-label="回到今天">' + icon('sparkle', 20) + '</button>' +
      '</div>' +
    '</header>' +
    '<section class="month-card card">' +
      '<div class="month-head">' +
        '<button type="button" class="icon-btn ghost sm" data-action="month-prev" aria-label="上个月">' + icon('chevron-left', 19) + '</button>' +
        '<div class="month-title"><h2>' + year + '年' + monthNumber + '月</h2><span>' + (isCurrentMonth ? '本月' : '回看') + '</span></div>' +
        '<button type="button" class="icon-btn ghost sm" data-action="month-next" aria-label="下个月"' + (isCurrentMonth ? ' disabled' : '') + '>' + icon('chevron-right', 19) + '</button>' +
      '</div>' +
      '<div class="weekday-row"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
      '<div class="calendar-grid">' + cells.join('') + '</div>' +
      '<div class="month-foot">' +
        '<span>' + icon('check', 13) + ' 有记录</span>' +
        (isCurrentMonth ? '' : '<button type="button" class="link-btn" data-action="month-current">回到本月</button>') +
      '</div>' +
    '</section>' +
    '<section class="month-summary card">' +
      '<div class="month-summary-head"><strong>本月小结</strong><span>' + monthKeys.length + ' 天有记录</span></div>' +
      '<div class="month-stats">' +
        '<div><b>' + fmtInt(monthTotals.milk) + '</b><span>总奶量 ml</span></div>' +
        '<div><b>' + monthTotals.poop + '</b><span>大便 次</span></div>' +
        '<div><b>' + monthTotals.diaper + '</b><span>尿布 张</span></div>' +
        '<div><b>' + fmtHours(avgSleep) + '</b><span>日均睡眠 h</span></div>' +
      '</div>' +
    '</section>' +
    '<div class="section-head"><h2 class="section-title">每日记录</h2><span class="section-hint">' + (monthKeys.length ? '共 ' + monthKeys.length + ' 天' : '暂无') + '</span></div>' +
    '<div class="day-list">' + (dayCards || empty) + '</div>' +
    '<p class="muted center records-tip">点任意一天可以查看并补录当天的记录</p>';
}

function onRecordsClick(event) {
  const target = event.target;
  const dateButton = target.closest('[data-date]');
  if (dateButton) {
    haptic();
    goToDate(dateButton.getAttribute('data-date'));
    return;
  }
  const actionButton = target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.getAttribute('data-action');
  if (action === 'month-prev') {
    state.calMonth = shiftMonth(state.calMonth, -1);
    renderRecords();
  } else if (action === 'month-next') {
    const currentMonth = store.todayKey().slice(0, 7);
    if (state.calMonth < currentMonth) {
      state.calMonth = shiftMonth(state.calMonth, 1);
      renderRecords();
    }
  } else if (action === 'month-current') {
    state.calMonth = store.todayKey().slice(0, 7);
    renderRecords();
  } else if (action === 'today') {
    goToDate(store.todayKey());
  } else if (action === 'go-today') {
    activateTab('today');
  }
}

function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/* 我的 / 设置页                                                        */
/* ------------------------------------------------------------------ */

function getStreak() {
  let cursor = store.todayKey();
  if (!store.summarizeDay(cursor).hasData) cursor = store.addDays(cursor, -1);
  let streak = 0;
  while (streak < 3660) {
    if (!store.summarizeDay(cursor).hasData) break;
    streak += 1;
    cursor = store.addDays(cursor, -1);
  }
  return streak;
}

function renderSettings() {
  const profile = store.getProfile();
  const info = store.storageInfo();
  const streak = getStreak();
  const settings = store.getSettings() || {};
  const lastBackup = settings.lastBackupAt || '';
  const needsBackup = info.dayCount > 0 && (!lastBackup || store.diffDays(lastBackup, store.todayKey()) >= 30);
  const syncStatus = sync.getStatus();
  const syncSub = !syncStatus.enabled
    ? '和家人共同记录，实时同步'
    : syncStatus.connected
      ? '已连接 · 房间 ' + syncStatus.room + ' · ' + syncStatus.members.length + ' 位家人'
      : syncStatus.connecting
        ? '正在连接家庭服务器…'
        : '离线 · ' + syncStatus.pending + ' 条待同步';
  const ageText = getAgeText(store.todayKey()) || '出生天数未设置';
  const birthdayText = profile.birthday ? '生日 ' + store.formatDateCN(profile.birthday, true) : '点击设置宝宝生日';
  const sizeText = info.dayCount ? Math.max(1, Math.round(info.bytes / 1024)) + ' KB' : '0 KB';
  const recordText = info.firstDay ? store.formatDateCN(info.firstDay, true) + ' 起' : '还没有记录';
  const installSub = isStandalone() ? '已添加到主屏幕' : 'Safari 分享 → 添加到主屏幕';
  const backupSub = lastBackup ? '上次导出 ' + store.formatDateCN(lastBackup, true) : '建议定期导出，防止数据丢失';

  els.pageSettings.innerHTML =
    '<header class="page-head">' +
      '<div class="page-head-top">' +
        '<div><p class="eyebrow">关于宝宝</p><h1 class="page-title">我的</h1><p class="page-sub">档案、备份与安装</p></div>' +
        '<span class="version-pill">v' + APP_VERSION + '</span>' +
      '</div>' +
    '</header>' +
    '<section class="profile-card card">' +
      '<div class="avatar-xl">' + icon('baby', 32) + '</div>' +
      '<div class="profile-main">' +
        '<h2>' + esc(profile.name || '宝宝') + '</h2>' +
        '<p>' + esc([genderLabel(profile.gender), ageText].filter(Boolean).join(' · ')) + '</p>' +
        '<p class="muted">' + esc(birthdayText) + '</p>' +
      '</div>' +
      '<button type="button" class="icon-btn" data-action="edit-profile" aria-label="编辑宝宝档案">' + icon('edit', 19) + '</button>' +
    '</section>' +
    (needsBackup
      ? '<section class="hint-card">' +
          '<div class="hint-ico">' + icon('shield', 20) + '</div>' +
          '<div class="hint-main"><strong>' + (syncStatus.enabled ? '本机与家庭服务器各有一份' : '数据只保存在这台手机') + '</strong><span>' + (syncStatus.enabled ? '仍建议定期导出备份，换手机前先导出。' : '建议每月导出一次备份；换手机前请务必导出。') + '</span></div>' +
          '<button type="button" class="btn btn-soft btn-sm" data-action="export">导出</button>' +
        '</section>'
      : '') +
    '<section class="settings-group card" aria-label="设置项">' +
      settingRow('edit-profile', 'baby', '宝宝档案', ageText) +
      settingRow('family', 'users', '家庭共享', syncSub) +
      settingRow('install', 'download', '安装到主屏幕', installSub) +
      settingRow('export', 'file', '导出备份', backupSub) +
      settingRow('import', 'restore', '导入备份', '从备份文件恢复，支持合并') +
      settingRow('about', 'info', '关于与隐私', syncStatus.enabled ? '家人共享中，数据在自家服务器' : '数据不上传，仅保存在本机') +
    '</section>' +
    '<section class="storage-card card">' +
      '<div class="storage-head"><strong>数据概览</strong><span>' + icon(syncStatus.enabled ? 'users' : 'shield', 13) + ' ' + (syncStatus.enabled ? '本机 + 家庭服务器' : '本机存储') + '</span></div>' +
      '<div class="storage-grid">' +
        '<div><b>' + info.dayCount + '</b><span>记录天数</span></div>' +
        '<div><b>' + info.recordCount + '</b><span>记录条数</span></div>' +
        '<div><b>' + sizeText + '</b><span>占用空间</span></div>' +
        '<div><b>' + (streak ? streak + ' 天' : '—') + '</b><span>连续记录</span></div>' +
      '</div>' +
      '<p class="storage-note">' + esc(recordText) + (info.lastDay ? ' · 最近 ' + store.formatDateCN(info.lastDay) : '') + '</p>' +
    '</section>' +
    '<section class="settings-group card" aria-label="危险操作">' +
      settingRow('reset', 'trash', '清空所有记录', '保留宝宝档案，删除全部记录', true) +
    '</section>' +
    '<p class="about-foot">宝宝成长记 v' + APP_VERSION + ' · 为家人而做</p>' +
    '<p class="about-foot small">' + (syncStatus.enabled ? '记录在本机与你们自己的家庭服务器之间同步，不经过第三方云。' : '所有数据仅存储在本机浏览器中，不会上传服务器。') + '</p>';
}

function settingRow(action, iconName, title, sub, danger = false) {
  return (
    '<button type="button" class="list-row' + (danger ? ' danger' : '') + '" data-action="' + action + '">' +
      '<span class="row-ico' + (danger ? ' is-danger' : '') + '">' + icon(iconName, 19) + '</span>' +
      '<span class="list-row-main"><span class="list-row-title">' + esc(title) + '</span><span class="list-row-sub">' + esc(sub) + '</span></span>' +
      '<span class="list-row-side">' + icon('chevron-right', 17) + '</span>' +
    '</button>'
  );
}

function onSettingsClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.getAttribute('data-action');
  if (action === 'edit-profile') openProfileSheet();
  else if (action === 'install') openInstallSheet();
  else if (action === 'export') exportBackup();
  else if (action === 'import') importBackup();
  else if (action === 'reset') resetEverything();
  else if (action === 'about') openAboutSheet();
  else if (action === 'family') openFamilySheet();
}


function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 6; i += 1) out += chars[bytes[i] % chars.length];
  } catch (err) {
    for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function formatSyncClock(ts) {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function syncInviteText(room) {
  return '宝宝成长记 · 家庭共享\n打开：' + location.origin + '\n房间码：' + room + '\n用 Safari 打开后，在「我的 → 家庭共享」输入房间码，就能一起记录啦。';
}

function openFamilySheet() {
  const status = sync.getStatus();
  const origin = location.origin;

  if (status.enabled) {
    const memberChips = (status.members || [])
      .map((member) => {
        const isSelf = member.clientId === status.clientId;
        return '<span class="member-chip' + (isSelf ? ' is-self' : '') + '">' + icon(isSelf ? 'baby' : 'users', 13) + (isSelf ? '我' : esc(member.name || '家人')) + '</span>';
      })
      .join('');
    const body =
      '<div class="sync-status-card ' + (status.connected ? 'is-on' : 'is-off') + '">' +
        '<div class="sync-status-line"><span class="sync-dot"></span><strong>' + (status.connected ? '家庭实时同步中' : '暂时离线') + '</strong>' +
        '<span class="sync-status-side">' + (status.pending ? status.pending + ' 条待同步' : '已全部同步') + '</span></div>' +
        '<p>房间 <b>' + esc(status.room) + '</b> · 我是 ' + esc(status.name) + '</p>' +
        '<div class="sync-members">' + (memberChips || '<span class="member-chip">' + esc(status.name) + '</span>') + '</div>' +
        '<p class="sync-last">最近同步 ' + formatSyncClock(status.lastSyncedAt) + ' · ' + (status.lastError ? esc(status.lastError) : '一切正常') + '</p>' +
      '</div>' +
      '<div class="sync-code-box">' +
        '<div><span>家庭房间码</span><strong>' + esc(status.room) + '</strong></div>' +
        '<button type="button" class="btn btn-soft btn-sm" data-copy-code>复制</button>' +
      '</div>' +
      '<div class="sync-actions">' +
        '<button type="button" class="btn btn-primary btn-block" data-sync-now>' + icon('cloud', 17) + ' 立即同步</button>' +
        '<div class="sync-actions-row">' +
          '<button type="button" class="btn btn-ghost" data-copy-invite>' + icon('share', 15) + ' 邀请</button>' +
          '<button type="button" class="btn btn-ghost" data-family-backup>' + icon('file', 15) + ' 备份</button>' +
          '<button type="button" class="btn btn-ghost danger-text" data-disable-sync>退出</button>' +
        '</div>' +
      '</div>' +
      '<p class="notice">' + icon('shield', 16) + '<span>退出后本机记录仍保留，家庭空间里的记录不会被删除；以后输入同一房间码可以再次加入。</span></p>' +
      '<p class="sheet-tip">数据由你们自己的家庭服务器保存：' + esc(origin) + '</p>';

    openSheet({
      title: '家庭共享',
      subtitle: '和家人实时共同记录',
      className: 'family-sheet',
      body,
      onMount({ root, close }) {
        const invite = syncInviteText(status.room);
        $('[data-copy-code]', root).addEventListener('click', async () => {
          const ok = await copyText(status.room);
          toast(ok ? '房间码已复制' : '复制失败，请手动记下', { icon: ok ? 'check' : 'info' });
        });
        $('[data-copy-invite]', root).addEventListener('click', async () => {
          const ok = await copyText(invite);
          toast(ok ? '邀请已复制，发给家人即可' : '复制失败', { icon: ok ? 'check' : 'info' });
        });
        $('[data-family-backup]', root).addEventListener('click', async () => {
          const button = $('[data-family-backup]', root);
          button.disabled = true;
          try {
            const text = await sync.exportFamilyBackup();
            downloadTextFile(text, '宝宝成长记-家庭备份-' + store.todayKey() + '.json');
            toast('家庭数据已导出，请保存到「文件」App', { icon: 'download' });
          } catch (err) {
            toast(err && err.message ? err.message : '备份失败，请稍后再试', { icon: 'info' });
          } finally {
            button.disabled = false;
          }
        });
        $('[data-sync-now]', root).addEventListener('click', async () => {
          const button = $('[data-sync-now]', root);
          button.disabled = true;
          const next = await sync.syncNow();
          button.disabled = false;
          toast(next.connected ? '已是最新' : next.lastError || '同步失败，请稍后再试', { icon: next.connected ? 'check' : 'info' });
        });
        $('[data-disable-sync]', root).addEventListener('click', async () => {
          close();
          const ok = await confirmDialog({
            title: '退出家庭共享？',
            message: status.pending ? '还有 ' + status.pending + ' 条记录没同步到家庭空间，退出后会先尝试发送，发送失败则保留在本机队列里。' : '退出后不再实时同步，但本机记录会保留，随时可以用房间码重新加入。',
            confirmText: '退出共享',
            danger: true,
            iconName: 'users',
          });
          if (!ok) return;
          await sync.disable();
          toast('已退出家庭共享，本机记录保留');
          if (state.tab === 'settings') renderSettings();
          else if (state.tab === 'today') renderToday();
        });
      },
    });
    return;
  }

  const localDays = store.getRecordedDays().length;
  const suggestedRoom = generateRoomCode();
  const defaultMemberName = '妈妈';
  const body =
    '<div class="family-intro">' +
      '<div class="family-illustration">' + icon('users', 30) + '</div>' +
      '<h3>家人的记录，实时在一起</h3>' +
      '<p>开启后，家人的手机共用同一份记录：有人喂奶、换尿布，其他手机上会立刻出现，谁都能补充和修改。</p>' +
    '</div>' +
    '<div class="notice" data-server-check>' + icon('cloud', 16) + '<span>正在检查当前地址是否为家庭服务器…</span></div>' +
    '<label class="field"><span class="field-label">家庭房间码</span>' +
      '<div class="code-input-row"><input class="input code-input" type="text" name="room" maxlength="6" value="' + suggestedRoom + '" placeholder="例如 A7K2M9" autocapitalize="characters" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="btn btn-soft btn-sm" data-new-code>换一个</button></div>' +
      '<span class="field-hint">6 位字母或数字。请和家人核对房间码，输错会进入一个新的空房间。</span>' +
    '</label>' +
    '<label class="field"><span class="field-label">我的称呼</span><input class="input" type="text" name="memberName" maxlength="20" value="' + esc(defaultMemberName) + '" placeholder="例如：妈妈、爸爸、外婆"></label>' +
    (localDays > 0
      ? '<div class="notice warning">' + icon('info', 16) + '<span>本机已有 ' + localDays + ' 天记录，开启后会按天合并到家庭空间，不会清空本机数据。</span></div>'
      : '') +
    '<div class="server-box"><span>家庭服务器</span><code>' + esc(origin) + '</code></div>' +
    '<p class="form-error" data-family-error hidden></p>' +
    '<p class="sheet-tip">如果当前是 GitHub Pages 等静态地址，需要先运行项目里的「家庭共享服务器」；详见 README。</p>';

  openSheet({
    title: '家庭共享',
    subtitle: '让家人一起记录',
    className: 'family-sheet',
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-enable-sync>' + icon('users', 17) + ' 开启家庭共享</button>',
    onMount({ root, close }) {
      const roomInput = $('[name="room"]', root);
      const nameInput = $('[name="memberName"]', root);
      const enableButton = $('[data-enable-sync]', root);
      const errorEl = $('[data-family-error]', root);

      roomInput.addEventListener('input', () => {
        roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      });
      $('[data-new-code]', root).addEventListener('click', () => {
        roomInput.value = generateRoomCode();
        roomInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      enableButton.disabled = true;
      sync.checkServer().then((ok) => {
        if (!root.isConnected) return;
        const checkEl = $('[data-server-check]', root);
        if (!checkEl) return;
        enableButton.disabled = !ok;
        if (ok) {
          checkEl.className = 'notice';
          checkEl.innerHTML = icon('cloud', 16) + '<span>家庭服务器已就绪，可以开启共享。</span>';
        } else {
          checkEl.className = 'notice warning';
          checkEl.innerHTML = icon('info', 16) + '<span>当前地址不是家庭服务器。请用家庭服务器启动的地址打开本页面（README 有启动方法），否则无法实时同步。</span>';
        }
      });

      enableButton.addEventListener('click', async () => {
        const room = roomInput.value.trim().toUpperCase();
        const name = nameInput.value.trim();
        if (!/^[A-Z0-9]{6}$/.test(room)) {
          errorEl.hidden = false;
          errorEl.textContent = '房间码需要 6 位字母或数字';
          roomInput.focus();
          return;
        }
        errorEl.hidden = true;
        enableButton.disabled = true;
        enableButton.innerHTML = '<span class="st-spinner" aria-hidden="true"></span> 正在连接…';
        try {
          const result = await sync.enable({ room, code: room, name });
          close();
          toast('已开启家庭共享 · 房间 ' + room, { duration: 3200 });
          if (state.tab === 'settings') renderSettings();
          else if (state.tab === 'today') renderToday();
          if (localDays > 0) {
            setTimeout(() => toast('本机 ' + localDays + ' 天记录已合并到家庭空间', { icon: 'users', duration: 3000 }), 800);
          }
          return result;
        } catch (err) {
          enableButton.disabled = false;
          enableButton.innerHTML = icon('users', 17) + ' 开启家庭共享';
          errorEl.hidden = false;
          errorEl.textContent = err && err.message ? err.message : '连接失败，请检查家庭服务器';
        }
      });
    },
  });
}

function isStandalone() {
  return Boolean(window.navigator.standalone) || window.matchMedia('(display-mode: standalone)').matches;
}

/* ------------------------------------------------------------------ */
/* 快捷记录入口                                                         */
/* ------------------------------------------------------------------ */

function openQuickSheet(key) {
  if (key === 'feed') openFeedSheet();
  else if (key === 'diaper') openDiaperSheet();
  else if (key === 'sleep') openSleepSheet();
  else if (key === 'supplement') openSupplementSheet();
  else if (key === 'care') openCareSheet();
  else if (key === 'early') openEarlySheet();
}

/* ------------------------------------------------------------------ */
/* 喂奶                                                                 */
/* ------------------------------------------------------------------ */

function openFeedSheet(id = null) {
  const key = state.date;
  const day = store.getDay(key);
  const existing = id ? day.feeds.find((item) => item.id === id) : null;
  const initialKind = existing ? existing.kind : 'formula';
  const initialAmount = existing && existing.kind !== 'breast' ? existing.amountMl : 120;
  const initialMinutes = existing && existing.kind === 'breast' ? existing.minutes : 15;
  const initialSide = existing ? existing.side : 'both';
  const time = existing ? existing.time : store.nowHM();
  const note = existing ? existing.note : '';

  const body =
    '<div class="field">' +
      '<span class="field-label">喂养方式</span>' +
      '<div class="segmented seg-feed">' +
        store.FEED_KINDS.map(
          (item) =>
            '<button type="button" class="seg-btn' + (item.key === initialKind ? ' is-active' : '') + '" data-kind="' + item.key + '">' + item.label + '</button>'
        ).join('') +
      '</div>' +
    '</div>' +
    '<div class="field-grid">' +
      '<label class="field"><span class="field-label">时间</span><input class="input" type="time" name="time" value="' + time + '"></label>' +
      '<label class="field" data-amount-field><span class="field-label">奶量</span><span class="input-unit"><input class="input num" type="number" inputmode="numeric" min="0" max="500" step="5" name="amount" value="' + (initialAmount || '') + '"><em>ml</em></span></label>' +
      '<label class="field is-hidden" data-minute-field><span class="field-label">时长</span><span class="input-unit"><input class="input num" type="number" inputmode="numeric" min="0" step="1" name="minutes" value="' + (initialMinutes || '') + '"><em>分钟</em></span></label>' +
    '</div>' +
    '<div class="quick-picks" data-amount-picks>' +
      [60, 90, 120, 150, 180, 210].map((amount) => '<button type="button" class="quick-pick" data-amount="' + amount + '">' + amount + ' ml</button>').join('') +
    '</div>' +
    '<div class="field is-hidden" data-side-field>' +
      '<span class="field-label">哪一侧</span>' +
      chipRow('side', store.FEED_SIDES, initialSide) +
    '</div>' +
    '<label class="field"><span class="field-label">备注（可选）</span><input class="input" type="text" name="note" maxlength="60" value="' + esc(note) + '" placeholder="例如：夜里醒来，喝得很快"></label>' +
    (existing ? '<button type="button" class="btn btn-ghost btn-block danger-text" data-delete>删除这条记录</button>' : '');

  openSheet({
    title: existing ? '编辑喂奶记录' : '记录喂奶',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>' + (existing ? '保存修改' : '保存记录') + '</button>',
    onMount({ root, close }) {
      function applyKind(kind) {
        $('[data-amount-field]', root).classList.toggle('is-hidden', kind === 'breast');
        $('[data-minute-field]', root).classList.toggle('is-hidden', kind !== 'breast');
        $('[data-side-field]', root).classList.toggle('is-hidden', kind !== 'breast');
        $('[data-amount-picks]', root).classList.toggle('is-hidden', kind === 'breast');
      }
      applyKind(initialKind);
      bindChipRow(root, '.chip-row[data-group="side"]');

      $$('.seg-feed [data-kind]', root).forEach((button) => {
        button.addEventListener('click', () => {
          $$('.seg-feed .seg-btn', root).forEach((item) => item.classList.remove('is-active'));
          button.classList.add('is-active');
          applyKind(button.getAttribute('data-kind'));
        });
      });

      $$('[data-amount]', root).forEach((button) => {
        button.addEventListener('click', () => {
          $('[name="amount"]', root).value = button.getAttribute('data-amount');
          $$('[data-amount]', root).forEach((item) => item.classList.remove('is-on'));
          button.classList.add('is-on');
        });
      });

      $('[data-save]', root).addEventListener('click', () => {
        const activeKind = $('.seg-feed .seg-btn.is-active', root);
        const kind = activeKind ? activeKind.getAttribute('data-kind') : 'formula';
        const feedTime = $('[name="time"]', root).value || store.nowHM();
        const amount = Number($('[name="amount"]', root).value) || 0;
        const minutes = Number($('[name="minutes"]', root).value) || 0;
        const noteValue = $('[name="note"]', root).value.trim();
        const sideButton = $('[data-side-field] .chip.is-on', root);
        const side = sideButton ? sideButton.getAttribute('data-value') : 'both';

        if (kind === 'breast' && minutes <= 0) {
          toast('请填写母乳喂养时长', { icon: 'info' });
          return;
        }
        if (kind !== 'breast' && amount <= 0) {
          toast('请填写奶量', { icon: 'info' });
          return;
        }
        if (kind !== 'breast' && amount > 500) {
          toast('单次奶量请填写 0–500 ml 之间', { icon: 'info' });
          return;
        }

        const payload = {
          kind,
          time: feedTime,
          amountMl: kind === 'breast' ? 0 : amount,
          minutes: kind === 'breast' ? minutes : 0,
          side: kind === 'breast' ? side : 'both',
          note: noteValue,
        };
        if (existing) store.updateFeed(key, existing.id, payload);
        else store.addFeed(key, payload);

        close();
        haptic();
        toast(
          existing
            ? '喂奶记录已更新'
            : '已记录 ' + feedKindLabel(kind) + (kind === 'breast' ? ' ' + minutes + ' 分钟' : ' ' + amount + ' ml')
        );
      });

      const deleteButton = $('[data-delete]', root);
      if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
          close();
          const ok = await confirmDialog({
            title: '删除喂奶记录？',
            message: '这条记录删除后无法恢复，当天的汇总也会随之更新。',
            confirmText: '删除',
            danger: true,
            iconName: 'trash',
          });
          if (ok) {
            store.removeFeed(key, existing.id);
            toast('已删除喂奶记录');
          }
        });
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* 尿布                                                                 */
/* ------------------------------------------------------------------ */

function openDiaperSheet(id = null) {
  const key = state.date;
  const day = store.getDay(key);
  const existing = id ? day.diapers.find((item) => item.id === id) : null;
  const initialType = existing ? existing.type : 'pee';
  const time = existing ? existing.time : store.nowHM();
  const initialColor = existing ? existing.color : '';
  const initialAmount = existing ? existing.amount : '';

  const body =
    '<div class="field">' +
      '<span class="field-label">尿布类型</span>' +
      '<div class="segmented seg-diaper">' +
        store.DIAPER_TYPES.map(
          (item) => '<button type="button" class="seg-btn' + (item.key === initialType ? ' is-active' : '') + '" data-type="' + item.key + '">' + item.label + '</button>'
        ).join('') +
      '</div>' +
    '</div>' +
    '<label class="field"><span class="field-label">时间</span><input class="input" type="time" name="time" value="' + time + '"></label>' +
    '<div class="field" data-color-field>' +
      '<span class="field-label">大便颜色</span>' +
      chipRow('color', store.DIAPER_COLORS, initialColor) +
    '</div>' +
    '<div class="field">' +
      '<span class="field-label">量</span>' +
      chipRow('amount', store.DIAPER_AMOUNTS, initialAmount) +
    '</div>' +
    '<label class="field"><span class="field-label">备注（可选）</span><input class="input" type="text" name="note" maxlength="60" value="' + esc(existing ? existing.note : '') + '" placeholder="例如：有点稀、有奶瓣"></label>' +
    (existing ? '<button type="button" class="btn btn-ghost btn-block danger-text" data-delete>删除这条记录</button>' : '');

  openSheet({
    title: existing ? '编辑尿布记录' : '记录尿布',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>' + (existing ? '保存修改' : '保存记录') + '</button>',
    onMount({ root, close }) {
      function applyType(type) {
        $('[data-color-field]', root).classList.toggle('is-hidden', type === 'pee');
      }
      applyType(initialType);
      bindChipRow(root, '.chip-row[data-group="color"]');
      bindChipRow(root, '.chip-row[data-group="amount"]');

      $$('.seg-diaper [data-type]', root).forEach((button) => {
        button.addEventListener('click', () => {
          $$('.seg-diaper .seg-btn', root).forEach((item) => item.classList.remove('is-active'));
          button.classList.add('is-active');
          applyType(button.getAttribute('data-type'));
        });
      });

      $('[data-save]', root).addEventListener('click', () => {
        const activeType = $('.seg-diaper .seg-btn.is-active', root);
        const type = activeType ? activeType.getAttribute('data-type') : 'pee';
        const diaperTime = $('[name="time"]', root).value || store.nowHM();
        const colorButton = $('[data-color-field] .chip.is-on', root);
        const amountButton = $('.chip-row[data-group="amount"] .chip.is-on', root);
        const payload = {
          type,
          time: diaperTime,
          color: type === 'pee' ? '' : colorButton ? colorButton.getAttribute('data-value') : '',
          amount: amountButton ? amountButton.getAttribute('data-value') : '',
          note: $('[name="note"]', root).value.trim(),
        };
        if (existing) store.updateDiaper(key, existing.id, payload);
        else store.addDiaper(key, payload);
        close();
        haptic();
        toast(existing ? '尿布记录已更新' : '已记录尿布 · ' + diaperTypeLabel(type));
      });

      const deleteButton = $('[data-delete]', root);
      if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
          close();
          const ok = await confirmDialog({
            title: '删除尿布记录？',
            message: '这条记录删除后无法恢复。',
            confirmText: '删除',
            danger: true,
            iconName: 'trash',
          });
          if (ok) {
            store.removeDiaper(key, existing.id);
            toast('已删除尿布记录');
          }
        });
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* 睡眠                                                                 */
/* ------------------------------------------------------------------ */

function openSleepSheet(id = null) {
  const key = state.date;
  const day = store.getDay(key);
  const existing = id ? day.sleeps.find((item) => item.id === id) : null;
  const start = existing ? existing.start : '20:00';
  const end = existing ? existing.end : '06:00';
  const direction = existing ? existing.direction : 'back';

  const body =
    '<div class="field-grid">' +
      '<label class="field"><span class="field-label">入睡时间</span><input class="input" type="time" name="start" value="' + start + '"></label>' +
      '<label class="field"><span class="field-label">醒来时间</span><input class="input" type="time" name="end" value="' + end + '"></label>' +
    '</div>' +
    '<div class="sleep-preview"><span>睡眠时长</span><strong data-duration>—</strong><small>跨零点会自动按第二天计算</small></div>' +
    '<div class="field">' +
      '<span class="field-label">睡姿</span>' +
      chipRow('direction', store.SLEEP_DIRECTIONS, direction) +
    '</div>' +
    '<label class="field"><span class="field-label">备注（可选）</span><input class="input" type="text" name="note" maxlength="60" value="' + esc(existing ? existing.note : '') + '" placeholder="例如：落地醒、抱睡"></label>' +
    (existing ? '<button type="button" class="btn btn-ghost btn-block danger-text" data-delete>删除这条记录</button>' : '');

  openSheet({
    title: existing ? '编辑睡眠记录' : '记录睡眠',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>' + (existing ? '保存修改' : '保存记录') + '</button>',
    onMount({ root, close }) {
      bindChipRow(root, '.chip-row[data-group="direction"]');
      const startInput = $('[name="start"]', root);
      const endInput = $('[name="end"]', root);
      const durationEl = $('[data-duration]', root);

      function updateDuration() {
        const minutes = store.sleepMinutes(startInput.value, endInput.value);
        durationEl.textContent = minutes > 0 ? store.formatMinutes(minutes) : '时间有误';
      }
      startInput.addEventListener('input', updateDuration);
      endInput.addEventListener('input', updateDuration);
      updateDuration();

      $('[data-save]', root).addEventListener('click', () => {
        const minutes = store.sleepMinutes(startInput.value, endInput.value);
        if (!startInput.value || !endInput.value || minutes <= 0) {
          toast('请检查入睡和醒来时间', { icon: 'info' });
          return;
        }
        const directionButton = $('.chip-row[data-group="direction"] .chip.is-on', root);
        const payload = {
          start: startInput.value,
          end: endInput.value,
          direction: directionButton ? directionButton.getAttribute('data-value') : 'back',
          note: $('[name="note"]', root).value.trim(),
        };
        if (existing) store.updateSleep(key, existing.id, payload);
        else store.addSleep(key, payload);
        close();
        haptic();
        toast(existing ? '睡眠记录已更新' : '已记录睡眠 · ' + store.formatMinutes(minutes));
      });

      const deleteButton = $('[data-delete]', root);
      if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
          close();
          const ok = await confirmDialog({
            title: '删除睡眠记录？',
            message: '这条记录删除后无法恢复。',
            confirmText: '删除',
            danger: true,
            iconName: 'trash',
          });
          if (ok) {
            store.removeSleep(key, existing.id);
            toast('已删除睡眠记录');
          }
        });
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* 补剂 & 护理 & 早教                                                    */
/* ------------------------------------------------------------------ */

function openSupplementSheet() {
  const key = state.date;
  const day = store.getDay(key);

  const rows = store.SUPPLEMENTS.map((item) => {
    const entry = day.supplements[item.key];
    return toggleRow('supplement', item.key, item.label, item.hint, Boolean(entry), entry ? entry.time : '');
  }).join('');

  const body =
    '<p class="sheet-lead">轻点打卡，记录会立即保存在本机。</p>' +
    '<div class="toggle-list">' + rows + '</div>' +
    '<div class="toggle-summary"><span>今日已补</span><strong data-supplement-count>' + countDone(day.supplements, store.SUPPLEMENTS) + ' / ' + store.SUPPLEMENTS.length + '</strong></div>' +
    '<p class="sheet-tip">补剂与药物请遵医嘱，记录仅作家庭备忘。</p>';

  openSheet({
    title: '补剂 & 药物',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-close>完成</button>',
    onMount({ root, close }) {
      $('[data-close]', root).addEventListener('click', close);
      $$('[data-supplement]', root).forEach((button) => {
        button.addEventListener('click', () => {
          const itemKey = button.getAttribute('data-supplement');
          const wasOn = button.getAttribute('aria-checked') === 'true';
          store.setSupplement(key, itemKey, !wasOn);
          button.setAttribute('aria-checked', wasOn ? 'false' : 'true');
          button.classList.toggle('is-on', !wasOn);
          const entry = store.getDay(key).supplements[itemKey];
          const hint = store.SUPPLEMENTS.find((item) => item.key === itemKey);
          const small = $('small', button);
          if (small) small.textContent = wasOn ? (hint ? hint.hint : '') : (hint ? hint.hint : '') + (entry && entry.time ? ' · ' + entry.time : '');
          const countEl = $('[data-supplement-count]', root);
          if (countEl) countEl.textContent = countDone(store.getDay(key).supplements, store.SUPPLEMENTS) + ' / ' + store.SUPPLEMENTS.length;
          haptic();
        });
      });
    },
  });
}

function toggleRow(group, itemKey, label, hint, done, time) {
  return (
    '<button type="button" class="toggle-row' + (done ? ' is-on' : '') + '" role="switch" aria-checked="' + (done ? 'true' : 'false') + '" data-' + group + '="' + itemKey + '">' +
      '<span class="toggle-main"><strong>' + esc(label) + '</strong><small>' + esc(hint) + (time ? ' · ' + time : '') + '</small></span>' +
      '<span class="switch" aria-hidden="true"><i></i></span>' +
    '</button>'
  );
}

function countDone(map, defs) {
  return defs.filter((item) => map[item.key]).length;
}

function openCareSheet() {
  const key = state.date;
  const day = store.getDay(key);

  const rows = store.CARES.map((item) => {
    const entry = day.cares[item.key];
    return toggleRow('care', item.key, item.label, '今日护理', Boolean(entry), entry ? entry.time : '');
  }).join('');

  const body =
    '<p class="sheet-lead">点一下完成打卡，疫苗与不良反应可以稍后补充。</p>' +
    '<div class="toggle-list">' + rows + '</div>' +
    '<div class="toggle-summary"><span>今日已完成</span><strong data-care-count>' + countDone(day.cares, store.CARES) + ' / ' + store.CARES.length + '</strong></div>' +
    '<div class="field"><span class="field-label">疫苗</span><input class="input" type="text" name="vaccine" maxlength="100" value="' + esc(day.vaccine) + '" placeholder="例如：乙肝疫苗第 2 针"></div>' +
    '<div class="field"><span class="field-label">不良反应</span><input class="input" type="text" name="adverse" maxlength="100" value="' + esc(day.adverse) + '" placeholder="例如：无、轻微发热"></div>';

  openSheet({
    title: '护理记录',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>保存护理记录</button>',
    onMount({ root, close }) {
      $$('[data-care]', root).forEach((button) => {
        button.addEventListener('click', () => {
          const itemKey = button.getAttribute('data-care');
          const wasOn = button.getAttribute('aria-checked') === 'true';
          store.setCare(key, itemKey, !wasOn);
          button.setAttribute('aria-checked', wasOn ? 'false' : 'true');
          button.classList.toggle('is-on', !wasOn);
          const countEl = $('[data-care-count]', root);
          if (countEl) countEl.textContent = countDone(store.getDay(key).cares, store.CARES) + ' / ' + store.CARES.length;
          haptic();
        });
      });

      $('[data-save]', root).addEventListener('click', () => {
        store.updateDay(key, {
          vaccine: $('[name="vaccine"]', root).value.trim(),
          adverse: $('[name="adverse"]', root).value.trim(),
        });
        close();
        toast('护理记录已保存');
      });
    },
  });
}

function openEarlySheet() {
  const key = state.date;
  const day = store.getDay(key);

  const rows = store.EARLY_EDU.map((item) => {
    const entry = day.early[item.key];
    const done = Boolean(entry);
    return (
      '<div class="early-row' + (done ? ' is-open' : '') + '" data-early="' + item.key + '">' +
        '<div class="early-head">' +
          '<span class="early-title"><strong>' + item.label + '</strong><small>' + item.hint + '</small></span>' +
          '<button type="button" class="switch-button' + (done ? ' is-on' : '') + '" role="switch" aria-checked="' + (done ? 'true' : 'false') + '" data-toggle aria-label="' + item.label + '">' +
            '<span class="switch" aria-hidden="true"><i></i></span>' +
          '</button>' +
        '</div>' +
        '<div class="early-fields">' +
          '<label class="field"><span class="field-label">时长</span><span class="input-unit"><input class="input num" type="number" inputmode="numeric" min="0" step="5" name="minutes" value="' + (entry ? entry.minutes : '') + '"><em>分钟</em></span></label>' +
          '<label class="field"><span class="field-label">项目</span><input class="input" type="text" name="item" maxlength="40" value="' + esc(entry ? entry.item : '') + '" placeholder="例如：黑白卡、追视"></label>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  openSheet({
    title: '早教 / 锻炼',
    subtitle: dateSubtitle(key),
    body: '<p class="sheet-lead">记录今天做了哪些小练习，不追求时长。</p><div class="early-list">' + rows + '</div>',
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>保存早教记录</button>',
    onMount({ root, close }) {
      $$('.early-row', root).forEach((row) => {
        const toggle = $('[data-toggle]', row);
        toggle.addEventListener('click', () => {
          const on = toggle.getAttribute('aria-checked') === 'true';
          toggle.setAttribute('aria-checked', on ? 'false' : 'true');
          toggle.classList.toggle('is-on', !on);
          row.classList.toggle('is-open', !on);
          haptic();
        });
      });

      $('[data-save]', root).addEventListener('click', () => {
        store.EARLY_EDU.forEach((item) => {
          const row = $('[data-early="' + item.key + '"]', root);
          const toggle = $('[data-toggle]', row);
          const done = toggle.getAttribute('aria-checked') === 'true';
          const minutes = Number($('[name="minutes"]', row).value) || 0;
          const itemText = $('[name="item"]', row).value.trim();
          if (done) store.setEarly(key, item.key, { done: true, minutes, item: itemText });
          else if (store.getDay(key).early[item.key]) store.setEarly(key, item.key, { done: false });
        });
        close();
        toast('早教记录已保存');
      });
    },
  });
}


/* ------------------------------------------------------------------ */
/* 今日状态 / 心得                                                       */
/* ------------------------------------------------------------------ */

function openStatusSheet() {
  const key = state.date;
  const day = store.getDay(key);

  const body =
    '<div class="field"><span class="field-label">天气</span>' + chipRow('weather', store.WEATHER_OPTIONS, day.weather) + '</div>' +
    '<div class="field"><span class="field-label">精神状态</span>' + chipRow('mood', store.MOOD_OPTIONS, day.mood) + '</div>' +
    '<label class="field"><span class="field-label">体温（℃）</span><input class="input" type="number" inputmode="decimal" step="0.1" min="30" max="45" name="temperature" value="' + esc(day.temperature) + '" placeholder="例如：36.5"></label>' +
    '<p class="sheet-tip">体温仅作家庭记录，如宝宝不适请及时就医。</p>';

  openSheet({
    title: '今日状态',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>保存</button>',
    onMount({ root, close }) {
      bindChipRow(root, '.chip-row[data-group="weather"]');
      bindChipRow(root, '.chip-row[data-group="mood"]');
      $('[data-save]', root).addEventListener('click', () => {
        const weatherButton = $('.chip-row[data-group="weather"] .chip.is-on', root);
        const moodButton = $('.chip-row[data-group="mood"] .chip.is-on', root);
        const temperature = $('[name="temperature"]', root).value.trim();
        if (temperature) {
          const tempValue = Number(temperature);
          if (!Number.isFinite(tempValue) || tempValue < 30 || tempValue > 45) {
            toast('体温请填写 30–45℃ 之间的数值', { icon: 'info' });
            return;
          }
        }
        store.updateDay(key, {
          weather: weatherButton ? weatherButton.getAttribute('data-value') : '',
          mood: moodButton ? moodButton.getAttribute('data-value') : '',
          temperature: temperature ? temperature : '',
        });
        close();
        toast('今日状态已保存');
      });
    },
  });
}

function openNoteSheet() {
  const key = state.date;
  const day = store.getDay(key);
  const body =
    '<label class="field"><span class="field-label">写下今天想记住的瞬间</span><textarea class="textarea" name="note" rows="6" maxlength="1000" placeholder="例如：今天第一次会翻身，笑得特别开心。">' + esc(day.note) + '</textarea></label>' +
    '<p class="sheet-tip">记录会随当天保存在本机。</p>';

  openSheet({
    title: '今日心得',
    subtitle: dateSubtitle(key),
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>保存心得</button>',
    onMount({ root, close }) {
      $('[data-save]', root).addEventListener('click', () => {
        store.updateDay(key, { note: $('[name="note"]', root).value });
        close();
        toast('今日心得已保存');
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 档案 / 日期选择                                                       */
/* ------------------------------------------------------------------ */

function openProfileSheet() {
  const profile = store.getProfile();
  const gender = profile.gender || '';
  const body =
    '<label class="field"><span class="field-label">宝宝小名</span><input class="input" type="text" name="name" maxlength="20" value="' + esc(profile.name) + '" placeholder="例如：小满"></label>' +
    '<label class="field"><span class="field-label">出生日期</span><input class="input" type="date" name="birthday" value="' + esc(profile.birthday) + '" max="' + store.todayKey() + '"></label>' +
    '<div class="field"><span class="field-label">性别</span>' +
      chipRow('gender', [{ key: 'girl', label: '女宝' }, { key: 'boy', label: '男宝' }], gender) +
    '</div>' +
    '<div class="field-grid">' +
      '<label class="field"><span class="field-label">出生体重</span><span class="input-unit"><input class="input" type="text" name="birthWeight" maxlength="12" value="' + esc(profile.birthWeight) + '" placeholder="3.2"><em>kg</em></span></label>' +
      '<label class="field"><span class="field-label">出生身高</span><span class="input-unit"><input class="input" type="text" name="birthHeight" maxlength="12" value="' + esc(profile.birthHeight) + '" placeholder="50"><em>cm</em></span></label>' +
    '</div>' +
    '<p class="sheet-tip">生日只用于计算出生天数，不会上传。</p>';

  openSheet({
    title: '宝宝档案',
    subtitle: '让记录更有温度',
    body,
    footer: '<button type="button" class="btn btn-primary btn-block" data-save>保存档案</button>',
    onMount({ root, close }) {
      bindChipRow(root, '.chip-row[data-group="gender"]');
      $('[data-save]', root).addEventListener('click', () => {
        const birthday = $('[name="birthday"]', root).value;
        if (birthday && birthday > store.todayKey()) {
          toast('出生日期不能晚于今天', { icon: 'info' });
          return;
        }
        const genderButton = $('.chip-row[data-group="gender"] .chip.is-on', root);
        store.updateProfile({
          name: $('[name="name"]', root).value.trim(),
          birthday,
          gender: genderButton ? genderButton.getAttribute('data-value') : '',
          birthWeight: $('[name="birthWeight"]', root).value.trim(),
          birthHeight: $('[name="birthHeight"]', root).value.trim(),
        });
        close();
        haptic();
        toast('宝宝档案已保存');
      });
    },
  });
}

function pickDate(current, onPick, max = store.todayKey()) {
  const today = store.todayKey();
  const yesterday = store.addDays(today, -1);
  const initial = current && current <= max ? current : max;

  openSheet({
    title: '选择日期',
    subtitle: '可以查看或补录过去的日子',
    body:
      '<label class="field"><span class="field-label">日期</span><input class="input" type="date" name="date" value="' + initial + '" max="' + max + '"></label>' +
      '<div class="chip-row">' +
        '<button type="button" class="chip' + (initial === today ? ' is-on' : '') + '" data-jump="' + today + '">今天</button>' +
        '<button type="button" class="chip' + (initial === yesterday ? ' is-on' : '') + '" data-jump="' + yesterday + '">昨天</button>' +
      '</div>' +
      '<p class="sheet-tip">只能查看和补录今天及以前的日子。</p>',
    footer: '<button type="button" class="btn btn-primary btn-block" data-ok>查看这一天</button>',
    onMount({ root, close }) {
      const input = $('[name="date"]', root);
      $$('[data-jump]', root).forEach((button) => {
        button.addEventListener('click', () => {
          input.value = button.getAttribute('data-jump');
          $$('[data-jump]', root).forEach((item) => item.classList.toggle('is-on', item === button));
        });
      });
      $('[data-ok]', root).addEventListener('click', () => {
        const value = input.value;
        if (!value) {
          toast('请选择日期', { icon: 'info' });
          return;
        }
        if (value > max) {
          toast('不能查看未来的日期', { icon: 'info' });
          return;
        }
        close();
        onPick(value);
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 备份 / 导入 / 清空                                                    */
/* ------------------------------------------------------------------ */

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportBackup() {
  downloadTextFile(store.exportData(), store.exportFileName());
  store.updateSettings({ lastBackupAt: store.todayKey() });
  toast('备份已导出，请保存到「文件」App', { icon: 'download' });
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.className = 'native-picker';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      toast('读取文件失败，请重试', { icon: 'info' });
      return;
    }
    openImportSheet(text, file.name);
  });
  input.click();
}

function openImportSheet(text, fileName) {
  let preview = null;
  try {
    preview = JSON.parse(text);
  } catch (err) {
    toast('文件不是有效的数据备份', { icon: 'info' });
    return;
  }
  const dayKeys = preview && preview.days && typeof preview.days === 'object' ? Object.keys(preview.days) : [];
  if (!dayKeys.length) {
    toast('备份文件里没有记录数据', { icon: 'info' });
    return;
  }
  const exportedAt = preview.exportedAt ? String(preview.exportedAt).slice(0, 10).replace(/-/g, '.') : '未知日期';
  const name = (preview.profile && preview.profile.name) || '宝宝';

  const body =
    '<div class="import-summary card">' +
      '<div class="import-file">' + icon('file', 22) + '<div><strong>' + esc(fileName) + '</strong><span>' + dayKeys.length + ' 天记录 · 导出 ' + exportedAt + '</span></div></div>' +
      '<p>备份中的宝宝：' + esc(name) + '</p>' +
    '</div>' +
    (sync.getStatus().enabled ? '<div class="notice warning">' + icon('users', 16) + '<span>家庭共享已开启：导入会按天合并并同步给家人，不会清空家庭空间里的其他记录。</span></div>' : '') +
    '<div class="import-option"><strong>合并导入</strong><p>保留本机与备份中较新的记录，适合多台手机一起记录。</p><button type="button" class="btn btn-soft btn-block" data-mode="merge">合并导入</button></div>' +
    '<div class="import-option"><strong>覆盖导入</strong><p>用备份替换本机全部记录与档案，适合换手机恢复。</p><button type="button" class="btn btn-ghost btn-block danger-text" data-mode="replace">覆盖导入</button></div>';

  openSheet({
    title: '导入备份',
    subtitle: '请选择恢复方式',
    body,
    onMount({ root, close }) {
      $$('[data-mode]', root).forEach((button) => {
        button.addEventListener('click', async () => {
          const mode = button.getAttribute('data-mode');
          if (mode === 'replace') {
            const ok = await confirmDialog({
              title: '覆盖本机数据？',
              message: '本机现有的全部记录会被备份文件替换，且无法恢复。建议先导出当前数据。',
              confirmText: '确认覆盖',
              danger: true,
              iconName: 'restore',
            });
            if (!ok) return;
          }
          const result = store.importData(text, { mode });
          if (!result.ok) {
            toast(result.error || '导入失败', { icon: 'info' });
            return;
          }
          close();
          toast('已导入 ' + result.importedDays + ' 天记录');
          if (mode === 'replace' && preview.profile) {
            activateTab('today');
          } else {
            renderSettings();
          }
        });
      });
    },
  });
}

async function resetEverything() {
  const syncEnabled = sync.getStatus().enabled;
  const ok = await confirmDialog({
    title: '清空所有记录？',
    message: syncEnabled
      ? '家庭共享已开启：这会同时清空所有家人手机上的记录，且无法恢复。建议先导出备份。'
      : '将删除本机全部喂养、尿布、睡眠、补剂与护理记录，宝宝档案会保留。此操作无法恢复，建议先导出备份。',
    confirmText: '确认清空',
    danger: true,
    iconName: 'trash',
  });
  if (!ok) return;
  store.resetAll();
  toast('已清空，重新开始记录');
  activateTab('today');
}

/* ------------------------------------------------------------------ */
/* 安装 / 关于                                                          */
/* ------------------------------------------------------------------ */

function openInstallSheet() {
  const standalone = isStandalone();
  const isSecure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  const address = location.origin + location.pathname;

  const body =
    '<div class="install-status card ' + (standalone ? 'is-ok' : '') + '">' +
      '<div class="install-badge">' + icon(standalone ? 'check' : 'download', 24) + '</div>' +
      '<div><strong>' + (standalone ? '已安装到主屏幕' : '还没有添加到主屏幕') + '</strong><p>' + (standalone ? '从主屏幕图标打开即可，数据仍保存在这台手机。' : '添加到主屏幕后，像 App 一样全屏打开。') + '</p></div>' +
    '</div>' +
    '<ol class="steps">' +
      '<li><span>1</span><div><strong>用 Safari 打开</strong><p>确保是在 Safari 中，而不是微信内置浏览器。</p></div></li>' +
      '<li><span>2</span><div><strong>点底部「分享」</strong><p>就是方框向上箭头的按钮。</p></div></li>' +
      '<li><span>3</span><div><strong>选择「添加到主屏幕」</strong><p>再点右上角「添加」，图标就会出现在桌面。</p></div></li>' +
    '</ol>' +
    (isSecure ? '' : '<div class="notice warning">' + icon('info', 16) + '<span>当前是局域网 HTTP 地址：可以添加到主屏幕，但完全离线打开需要部署到 HTTPS（详见 README）。</span></div>') +
    '<div class="address-box"><span>当前地址</span><code>' + esc(address) + '</code></div>' +
    '<button type="button" class="btn btn-soft btn-block" data-copy>' + icon('share', 17) + ' 复制地址发给家人</button>' +
    '<p class="sheet-tip">' + (sync.getStatus().enabled ? '家人安装后输入同一个房间码，就能共同记录同一份数据。' : '家人也可以各自安装，数据分别保存在各自的手机上；开启家庭共享后可实时共用。') + '</p>';

  openSheet({
    title: '安装到主屏幕',
    body,
    onMount({ root }) {
      const copyButton = $('[data-copy]', root);
      if (copyButton) {
        copyButton.addEventListener('click', async () => {
          const ok = await copyText(address);
          toast(ok ? '地址已复制' : '复制失败，请长按地址手动复制', { icon: ok ? 'check' : 'info' });
        });
      }
    },
  });
}

function openAboutSheet() {
  const syncStatus = sync.getStatus();
  const privacyText = syncStatus.enabled
    ? '记录默认保存在本机，并会同步到你们自己的家庭服务器（由家人运行，不经过第三方云服务），方便多台手机共同记录；没有第三方统计或广告。清理浏览器数据或换手机前，请先导出备份。'
    : '所有记录只保存在这台手机的浏览器本地存储中，不会上传到服务器，也没有任何第三方统计或广告。你可以在「我的 → 家庭共享」里开启家人共享。清理浏览器数据、清理缓存或更换手机前，请先导出备份。';
  const body =
    '<div class="about-hero">' +
      '<div class="avatar-xl">' + icon('baby', 32) + '</div>' +
      '<h3>宝宝成长记</h3>' +
      '<p>版本 v' + APP_VERSION + '</p>' +
    '</div>' +
    '<div class="about-block"><h4>' + icon('shield', 17) + ' 隐私说明</h4><p>' + privacyText + '</p></div>' +
    '<div class="about-block"><h4>' + icon('heart', 17) + ' 关于记录</h4><p>这里的数据是家人照顾宝宝的备忘，不构成任何医疗建议。宝宝出现发热、精神差、喂养困难等情况，请及时咨询医生。</p></div>' +
    '<div class="about-block"><h4>' + icon('sparkle', 17) + ' 给家人</h4><p>可以把自己生成的周报、月报图片发到家庭群，让不在身边的家人也看见宝宝每天的小小变化。</p></div>' +
    '<p class="about-sign">愿每一次记录，都成为日后珍贵的回忆。</p>';

  openSheet({ title: '关于与隐私', body });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (secondErr) {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 首次引导                                                             */
/* ------------------------------------------------------------------ */

function maybeOnboarding() {
  const settings = store.getSettings() || {};
  if (settings.onboarded) return;
  const profile = store.getProfile();
  if (store.getRecordedDays().length > 0 || profile.name) {
    store.updateSettings({ onboarded: true });
    return;
  }

  const body =
    '<div class="welcome-hero">' +
      '<div class="avatar-xl">' + icon('baby', 34) + '</div>' +
      '<p>把每天的喂养、护理和小小进步记下来，慢慢长成一份属于宝宝的成长档案。</p>' +
    '</div>' +
    '<label class="field"><span class="field-label">宝宝小名（可稍后填写）</span><input class="input" type="text" name="name" maxlength="20" placeholder="例如：小满" autofocus></label>' +
    '<label class="field"><span class="field-label">出生日期（用于计算出生天数）</span><input class="input" type="date" name="birthday" max="' + store.todayKey() + '"></label>' +
    '<div class="field"><span class="field-label">宝宝性别</span>' +
      chipRow('gender', [{ key: 'girl', label: '女宝' }, { key: 'boy', label: '男宝' }], '') +
    '</div>' +
    '<div class="notice">' + icon('shield', 16) + '<span>默认只保存在这台手机；需要家人一起记录时，可在「我的」里开启家庭共享。</span></div>';

  openSheet({
    title: '欢迎来到宝宝成长记',
    subtitle: '先认识一下宝宝，大概 30 秒',
    body,
    footer:
      '<button type="button" class="btn btn-primary btn-block" data-start>开始记录</button>' +
      '<button type="button" class="btn btn-text btn-block" data-skip>稍后设置</button>' +
      '<button type="button" class="btn btn-text btn-block" data-join-family>已有家庭空间？加入家人共享</button>',
    dismissible: false,
    onMount({ root, close }) {
      bindChipRow(root, '.chip-row[data-group="gender"]');
      $('[data-start]', root).addEventListener('click', () => {
        const birthday = $('[name="birthday"]', root).value;
        if (birthday && birthday > store.todayKey()) {
          toast('出生日期不能晚于今天', { icon: 'info' });
          return;
        }
        const genderButton = $('.chip-row[data-group="gender"] .chip.is-on', root);
        store.updateProfile({
          name: $('[name="name"]', root).value.trim(),
          birthday,
          gender: genderButton ? genderButton.getAttribute('data-value') : '',
        });
        store.updateSettings({ onboarded: true });
        close();
        toast('欢迎，开始记录宝宝的每一天');
      });
      $('[data-skip]', root).addEventListener('click', () => {
        store.updateSettings({ onboarded: true });
        close();
        toast('可以随时在「我的」里补充宝宝档案');
      });
      $('[data-join-family]', root).addEventListener('click', () => {
        store.updateSettings({ onboarded: true });
        close();
        setTimeout(() => openFamilySheet(), 280);
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Service Worker                                                       */
/* ------------------------------------------------------------------ */

function requestPersistentStorage() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  } catch (err) {
    /* 不支持时忽略 */
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => console.info('[pwa] Service Worker 已注册', registration.scope))
      .catch((err) => console.warn('[pwa] Service Worker 注册失败（不影响使用）', err));
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                 */
/* ------------------------------------------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
