/**
 * 宝宝成长记 · 家庭实时共享客户端
 *
 * - 可选功能；未开启时完全走本地 localStorage。
 * - 开启后连接同源家庭服务器（server/family-server.mjs），通过 SSE 实时接收家人修改。
 * - 本地修改会生成操作进入队列，断网时保留，联网后补发。
 * - 每次（重）连接都会先补发队列，再拉取服务器快照，保证最终一致。
 */
import * as store from './store.js';

const SETTINGS_KEY = 'babyjournal.sync.v1';
const QUEUE_KEY = 'babyjournal.sync.queue.v1';
const API = '/api';

const DEFAULTS = {
  enabled: false,
  room: '',
  code: '',
  name: '',
  clientId: '',
  bootstrapped: false,
  lastSeq: 0,
};

let settings = loadSettings();
let token = '';
let seq = 0;
let members = [];
let connected = false;
let connecting = false;
let catchingUp = false;
let flushing = false;
let eventSource = null;
let retryTimer = null;
let lastError = '';
let lastSyncedAt = 0;
let serverAvailable = null;
let localDayCount = 0;
let queue = loadQueue();
let opBuffer = [];
let listeners = new Set();

/* ------------------------------------------------------------------ */
/* 存储                                                                 */
/* ------------------------------------------------------------------ */

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[sync] 保存设置失败', err);
  }
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((item) => item && item.op) : [];
  } catch (err) {
    return [];
  }
}

function saveQueue() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[sync] 保存待发送操作失败', err);
  }
}

function ensureClientId() {
  if (!settings.clientId) {
    settings.clientId = store.uid();
    saveSettings();
  }
  return settings.clientId;
}

/* ------------------------------------------------------------------ */
/* 状态订阅                                                             */
/* ------------------------------------------------------------------ */

function notify() {
  const status = getStatus();
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch (err) {
      console.warn('[sync] 状态回调失败', err);
    }
  });
}

export function getStatus() {
  return {
    enabled: Boolean(settings.enabled),
    connected,
    connecting,
    room: settings.room,
    name: settings.name || '家人',
    code: settings.code,
    clientId: settings.clientId,
    members: members.slice(),
    pending: queue.length,
    lastError,
    lastSyncedAt,
    serverAvailable,
    bootstrapped: Boolean(settings.bootstrapped),
    localDayCount,
    serverOrigin: typeof location !== 'undefined' ? location.origin : '',
  };
}

export function subscribeStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

async function api(pathname, options = {}) {
  const { method = 'GET', body = null, useToken = true, timeout = 9000 } = options;
  if (typeof fetch !== 'function') throw new Error('当前浏览器不支持家庭共享');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const authToken = useToken ? token : '';
  if (authToken) headers.Authorization = 'Bearer ' + authToken;

  try {
    const response = await fetch(API + pathname, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
      cache: 'no-store',
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      data = { ok: false, error: '服务器返回了无法解析的内容' };
    }
    if (!response.ok) {
      const error = new Error((data && data.error) || '请求失败（' + response.status + '）');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('连接超时，请检查家庭服务器是否在运行');
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function friendlyError(err) {
  if (!err) return '同步失败';
  if (err.status === 401) return '登录状态已失效，正在重新连接';
  if (err.status === 403) return '房间码不正确';
  if (err.status === 404) return '当前地址不是家庭服务器';
  if (err.message === 'Failed to fetch' || err.name === 'TypeError') return '连不上家庭服务器，请确认地址和网络';
  return err.message || '同步失败';
}

export async function checkServer() {
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
    const response = await fetch(API + '/health', { cache: 'no-store', signal: controller ? controller.signal : undefined });
    if (timer) clearTimeout(timer);
    if (!response.ok) {
      serverAvailable = false;
      return false;
    }
    const data = await response.json();
    serverAvailable = Boolean(data && data.ok);
    if (!serverAvailable) lastError = '当前地址不是家庭服务器';
    return serverAvailable;
  } catch (err) {
    serverAvailable = false;
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 连接                                                                 */
/* ------------------------------------------------------------------ */

function hasLocalData() {
  const local = store.getSyncSnapshot();
  localDayCount = Object.keys(local.days || {}).length;
  const profile = local.profile || {};
  return localDayCount > 0 || Boolean(profile.name || profile.birthday || profile.gender);
}

function closeEvents() {
  if (eventSource) {
    try {
      eventSource.close();
    } catch (err) {
      /* ignore */
    }
    eventSource = null;
  }
}

function openEvents() {
  if (!settings.enabled || !token) return;
  closeEvents();
  try {
    const es = new EventSource(API + '/events?token=' + encodeURIComponent(token));
    eventSource = es;

    es.addEventListener('hello', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Number(data.seq) > seq) scheduleCatchUp(50);
      } catch (err) {
        /* ignore */
      }
    });

    es.addEventListener('op', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      if (catchingUp) {
        opBuffer.push(payload);
        return;
      }
      processRemotePayload(payload);
    });

    es.addEventListener('members', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data.members)) {
          members = data.members;
          notify();
        }
      } catch (err) {
        /* ignore */
      }
    });

    es.addEventListener('snapshot', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      const snapshot = payload && payload.snapshot;
      if (!snapshot) return;
      if (queue.length) {
        // 本地还有没发出去的修改：先补发，再拉取包含它们的新快照
        flushQueue().then(() => catchUp()).catch(() => {});
        return;
      }
      store.replaceStateFromSync(snapshot.state);
      seq = Number(snapshot.seq) || seq;
      members = snapshot.members || members;
      lastSyncedAt = Date.now();
      notify();
    });

    es.onopen = () => {
      connected = true;
      lastError = '';
      notify();
      scheduleCatchUp(120);
    };

    es.onerror = () => {
      connected = false;
      lastError = '家庭服务器连接中断，正在重连…';
      notify();
      // 主动关闭并重新 join，避免旧 token / 旧连接反复重试
      try {
        es.close();
      } catch (err) {
        /* ignore */
      }
      if (eventSource === es) eventSource = null;
      scheduleRetry(2500);
    };
  } catch (err) {
    lastError = '无法建立实时连接';
    notify();
  }
}

function processRemotePayload(payload) {
  if (!payload || !payload.op) return;
  const incomingSeq = Number(payload.seq) || 0;
  if (incomingSeq && incomingSeq <= seq) return;
  if (payload.clientId === settings.clientId) {
    seq = Math.max(seq, incomingSeq);
    return;
  }
  store.applyRemoteOp(payload.op);
  seq = Math.max(seq, incomingSeq);
  lastSyncedAt = Date.now();
  notify();
}

let catchUpTimer = null;
function scheduleCatchUp(delay = 120) {
  if (catchUpTimer) clearTimeout(catchUpTimer);
  catchUpTimer = setTimeout(() => {
    catchUpTimer = null;
    catchUp();
  }, delay);
}

async function catchUp() {
  if (!settings.enabled || !token || catchingUp) return;
  catchingUp = true;
  opBuffer = [];
  try {
    await flushQueue();
    if (queue.length) {
      lastError = '还有 ' + queue.length + ' 条本机记录待同步，已保留在本机';
      notify();
      return;
    }
    const data = await api('/snapshot', { useToken: true });
    const snapshot = data && data.snapshot;
    if (!snapshot) throw new Error('服务器没有返回数据');
    store.replaceStateFromSync(snapshot.state);
    seq = Number(snapshot.seq) || seq;
    settings.lastSeq = seq;
    saveSettings();
    members = snapshot.members || members;
    lastSyncedAt = Date.now();
    const buffered = opBuffer;
    opBuffer = [];
    buffered.forEach((payload) => {
      if (Number(payload.seq) > seq) processRemotePayload(payload);
    });
    connected = true;
    lastError = '';
    notify();
  } catch (err) {
    if (err && err.status === 401) {
      token = '';
      connected = false;
      lastError = '连接已失效，正在重新加入…';
      scheduleRetry(400);
    } else {
      lastError = friendlyError(err);
    }
    notify();
  } finally {
    catchingUp = false;
  }
}

let connectPromise = null;

/** 连接家庭服务器；不会抛错（除非 throwOnError） */
export async function connect(options = {}) {
  if (!settings.enabled) return getStatus();
  if (connected) return getStatus();
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    connecting = true;
    lastError = '';
    notify();
    try {
      const joined = await api('/join', {
        method: 'POST',
        useToken: false,
        body: {
          room: settings.room,
          code: settings.code || settings.room,
          name: settings.name,
          clientId: ensureClientId(),
        },
      });
      if (!settings.enabled) return getStatus();
      token = joined.token || '';
      members = (joined.snapshot && joined.snapshot.members) || [];
      seq = Number(joined.snapshot && joined.snapshot.seq) || 0;
      settings.lastSeq = seq;

      let snapshot = joined.snapshot;
      if (!settings.bootstrapped && hasLocalData()) {
        // 第一次连接：把本机已有记录合并到家庭空间（服务器按天 updatedAt 合并）
        const local = store.getSyncSnapshot();
        const boot = await api('/bootstrap', { method: 'POST', body: { state: local } });
        snapshot = boot.snapshot || snapshot;
        queue = [];
        saveQueue();
      }
      settings.bootstrapped = true;
      saveSettings();

      // 断网期间积压的修改先补发给服务器，再拉取包含这些修改的最新快照，
      // 避免用旧快照覆盖本机尚未发送的记录。
      if (queue.length) {
        await flushQueue();
        if (queue.length) throw new Error('还有 ' + queue.length + ' 条本机记录没同步成功');
      }
      const fresh = await api('/snapshot');
      if (fresh && fresh.snapshot) snapshot = fresh.snapshot;

      if (snapshot) {
        store.replaceStateFromSync(snapshot.state);
        seq = Number(snapshot.seq) || seq;
        members = snapshot.members || members;
        localDayCount = Object.keys((snapshot.state && snapshot.state.days) || {}).length;
      }
      connected = true;
      lastSyncedAt = Date.now();
      settings.lastSeq = seq;
      saveSettings();
      openEvents();
      notify();
      return getStatus();
    } catch (err) {
      connected = false;
      lastError = friendlyError(err);
      notify();
      if (options.throwOnError) throw new Error(lastError);
      scheduleRetry();
      return getStatus();
    } finally {
      connecting = false;
      connectPromise = null;
      notify();
    }
  })();

  return connectPromise;
}

function scheduleRetry(delay = 15000) {
  if (retryTimer || !settings.enabled) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!connected) connect({ silent: true });
  }, delay);
}

/* ------------------------------------------------------------------ */
/* 本地修改 → 队列                                                       */
/* ------------------------------------------------------------------ */

function handleLocalOp(op) {
  if (!settings.enabled || !op || !op.type) return;
  const item = {
    opId: store.uid(),
    clientId: ensureClientId(),
    ts: Date.now(),
    op,
  };
  queue.push(item);
  saveQueue();
  notify();
  flushQueue();
}

async function flushQueue() {
  if (flushing || !settings.enabled || !token) return;
  flushing = true;
  let failed = false;
  try {
    while (queue.length) {
      const item = queue[0];
      try {
        const result = await api('/op', {
          method: 'POST',
          body: { op: item.op, opId: item.opId },
        });
        queue.shift();
        saveQueue();
        if (result && result.seq) seq = Math.max(seq, Number(result.seq));
        lastSyncedAt = Date.now();
        connected = true;
      } catch (err) {
        failed = true;
        if (err && err.status === 401) {
          token = '';
          connected = false;
          lastError = '连接已失效，正在重新连接…';
          scheduleRetry(500);
        } else {
          connected = false;
          lastError = friendlyError(err);
        }
        break;
      }
    }
  } finally {
    flushing = false;
    saveQueue();
    notify();
    if (failed) scheduleRetry();
  }
}

/* ------------------------------------------------------------------ */
/* 对外操作                                                             */
/* ------------------------------------------------------------------ */

export async function enable(options = {}) {
  const room = String(options.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const code = String(options.code || room).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const name = String(options.name || '').trim().slice(0, 20) || '家人';
  if (!/^[A-Z0-9]{6}$/.test(room)) throw new Error('房间码需要 6 位字母或数字');

  // 切换到另一个房间时，不要把旧房间的数据/未发送操作带到新房间
  const roomChanged = Boolean(settings.room && settings.room !== room);
  if (roomChanged) {
    queue = [];
    saveQueue();
  }

  settings.enabled = true;
  settings.room = room;
  settings.code = code;
  settings.name = name;
  // 首次开启时把本机数据合并到家庭空间；换房间时直接以新房间数据为准，避免串数据
  settings.bootstrapped = roomChanged;
  ensureClientId();
  saveSettings();
  token = '';
  connected = false;
  lastError = '';
  notify();

  const status = await connect({ throwOnError: true });
  if (!status.connected) throw new Error(status.lastError || '连接家庭服务器失败');
  return status;
}

export async function syncNow() {
  if (!settings.enabled) return getStatus();
  if (connected) {
    await catchUp();
    return getStatus();
  }
  return connect();
}

export async function disable() {
  if (settings.enabled) await flushQueue();
  closeEvents();
  settings.enabled = false;
  saveSettings();
  token = '';
  connected = false;
  connecting = false;
  catchingUp = false;
  lastError = '';
  notify();
  return getStatus();
}

/** 从家庭服务器导出完整备份 JSON（需要已连接） */
export async function exportFamilyBackup() {
  if (!token) throw new Error('家庭共享尚未连接');
  const data = await api('/backup');
  if (!data || !data.backup) throw new Error('服务器没有返回备份数据');
  return JSON.stringify(data.backup, null, 2);
}

export function clearQueue() {
  queue = [];
  saveQueue();
  notify();
}

export function getInviteText() {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return '宝宝成长记 · 家庭共享\n打开：' + origin + '\n房间码：' + (settings.room || '') + '\n用 Safari 打开后，在「我的 → 家庭共享」输入房间码即可一起记录。';
}

/* ------------------------------------------------------------------ */
/* 启动                                                                 */
/* ------------------------------------------------------------------ */

export function initSync() {
  ensureClientId();
  localDayCount = store.getRecordedDays().length;
  store.setMutationHook(handleLocalOp);

  if (settings.enabled) {
    setTimeout(() => {
      connect({ silent: true });
    }, 600);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (settings.enabled && !connected) connect({ silent: true });
    });
    window.addEventListener('offline', () => {
      if (settings.enabled) {
        connected = false;
        lastError = '网络已断开，修改会先保存在本机';
        notify();
      }
    });
  }

  setInterval(() => {
    if (settings.enabled && !connected && !connecting && !connectPromise) connect({ silent: true });
  }, 20000);

  notify();
  return getStatus();
}
