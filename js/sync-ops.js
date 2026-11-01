/**
 * 宝宝成长记 · 家庭共享操作协议（浏览器与 Node 服务器共用）
 *
 * 设计：
 * - 客户端每次本地修改产生一个 op，服务器按到达顺序应用并广播给同一房间的其他设备；
 * - 所有设备按相同顺序 applyOp，状态最终一致；
 * - 初次加入 / 导入 / 服务器空房间时用 mergeStates 按天合并（同一天以 updatedAt 较新者为准）。
 * - 本文件不依赖 localStorage / DOM，服务器与浏览器都可以 import。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const pad2 = (n) => String(n).padStart(2, '0');
const nowHM = () => {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

const str = (v, fallback = '') => (typeof v === 'string' ? v.slice(0, 2000) : fallback);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clone = (v) => JSON.parse(JSON.stringify(v));

export function createBlankDay() {
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

function ensureDay(state, date) {
  if (!state || !state.days || !DATE_RE.test(date || '')) return null;
  let day = state.days[date];
  if (!day || typeof day !== 'object') {
    day = createBlankDay();
    state.days[date] = day;
  }
  if (!Array.isArray(day.feeds)) day.feeds = [];
  if (!Array.isArray(day.diapers)) day.diapers = [];
  if (!Array.isArray(day.sleeps)) day.sleeps = [];
  if (!day.supplements || typeof day.supplements !== 'object') day.supplements = {};
  if (!day.cares || typeof day.cares !== 'object') day.cares = {};
  if (!day.early || typeof day.early !== 'object') day.early = {};
  return day;
}

function markDay(day, ts) {
  day.updatedAt = num(ts, Date.now());
}

function dayIsBlank(day) {
  return (
    day &&
    !day.weather &&
    !day.mood &&
    !day.temperature &&
    !day.vaccine &&
    !day.adverse &&
    !day.note &&
    Array.isArray(day.feeds) &&
    day.feeds.length === 0 &&
    day.diapers.length === 0 &&
    day.sleeps.length === 0 &&
    Object.keys(day.supplements || {}).length === 0 &&
    Object.keys(day.cares || {}).length === 0 &&
    Object.keys(day.early || {}).length === 0
  );
}

function pruneDay(state, date) {
  if (state.days && state.days[date] && dayIsBlank(state.days[date])) delete state.days[date];
}

function recordTime(record, key) {
  return str(record && record[key], '99:99');
}

function upsertRecord(day, field, record, sortKey) {
  if (!record || typeof record !== 'object' || !record.id) return false;
  const list = day[field];
  const index = list.findIndex((item) => item && item.id === record.id);
  if (index >= 0) list[index] = record;
  else list.push(record);
  list.sort((a, b) => recordTime(a, sortKey).localeCompare(recordTime(b, sortKey)));
  return true;
}

function removeRecord(day, field, id) {
  if (!id) return false;
  const list = day[field];
  const next = list.filter((item) => !item || item.id !== id);
  if (next.length === list.length) return false;
  day[field] = next;
  return true;
}

const DAY_TEXT_FIELDS = ['weather', 'mood', 'temperature', 'vaccine', 'adverse', 'note'];
const PROFILE_FIELDS = ['name', 'birthday', 'gender', 'birthWeight', 'birthHeight'];

/**
 * 把单个操作应用到 state（原地修改）
 * @param {{days:Object, profile:Object}} state
 * @param {object} op
 * @returns {boolean} 是否产生了变化
 */
export function applyOp(state, op) {
  if (!state || !op || typeof op !== 'object') return false;
  if (!state.days || typeof state.days !== 'object') state.days = {};
  if (!state.profile || typeof state.profile !== 'object') state.profile = {};

  const date = str(op.date);
  const ts = num(op.ts, Date.now());

  switch (op.type) {
    case 'feed.add':
    case 'feed.update': {
      const day = ensureDay(state, date);
      if (!day || !upsertRecord(day, 'feeds', op.feed, 'time')) return false;
      markDay(day, ts);
      return true;
    }
    case 'diaper.add':
    case 'diaper.update': {
      const day = ensureDay(state, date);
      if (!day || !upsertRecord(day, 'diapers', op.diaper, 'time')) return false;
      markDay(day, ts);
      return true;
    }
    case 'sleep.add':
    case 'sleep.update': {
      const day = ensureDay(state, date);
      if (!day || !upsertRecord(day, 'sleeps', op.sleep, 'start')) return false;
      markDay(day, ts);
      return true;
    }
    case 'feed.remove':
    case 'diaper.remove':
    case 'sleep.remove': {
      const day = ensureDay(state, date);
      if (!day) return false;
      const field = op.type === 'feed.remove' ? 'feeds' : op.type === 'diaper.remove' ? 'diapers' : 'sleeps';
      if (!removeRecord(day, field, str(op.id))) return false;
      markDay(day, ts);
      pruneDay(state, date);
      return true;
    }
    case 'supplement.set': {
      const day = ensureDay(state, date);
      if (!day || !str(op.key)) return false;
      if (op.done) day.supplements[str(op.key)] = { done: true, time: TIME_RE.test(str(op.time)) ? str(op.time) : nowHM() };
      else delete day.supplements[str(op.key)];
      markDay(day, ts);
      pruneDay(state, date);
      return true;
    }
    case 'care.set': {
      const day = ensureDay(state, date);
      if (!day || !str(op.key)) return false;
      if (op.done) day.cares[str(op.key)] = { done: true, time: TIME_RE.test(str(op.time)) ? str(op.time) : nowHM() };
      else delete day.cares[str(op.key)];
      markDay(day, ts);
      pruneDay(state, date);
      return true;
    }
    case 'early.set': {
      const day = ensureDay(state, date);
      if (!day || !str(op.key)) return false;
      const entry = op.entry;
      if (entry && entry.done) {
        day.early[str(op.key)] = {
          done: true,
          minutes: Math.max(0, num(entry.minutes)),
          item: str(entry.item).slice(0, 40),
        };
      } else {
        delete day.early[str(op.key)];
      }
      markDay(day, ts);
      pruneDay(state, date);
      return true;
    }
    case 'day.update': {
      const day = ensureDay(state, date);
      if (!day) return false;
      const patch = op.patch && typeof op.patch === 'object' ? op.patch : {};
      let changed = false;
      DAY_TEXT_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
          day[field] = str(patch[field]);
          changed = true;
        }
      });
      if (!changed) return false;
      markDay(day, ts);
      pruneDay(state, date);
      return true;
    }
    case 'day.delete': {
      if (!DATE_RE.test(date) || !state.days[date]) return false;
      delete state.days[date];
      return true;
    }
    case 'profile.update': {
      const patch = op.patch && typeof op.patch === 'object' ? op.patch : {};
      let changed = false;
      PROFILE_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
          state.profile[field] = str(patch[field]);
          changed = true;
        }
      });
      return changed;
    }
    case 'state.merge': {
      return mergeStates(state, op.state);
    }
    case 'state.reset': {
      state.days = {};
      return true;
    }
    default:
      return false;
  }
}

function sanitizeDay(raw) {
  const day = createBlankDay();
  if (!raw || typeof raw !== 'object') return day;
  DAY_TEXT_FIELDS.forEach((field) => {
    day[field] = str(raw[field]);
  });
  if (Array.isArray(raw.feeds)) day.feeds = raw.feeds.filter((item) => item && item.id).map((item) => clone(item));
  if (Array.isArray(raw.diapers)) day.diapers = raw.diapers.filter((item) => item && item.id).map((item) => clone(item));
  if (Array.isArray(raw.sleeps)) day.sleeps = raw.sleeps.filter((item) => item && item.id).map((item) => clone(item));
  ['supplements', 'cares'].forEach((field) => {
    if (raw[field] && typeof raw[field] === 'object') {
      Object.keys(raw[field]).forEach((key) => {
        const entry = raw[field][key];
        if (entry && entry.done) day[field][key] = { done: true, time: str(entry.time) };
      });
    }
  });
  if (raw.early && typeof raw.early === 'object') {
    Object.keys(raw.early).forEach((key) => {
      const entry = raw.early[key];
      if (entry && entry.done) day.early[key] = { done: true, minutes: num(entry.minutes), item: str(entry.item) };
    });
  }
  day.updatedAt = num(raw.updatedAt);
  day.feeds.sort((a, b) => recordTime(a, 'time').localeCompare(recordTime(b, 'time')));
  day.diapers.sort((a, b) => recordTime(a, 'time').localeCompare(recordTime(b, 'time')));
  day.sleeps.sort((a, b) => recordTime(a, 'start').localeCompare(recordTime(b, 'start')));
  return day;
}

function mergeProfile(target, incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  let changed = false;
  PROFILE_FIELDS.forEach((field) => {
    const value = str(incoming[field]);
    if (!str(target[field]) && value) {
      target[field] = value;
      changed = true;
    }
  });
  return changed;
}

/**
 * 初次加入 / 导入时按天合并：同一天以 updatedAt 较新者为准；档案只补齐空字段。
 */
export function mergeStates(target, incoming) {
  if (!target || !incoming) return false;
  if (!target.days || typeof target.days !== 'object') target.days = {};
  if (!target.profile || typeof target.profile !== 'object') target.profile = {};
  let changed = mergeProfile(target.profile, incoming.profile);
  const incomingDays = incoming.days && typeof incoming.days === 'object' ? incoming.days : {};
  Object.keys(incomingDays).forEach((key) => {
    if (!DATE_RE.test(key)) return;
    const next = sanitizeDay(incomingDays[key]);
    if (dayIsBlank(next)) return;
    const current = target.days[key];
    if (!current || num(next.updatedAt) >= num(current.updatedAt)) {
      target.days[key] = next;
      changed = true;
    }
  });
  return changed;
}

export function cloneState(state) {
  return clone({ profile: (state && state.profile) || {}, days: (state && state.days) || {} });
}
