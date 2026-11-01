/**
 * 宝宝成长记 · 本地数据层（无任何外部依赖）
 * 数据保存在 localStorage，键名 babyjournal.v1
 * 所有日期均为本地时区，dateKey 格式 YYYY-MM-DD
 */

import { applyOp as applySyncOp } from './sync-ops.js';

const STORAGE_KEY = 'babyjournal.v1';
const DATA_VERSION = 1;

export const SUPPLEMENTS = [
  { key: 'ad', label: 'AD', hint: '维生素AD' },
  { key: 'd3', label: 'D3', hint: '维生素D3' },
  { key: 'dha', label: 'DHA', hint: 'DHA' },
  { key: 'iron', label: '铁', hint: '补铁' },
  { key: 'water', label: '水', hint: '喝水' },
  { key: 'probiotic', label: '益生菌', hint: '益生菌' },
  { key: 'lactase', label: '乳糖酶', hint: '乳糖酶' },
];

export const CARES = [
  { key: 'face', label: '洗脸' },
  { key: 'mouth', label: '口/鼻清洁' },
  { key: 'hands', label: '洗手' },
  { key: 'nails', label: '剪指甲' },
  { key: 'bath', label: '洗澡' },
  { key: 'lotion', label: '保湿' },
];

export const EARLY_EDU = [
  { key: 'visual', label: '视觉训练', hint: '黑白卡、追视' },
  { key: 'hearing', label: '听觉训练', hint: '摇铃、儿歌' },
  { key: 'gross', label: '大动作训练', hint: '抬头、翻身' },
  { key: 'fine', label: '精细动作', hint: '抓握、触摸' },
];

export const WEATHER_OPTIONS = ['晴', '多云', '阴', '雨', '雪'];
export const MOOD_OPTIONS = ['开心', '平静', '困倦', '闹腾'];
export const FEED_KINDS = [
  { key: 'breast', label: '母乳亲喂' },
  { key: 'bottle', label: '瓶喂母乳' },
  { key: 'formula', label: '配方奶' },
];
export const FEED_SIDES = [
  { key: 'left', label: '左侧' },
  { key: 'right', label: '右侧' },
  { key: 'both', label: '双侧' },
];
export const DIAPER_TYPES = [
  { key: 'pee', label: '尿' },
  { key: 'poop', label: '便' },
  { key: 'mixed', label: '尿+便' },
];
export const DIAPER_COLORS = ['黄', '绿', '棕', '黑', '红'];
export const DIAPER_AMOUNTS = ['少', '中', '多'];
export const SLEEP_DIRECTIONS = [
  { key: 'back', label: '仰卧' },
  { key: 'side', label: '侧卧' },
  { key: 'belly', label: '俯卧' },
];

/* ------------------------------------------------------------------ */
/* 工具函数                                                             */
/* ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0');
const str = (v, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function dateKey(date = new Date()) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

export function todayKey() {
  return dateKey(new Date());
}

export function nowHM() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

export function isDateKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function diffDays(a, b) {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function rangeKeys(startKey, endKey) {
  const out = [];
  if (!isDateKey(startKey) || !isDateKey(endKey)) return out;
  let cur = startKey;
  let guard = 0;
  while (cur <= endKey && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function startOfWeek(key = todayKey()) {
  const d = parseDateKey(key);
  const offset = (d.getDay() + 6) % 7; // 周一为一周开始
  d.setDate(d.getDate() - offset);
  return dateKey(d);
}

export function endOfWeek(key = todayKey()) {
  return addDays(startOfWeek(key), 6);
}

export function startOfMonth(key = todayKey()) {
  return key.slice(0, 8) + '01';
}

export function endOfMonth(key = todayKey()) {
  const d = parseDateKey(key);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return dateKey(end);
}

export function startOfQuarter(key = todayKey()) {
  const d = parseDateKey(key);
  const month = Math.floor(d.getMonth() / 3) * 3 + 1;
  return d.getFullYear() + '-' + pad2(month) + '-01';
}

export function endOfQuarter(key = todayKey()) {
  const d = parseDateKey(key);
  const endMonth = Math.floor(d.getMonth() / 3) * 3 + 3; // 3/6/9/12
  const end = new Date(d.getFullYear(), endMonth, 0);
  return dateKey(end);
}

export function formatDateCN(key, withYear = false) {
  const d = parseDateKey(key);
  const base = (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return withYear ? d.getFullYear() + '年' + base : base;
}

export function weekdayCN(key) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseDateKey(key).getDay()];
}

export function monthTitle(key) {
  const d = parseDateKey(key);
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
}

export function relativeDayLabel(key) {
  const today = todayKey();
  if (key === today) return '今天';
  if (key === addDays(today, -1)) return '昨天';
  if (key === addDays(today, 1)) return '明天';
  return formatDateCN(key);
}

/** 出生第几天：出生当天记为第 1 天；生日未知返回 null */
export function ageDaysOn(key, birthday) {
  if (!birthday || !isDateKey(birthday) || !isDateKey(key)) return null;
  const delta = diffDays(birthday, key);
  return delta < 0 ? null : delta + 1;
}

export function ageLabel(birthday, key = todayKey()) {
  const days = ageDaysOn(key, birthday);
  if (days == null) return '';
  if (days < 31) return '出生第 ' + days + ' 天';
  const birth = parseDateKey(birthday);
  const target = parseDateKey(key);
  let months = (target.getFullYear() - birth.getFullYear()) * 12 + target.getMonth() - birth.getMonth();
  if (target.getDate() < birth.getDate()) months -= 1;
  if (months < 0) months = 0;
  const anchor = new Date(birth.getFullYear(), birth.getMonth() + months, birth.getDate());
  const restDays = Math.max(0, Math.round((target - anchor) / 86400000));
  if (months < 12) return months + '个月' + (restDays ? restDays + '天' : '');
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return years + '岁' + (restMonths ? restMonths + '个月' : '');
}

export function minutesFromTime(hm) {
  if (!/^\d{2}:\d{2}$/.test(hm || '')) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** 睡眠时长（分钟）：跨零点自动 +24h；起止相同记 0 */
export function sleepMinutes(start, end) {
  const a = minutesFromTime(start);
  const b = minutesFromTime(end);
  if (a == null || b == null) return 0;
  if (b > a) return b - a;
  if (b < a) return b + 1440 - a;
  return 0;
}

export function formatMinutes(totalMin) {
  const m = Math.max(0, Math.round(num(totalMin)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return h + '小时' + mm + '分';
  if (h) return h + '小时';
  return mm + '分钟';
}

export function formatSleep(totalMin) {
  const m = Math.max(0, Math.round(num(totalMin)));
  return { h: Math.floor(m / 60), m: m % 60, text: formatMinutes(m) };
}

/* ------------------------------------------------------------------ */
/* 数据规范化                                                           */
/* ------------------------------------------------------------------ */

function normalizeFeed(raw) {
  const kind = ['breast', 'bottle', 'formula'].includes(raw && raw.kind) ? raw.kind : 'formula';
  return {
    id: str(raw && raw.id) || uid(),
    time: /^\d{2}:\d{2}$/.test(str(raw && raw.time)) ? str(raw.time) : nowHM(),
    kind,
    side: ['left', 'right', 'both'].includes(raw && raw.side) ? raw.side : 'both',
    minutes: Math.max(0, num(raw && raw.minutes)),
    amountMl: Math.max(0, num(raw && raw.amountMl)),
    note: str(raw && raw.note),
  };
}

function normalizeDiaper(raw) {
  return {
    id: str(raw && raw.id) || uid(),
    time: /^\d{2}:\d{2}$/.test(str(raw && raw.time)) ? str(raw.time) : nowHM(),
    type: ['pee', 'poop', 'mixed'].includes(raw && raw.type) ? raw.type : 'pee',
    color: DIAPER_COLORS.includes(raw && raw.color) ? raw.color : '',
    amount: DIAPER_AMOUNTS.includes(raw && raw.amount) ? raw.amount : '',
    note: str(raw && raw.note),
  };
}

function normalizeSleep(raw) {
  const start = /^\d{2}:\d{2}$/.test(str(raw && raw.start)) ? str(raw.start) : '20:00';
  const end = /^\d{2}:\d{2}$/.test(str(raw && raw.end)) ? str(raw.end) : '06:00';
  return {
    id: str(raw && raw.id) || uid(),
    start,
    end,
    direction: ['back', 'side', 'belly'].includes(raw && raw.direction) ? raw.direction : 'back',
    note: str(raw && raw.note),
  };
}

function normalizeDoneMap(raw, defs) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  defs.forEach((def) => {
    const item = raw[def.key];
    if (item && (item.done === true || item === true)) {
      out[def.key] = {
        done: true,
        time: /^\d{2}:\d{2}$/.test(str(item && item.time)) ? str(item.time) : '',
      };
    }
  });
  return out;
}

function normalizeEarly(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  EARLY_EDU.forEach((def) => {
    const item = raw[def.key];
    if (item && item.done === true) {
      out[def.key] = {
        done: true,
        minutes: Math.max(0, num(item.minutes)),
        item: str(item.item),
      };
    }
  });
  return out;
}

function blankDay() {
  return {
    weather: '',
    mood: '',
    temperature: '',
    feeds: [],
    diapers: [],
    sleeps: [],
    supplements: {},
    cares: {},
    early: {},
    vaccine: '',
    adverse: '',
    note: '',
    updatedAt: 0,
  };
}

function normalizeDay(raw) {
  const d = blankDay();
  if (!raw || typeof raw !== 'object') return d;
  d.weather = WEATHER_OPTIONS.includes(raw.weather) ? raw.weather : '';
  d.mood = MOOD_OPTIONS.includes(raw.mood) ? raw.mood : '';
  d.temperature = str(raw.temperature).slice(0, 8);
  d.feeds = Array.isArray(raw.feeds) ? raw.feeds.map(normalizeFeed).slice(0, 60) : [];
  d.diapers = Array.isArray(raw.diapers) ? raw.diapers.map(normalizeDiaper).slice(0, 60) : [];
  d.sleeps = Array.isArray(raw.sleeps) ? raw.sleeps.map(normalizeSleep).slice(0, 20) : [];
  d.supplements = normalizeDoneMap(raw.supplements, SUPPLEMENTS);
  d.cares = normalizeDoneMap(raw.cares, CARES);
  d.early = normalizeEarly(raw.early);
  d.vaccine = str(raw.vaccine).slice(0, 200);
  d.adverse = str(raw.adverse).slice(0, 200);
  d.note = str(raw.note).slice(0, 2000);
  d.updatedAt = num(raw.updatedAt);
  d.feeds.sort((a, b) => a.time.localeCompare(b.time));
  d.diapers.sort((a, b) => a.time.localeCompare(b.time));
  d.sleeps.sort((a, b) => a.start.localeCompare(b.start));
  return d;
}

function blankProfile() {
  return {
    name: '',
    birthday: '',
    gender: '',
    birthWeight: '',
    birthHeight: '',
    createdAt: Date.now(),
  };
}

function normalizeProfile(raw) {
  const p = blankProfile();
  if (!raw || typeof raw !== 'object') return p;
  p.name = str(raw.name).slice(0, 20);
  p.birthday = isDateKey(raw.birthday) ? raw.birthday : '';
  p.gender = ['girl', 'boy', ''].includes(raw.gender) ? raw.gender : '';
  p.birthWeight = str(raw.birthWeight).slice(0, 12);
  p.birthHeight = str(raw.birthHeight).slice(0, 12);
  p.createdAt = num(raw.createdAt) || Date.now();
  return p;
}

/* ------------------------------------------------------------------ */
/* 状态与持久化                                                          */
/* ------------------------------------------------------------------ */

let state = null;
const listeners = new Set();
let mutationHook = null;

/** 家庭共享模块会注册这个回调，把本地修改转成同步操作 */
export function setMutationHook(fn) {
  mutationHook = typeof fn === 'function' ? fn : null;
}

function emitMutation(op) {
  if (!mutationHook) return;
  try {
    mutationHook(op);
  } catch (err) {
    console.warn('[store] 同步操作回调失败', err);
  }
}

function blankState() {
  return {
    version: DATA_VERSION,
    profile: blankProfile(),
    days: {},
    settings: { onboarded: false, lastBackupAt: '' },
    meta: { createdAt: Date.now(), lastOpenAt: Date.now() },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const parsed = JSON.parse(raw);
    return hydrate(parsed);
  } catch (err) {
    console.warn('[store] 读取本地数据失败，使用空数据', err);
    return blankState();
  }
}

function hydrate(parsed) {
  const base = blankState();
  if (!parsed || typeof parsed !== 'object') return base;
  base.profile = normalizeProfile(parsed.profile);
  if (parsed.days && typeof parsed.days === 'object') {
    Object.keys(parsed.days).forEach((key) => {
      if (isDateKey(key)) base.days[key] = normalizeDay(parsed.days[key]);
    });
  }
  base.settings = {
    onboarded: Boolean(parsed.settings && parsed.settings.onboarded),
    lastBackupAt: isDateKey(parsed.settings && parsed.settings.lastBackupAt) ? parsed.settings.lastBackupAt : '',
  };
  base.meta.createdAt = num(parsed.meta && parsed.meta.createdAt) || Date.now();
  base.meta.lastOpenAt = Date.now();
  return base;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('[store] 保存失败（存储空间不足或隐私模式）', err);
    emit('storage-error');
    return false;
  }
}

function emit(type = 'change') {
  listeners.forEach((fn) => {
    try {
      fn(type, state);
    } catch (err) {
      console.error('[store] 订阅回调出错', err);
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

state = load();

/* ------------------------------------------------------------------ */
/* 读取                                                                 */
/* ------------------------------------------------------------------ */

export function getState() {
  return state;
}

export function getProfile() {
  return state.profile;
}

export function getDay(key = todayKey()) {
  return state.days[key] || blankDay();
}

export function hasDay(key) {
  return Boolean(state.days[key]);
}

export function getRecordedDays() {
  return Object.keys(state.days).sort();
}

export function getSettings() {
  return state.settings || {};
}

/* ------------------------------------------------------------------ */
/* 档案与设置                                                            */
/* ------------------------------------------------------------------ */

export function updateProfile(patch) {
  const p = patch || {};
  state.profile = normalizeProfile({ ...state.profile, ...p });
  persist();
  emit('profile');
  const applied = {};
  ['name', 'birthday', 'gender', 'birthWeight', 'birthHeight'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(p, field)) applied[field] = state.profile[field];
  });
  if (Object.keys(applied).length) emitMutation({ type: 'profile.update', patch: applied });
  return state.profile;
}

export function updateSettings(patch) {
  state.settings = { ...(state.settings || {}), ...(patch || {}) };
  persist();
  emit('settings');
  return state.settings;
}

/* ------------------------------------------------------------------ */
/* 写入：通用包装                                                        */
/* ------------------------------------------------------------------ */

function mutateDay(key, fn) {
  if (!isDateKey(key)) return null;
  const day = state.days[key] || (state.days[key] = blankDay());
  const result = fn(day);
  day.updatedAt = Date.now();
  day.feeds.sort((a, b) => a.time.localeCompare(b.time));
  day.diapers.sort((a, b) => a.time.localeCompare(b.time));
  day.sleeps.sort((a, b) => a.start.localeCompare(b.start));
  if (dayIsBlank(day)) delete state.days[key];
  persist();
  emit('day');
  return result;
}

function dayIsBlank(day) {
  return (
    !day.weather &&
    !day.mood &&
    !day.temperature &&
    !day.vaccine &&
    !day.adverse &&
    !day.note &&
    day.feeds.length === 0 &&
    day.diapers.length === 0 &&
    day.sleeps.length === 0 &&
    Object.keys(day.supplements).length === 0 &&
    Object.keys(day.cares).length === 0 &&
    Object.keys(day.early).length === 0
  );
}

/* 喂奶 */
export function addFeed(key, data) {
  const feed = normalizeFeed(data);
  mutateDay(key, (day) => day.feeds.push(feed));
  emitMutation({ type: 'feed.add', date: key, feed });
  return feed;
}

export function updateFeed(key, id, patch) {
  const updated = mutateDay(key, (day) => {
    const idx = day.feeds.findIndex((f) => f.id === id);
    if (idx < 0) return null;
    day.feeds[idx] = normalizeFeed({ ...day.feeds[idx], ...patch, id });
    return day.feeds[idx];
  });
  if (updated) emitMutation({ type: 'feed.update', date: key, feed: updated });
}

export function removeFeed(key, id) {
  mutateDay(key, (day) => {
    day.feeds = day.feeds.filter((f) => f.id !== id);
  });
  emitMutation({ type: 'feed.remove', date: key, id });
}

/* 尿布 */
export function addDiaper(key, data) {
  const item = normalizeDiaper(data);
  mutateDay(key, (day) => day.diapers.push(item));
  emitMutation({ type: 'diaper.add', date: key, diaper: item });
  return item;
}

export function updateDiaper(key, id, patch) {
  const updated = mutateDay(key, (day) => {
    const idx = day.diapers.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    day.diapers[idx] = normalizeDiaper({ ...day.diapers[idx], ...patch, id });
    return day.diapers[idx];
  });
  if (updated) emitMutation({ type: 'diaper.update', date: key, diaper: updated });
}

export function removeDiaper(key, id) {
  mutateDay(key, (day) => {
    day.diapers = day.diapers.filter((d) => d.id !== id);
  });
  emitMutation({ type: 'diaper.remove', date: key, id });
}

/* 睡眠 */
export function addSleep(key, data) {
  const item = normalizeSleep(data);
  mutateDay(key, (day) => day.sleeps.push(item));
  emitMutation({ type: 'sleep.add', date: key, sleep: item });
  return item;
}

export function updateSleep(key, id, patch) {
  const updated = mutateDay(key, (day) => {
    const idx = day.sleeps.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    day.sleeps[idx] = normalizeSleep({ ...day.sleeps[idx], ...patch, id });
    return day.sleeps[idx];
  });
  if (updated) emitMutation({ type: 'sleep.update', date: key, sleep: updated });
}

export function removeSleep(key, id) {
  mutateDay(key, (day) => {
    day.sleeps = day.sleeps.filter((s) => s.id !== id);
  });
  emitMutation({ type: 'sleep.remove', date: key, id });
}

/* 补剂 / 护理 / 早教 */
export function setSupplement(key, itemKey, done, time) {
  const stamp = time || nowHM();
  mutateDay(key, (day) => {
    if (done) day.supplements[itemKey] = { done: true, time: stamp };
    else delete day.supplements[itemKey];
  });
  emitMutation({ type: 'supplement.set', date: key, key: itemKey, done: Boolean(done), time: stamp });
}

export function setCare(key, itemKey, done, time) {
  const stamp = time || nowHM();
  mutateDay(key, (day) => {
    if (done) day.cares[itemKey] = { done: true, time: stamp };
    else delete day.cares[itemKey];
  });
  emitMutation({ type: 'care.set', date: key, key: itemKey, done: Boolean(done), time: stamp });
}

export function setEarly(key, itemKey, patch) {
  let entry = null;
  mutateDay(key, (day) => {
    const cur = day.early[itemKey] || { done: false, minutes: 0, item: '' };
    const next = { ...cur, ...(patch || {}) };
    if (!next.done) {
      delete day.early[itemKey];
      entry = null;
    } else {
      day.early[itemKey] = { done: true, minutes: Math.max(0, num(next.minutes)), item: str(next.item) };
      entry = day.early[itemKey];
    }
  });
  emitMutation({ type: 'early.set', date: key, key: itemKey, entry });
}

/* 每日状态 / 心得 */
export function updateDay(key, patch) {
  const existed = hasDay(key);
  const p = patch || {};
  mutateDay(key, (day) => {
    if ('weather' in p) day.weather = WEATHER_OPTIONS.includes(p.weather) ? p.weather : '';
    if ('mood' in p) day.mood = MOOD_OPTIONS.includes(p.mood) ? p.mood : '';
    if ('temperature' in p) day.temperature = str(p.temperature).slice(0, 8);
    if ('vaccine' in p) day.vaccine = str(p.vaccine).slice(0, 200);
    if ('adverse' in p) day.adverse = str(p.adverse).slice(0, 200);
    if ('note' in p) day.note = str(p.note).slice(0, 2000);
  });

  if (!hasDay(key)) {
    // 清空所有字段后这一天被自动删除；同步侧也要删除，避免留下空白天
    if (existed) emitMutation({ type: 'day.delete', date: key });
    return;
  }
  const day = state.days[key];
  const applied = {};
  ['weather', 'mood', 'temperature', 'vaccine', 'adverse', 'note'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(p, field)) applied[field] = day[field];
  });
  if (Object.keys(applied).length) emitMutation({ type: 'day.update', date: key, patch: applied });
}

export function deleteDay(key) {
  if (!state.days[key]) return;
  delete state.days[key];
  persist();
  emit('day');
  emitMutation({ type: 'day.delete', date: key });
}

/* ------------------------------------------------------------------ */
/* 日汇总                                                               */
/* ------------------------------------------------------------------ */

export function emptySummary() {
  return {
    formulaMl: 0,
    bottleMl: 0,
    breastMin: 0,
    milkMl: 0,
    feedCount: 0,
    poopCount: 0,
    diaperCount: 0,
    sleepMin: 0,
    supplementDone: 0,
    supplementTotal: SUPPLEMENTS.length,
    careDone: 0,
    careTotal: CARES.length,
    earlyDone: 0,
    earlyMin: 0,
    recordCount: 0,
    hasData: false,
  };
}

export function summarizeDay(key) {
  const s = emptySummary();
  const day = state.days[key];
  if (!day) return s;

  day.feeds.forEach((f) => {
    if (f.kind === 'breast') s.breastMin += f.minutes;
    else if (f.kind === 'bottle') s.bottleMl += f.amountMl;
    else s.formulaMl += f.amountMl;
  });
  s.milkMl = s.formulaMl + s.bottleMl;
  s.feedCount = day.feeds.length;

  day.diapers.forEach((d) => {
    if (d.type === 'poop' || d.type === 'mixed') s.poopCount += 1;
  });
  s.diaperCount = day.diapers.length;

  day.sleeps.forEach((sl) => {
    s.sleepMin += sleepMinutes(sl.start, sl.end);
  });

  s.supplementDone = Object.keys(day.supplements).length;
  s.careDone = Object.keys(day.cares).length;
  s.earlyDone = Object.keys(day.early).length;
  s.earlyMin = Object.values(day.early).reduce((sum, e) => sum + num(e.minutes), 0);
  s.recordCount =
    s.feedCount +
    s.diaperCount +
    day.sleeps.length +
    s.supplementDone +
    s.careDone +
    s.earlyDone +
    (day.note ? 1 : 0) +
    (day.vaccine ? 1 : 0);
  s.hasData = !dayIsBlank(day);
  return s;
}

/* ------------------------------------------------------------------ */
/* 备份 / 导入 / 清空                                                    */
/* ------------------------------------------------------------------ */

export function exportData() {
  return JSON.stringify(
    {
      app: 'baby-journal',
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      settings: state.settings,
      days: state.days,
    },
    null,
    2
  );
}

export function exportFileName() {
  const name = (state.profile.name || '宝宝').replace(/[\\/:*?"<>|]/g, '');
  return '宝宝成长记-' + name + '-备份-' + todayKey() + '.json';
}

/**
 * 导入备份
 * @param {string} text JSON 文本
 * @param {{mode?: 'merge'|'replace'}} options merge: 按 updatedAt 保留较新记录
 */
export function importData(text, options = {}) {
  const mode = options.mode === 'replace' ? 'replace' : 'merge';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: '文件不是有效的数据备份（JSON 解析失败）' };
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.days || typeof parsed.days !== 'object') {
    return { ok: false, error: '备份文件格式不正确，缺少记录数据' };
  }
  const nextDays = mode === 'replace' ? {} : { ...state.days };
  let importedDays = 0;
  let skippedDays = 0;
  Object.keys(parsed.days).forEach((key) => {
    if (!isDateKey(key)) return;
    const incoming = normalizeDay(parsed.days[key]);
    const existing = nextDays[key];
    if (!existing || mode === 'replace' || num(incoming.updatedAt) >= num(existing.updatedAt)) {
      nextDays[key] = incoming;
      importedDays += 1;
    } else {
      skippedDays += 1;
    }
  });
  if (parsed.profile) {
    if (mode === 'replace') {
      state.profile = normalizeProfile(parsed.profile);
    } else {
      const incoming = normalizeProfile(parsed.profile);
      state.profile = normalizeProfile({
        ...state.profile,
        name: state.profile.name || incoming.name,
        birthday: state.profile.birthday || incoming.birthday,
        gender: state.profile.gender || incoming.gender,
        birthWeight: state.profile.birthWeight || incoming.birthWeight,
        birthHeight: state.profile.birthHeight || incoming.birthHeight,
      });
    }
  }
  state.days = nextDays;
  persist();
  emit('import');
  emitMutation({ type: 'state.merge', state: getSyncSnapshot() });
  return { ok: true, importedDays, skippedDays, dayCount: Object.keys(state.days).length };
}

export function resetAll() {
  const profile = state.profile;
  state = blankState();
  state.profile = profile;
  localStorage.removeItem(STORAGE_KEY);
  persist();
  emit('reset');
  emitMutation({ type: 'state.reset' });
}

export function storageInfo() {
  const days = Object.keys(state.days);
  const recordCount = days.reduce((sum, key) => sum + summarizeDay(key).recordCount, 0);
  let bytes = 0;
  try {
    bytes = (localStorage.getItem(STORAGE_KEY) || '').length * 2;
  } catch (err) {
    bytes = 0;
  }
  return {
    dayCount: days.length,
    recordCount,
    bytes,
    firstDay: days[0] || '',
    lastDay: days[days.length - 1] || '',
  };
}

export function reloadFromStorage() {
  state = load();
  emit('reload');
}

/* ------------------------------------------------------------------ */
/* 家庭共享：快照 / 远端操作                                             */
/* ------------------------------------------------------------------ */

/** 给同步客户端使用的本地快照（普通 JSON） */
export function getSyncSnapshot() {
  return JSON.parse(JSON.stringify({ profile: state.profile, days: state.days }));
}

/** 应用来自家庭服务器的远端操作（不会再次触发 mutationHook，避免回环） */
export function applyRemoteOp(op) {
  if (!op) return false;
  const changed = applySyncOp({ profile: state.profile, days: state.days }, op);
  if (!changed) return false;
  persist();
  emit('remote');
  return true;
}

/** 用家庭服务器的完整快照替换本地缓存（服务端为准） */
export function replaceStateFromSync(next) {
  if (!next || typeof next !== 'object') return false;
  const days = {};
  const sourceDays = next.days && typeof next.days === 'object' ? next.days : {};
  Object.keys(sourceDays).forEach((key) => {
    if (!isDateKey(key)) return;
    const day = normalizeDay(sourceDays[key]);
    if (!dayIsBlank(day)) days[key] = day;
  });
  state.days = days;
  if (next.profile) state.profile = normalizeProfile(next.profile);
  persist();
  emit('sync');
  return true;
}