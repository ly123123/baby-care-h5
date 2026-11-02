/** 宝宝成长记 · 图标 / 底部弹层 / Toast / 确认框（无依赖） */

const ICONS = {
  baby: '<circle cx="12" cy="13.2" r="7.1"/><path d="M9.4 3.4c.5-1.1 1.8-1.7 3-1.3 1.1.3 1.7 1.4 1.4 2.5"/><circle cx="9.4" cy="12.1" r=".95" fill="currentColor" stroke="none"/><circle cx="14.6" cy="12.1" r=".95" fill="currentColor" stroke="none"/><path d="M9.3 15.2c.7.9 1.6 1.3 2.7 1.3s2-.4 2.7-1.3"/>',
  bottle: '<rect x="7.8" y="8" width="8.4" height="13" rx="3.2"/><path d="M10.2 8V6.1c0-1 .8-1.9 1.8-1.9s1.8.9 1.8 1.9V8"/><path d="M7.8 10.6h8.4"/><path d="M10.5 13.2h3M10.5 16.2h3"/>',
  diaper: '<path d="M4.6 6.3h14.8l-1.2 8.4a4.4 4.4 0 0 1-4.4 3.8h-3.6a4.4 4.4 0 0 1-4.4-3.8L4.6 6.3Z"/><path d="M8.2 6.3V4.6M15.8 6.3V4.6"/><path d="M5 9.3h14"/>',
  moon: '<path d="M20.2 14.3A8.3 8.3 0 1 1 9.7 3.8a6.6 6.6 0 0 0 10.5 10.5Z"/><path d="M17.2 5.2v2.2M16.1 6.3h2.2"/>',
  pill: '<path d="M9 3.2h6v2.9H9z"/><path d="M8.1 9.1a2.1 2.1 0 0 1 2.1-2.1h3.6a2.1 2.1 0 0 1 2.1 2.1v9.5a2 2 0 0 1-2 2h-3.8a2 2 0 0 1-2-2V9.1Z"/><path d="M10.1 13h3.8M12 11.1v3.8"/>',
  heart: '<path d="M12 20.2s-7.2-4.5-7.2-9.5A3.9 3.9 0 0 1 12 8.1a3.9 3.9 0 0 1 7.2 2.6c0 5-7.2 9.5-7.2 9.5Z"/>',
  book: '<path d="M4.4 5.6A2.6 2.6 0 0 1 7 3h12.6v16.2H7a2.6 2.6 0 0 0-2.6 2.6V5.6Z"/><path d="M4.4 18.6A2.6 2.6 0 0 1 7 16h12.6"/>',
  chart: '<path d="M3.6 20.2h16.8"/><path d="M6.8 20V11M12 20V4.4M17.2 20v-6.2"/>',
  sliders: '<path d="M4 7.2h8.4M16.8 7.2H20M4 16.8h3.4M12 16.8h8"/><circle cx="14.8" cy="7.2" r="2.2"/><circle cx="9.6" cy="16.8" r="2.2"/>',
  calendar: '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3"/><path d="M3.6 10.2h16.8M8.2 3.4v3.6M15.8 3.4v3.6"/><path d="M7.8 13.6h.01M12 13.6h.01M16.2 13.6h.01M7.8 17.2h.01M12 17.2h.01"/>',
  'chevron-left': '<path d="M14.6 5.8 8.4 12l6.2 6.2"/>',
  'chevron-right': '<path d="M9.4 5.8 15.6 12l-6.2 6.2"/>',
  'chevron-down': '<path d="M5.8 9.4 12 15.6l6.2-6.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4.8 12.6 9.6 17.4 19.2 6.8"/>',
  plus: '<path d="M12 4.6v14.8M4.6 12h14.8"/>',
  share: '<path d="M12 3.4v12.2"/><path d="M8.2 7.2 12 3.4l3.8 3.8"/><path d="M5.2 12v6.4a2.4 2.4 0 0 0 2.4 2.4h8.8a2.4 2.4 0 0 0 2.4-2.4V12"/>',
  download: '<path d="M12 3.6v11.6"/><path d="M7.6 11 12 15.4 16.4 11"/><path d="M4.6 16.6v1.8a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-1.8"/>',
  edit: '<path d="M4.2 19.8 5.4 15 15 5.4a2.1 2.1 0 0 1 3 3L8.4 18l-4.2 1.8Z"/><path d="M13.3 7.1l3 3"/>',
  trash: '<path d="M4.4 7h15.2M9.2 7V4.6h5.6V7M6.2 7l1 12.6h9.6l1-12.6"/><path d="M10.2 10.8v5.6M13.8 10.8v5.6"/>',
  sparkle: '<path d="M12 3.2 13.7 8.3 18.8 10l-5.1 1.7L12 16.8l-1.7-5.1L5.2 10l5.1-1.7L12 3.2Z"/><path d="M18.6 15.8v2.8M17.2 17.2h2.8"/>',
  sun: '<circle cx="12" cy="12" r="4.1"/><path d="M12 2.8v2.2M12 19v2.2M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M2.8 12H5M19 12h2.2M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6"/>',
  thermometer: '<path d="M10 13.8V5a2 2 0 0 1 4 0v8.8a4.1 4.1 0 1 1-4 0Z"/><path d="M12 9.2v6.2"/>',
  note: '<path d="M6.2 3.2h8.4l3.2 3.2v14.4H6.2V3.2Z"/><path d="M14.6 3.2v3.4h3.4M9.2 11.6h5.6M9.2 15.2h3.6"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 2"/>',
  'arrow-up': '<path d="M12 19.2V4.8M6 10.8 12 4.8l6 6"/>',
  'arrow-down': '<path d="M12 4.8v14.4M6 13.2l6 6 6-6"/>',
  droplet: '<path d="M12 3.4s6.1 6.2 6.1 10.3a6.1 6.1 0 1 1-12.2 0C5.9 9.6 12 3.4 12 3.4Z"/>',
  back: '<path d="M19.2 12H5M11 5.8 4.8 12l6.2 6.2"/>',
  file: '<path d="M6 3.2h8l4 4v13.6H6V3.2Z"/><path d="M14 3.2v4h4"/><path d="M9 12h6M9 15.6h4"/>',
  restore: '<path d="M4.4 9.2A8.2 8.2 0 1 1 4 14"/><path d="M4.2 4.6v4.8h4.8"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.2M12 7.8h.01"/>',
  more: '<circle cx="5.6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  camera: '<path d="M4.4 7.8h3l1.4-2.2h6.4l1.4 2.2h3a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8V9.6a1.8 1.8 0 0 1 1.8-1.8Z"/><circle cx="12" cy="13.4" r="3.1"/>',
  image: '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.6"/><circle cx="8.8" cy="9.6" r="1.6"/><path d="m4.8 17.4 4.6-4.4 3.2 3 2.6-2.4 4 3.8"/>',
  copy: '<rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2.2"/><path d="M5.6 15.4H4.8A2.2 2.2 0 0 1 2.6 13.2V4.8a2.2 2.2 0 0 1 2.2-2.2h8.4a2.2 2.2 0 0 1 2.2 2.2v.8"/>',
  shield: '<path d="M12 3.2 19 6v5.4c0 4.4-3 7.4-7 9.4-4-2-7-5-7-9.4V6l7-2.8Z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
  users: '<circle cx="9" cy="8.2" r="3.1"/><circle cx="17.2" cy="9.6" r="2.4"/><path d="M3.6 19.4c.4-3.2 2.6-5 5.4-5s5 1.8 5.4 5"/><path d="M15.3 14.4c2.1.2 3.8 1.7 4.2 4.1"/>',
  cloud: '<path d="M7.1 18.2h9.4a3.6 3.6 0 0 0 .5-7.1 5.1 5.1 0 0 0-9.7-1.4 4.1 4.1 0 0 0-.2 8.5Z"/>',
};

export function icon(name, size = 22, cls = '') {
  const body = ICONS[name] || ICONS.sparkle;
  return (
    '<svg class="icon ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    body +
    '</svg>'
  );
}

export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

/* ------------------------------------------------------------------ */
/* 滚动锁定                                                             */
/* ------------------------------------------------------------------ */

let lockCount = 0;

function lockScroll() {
  lockCount += 1;
  if (lockCount === 1) document.body.classList.add('is-locked');
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.classList.remove('is-locked');
}

/* ------------------------------------------------------------------ */
/* 底部弹层                                                             */
/* ------------------------------------------------------------------ */

let activeSheet = null;

export function openSheet(options = {}) {
  const {
    title = '',
    subtitle = '',
    body = '',
    footer = '',
    onMount = null,
    onClose = null,
    dismissible = true,
    className = '',
  } = options;

  closeSheet(true);

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML =
    '<div class="sheet-backdrop" data-sheet-backdrop></div>' +
    '<section class="sheet ' + esc(className) + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      '<header class="sheet-head">' +
        '<div class="sheet-head-text"><h2>' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div>' +
        (dismissible ? '<button type="button" class="icon-btn ghost" data-sheet-close aria-label="关闭">' + icon('close') + '</button>' : '') +
      '</header>' +
      '<div class="sheet-body">' + body + '</div>' +
      (footer ? '<footer class="sheet-foot">' + footer + '</footer>' : '') +
    '</section>';

  document.body.appendChild(overlay);
  lockScroll();
  requestAnimationFrame(() => overlay.classList.add('is-in'));

  const sheetEl = overlay.querySelector('.sheet');
  const bodyEl = overlay.querySelector('.sheet-body');
  const footerEl = overlay.querySelector('.sheet-foot');
  let closed = false;

  function close(immediate = false) {
    if (closed) return;
    closed = true;
    if (activeSheet && activeSheet.overlay === overlay) activeSheet = null;
    // 关闭动画期间禁止继续点面板按钮，但遮罩仍然拦截点击，避免穿透到底部 Tab
    overlay.classList.add('is-closing');
    const panel = overlay.querySelector('.sheet');
    if (panel) panel.style.pointerEvents = 'none';
    unlockScroll();
    document.removeEventListener('keydown', onKeydown);
    if (immediate) {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
      return;
    }
    overlay.classList.remove('is-in');
    setTimeout(() => {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
    }, 230);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && dismissible) close();
  }
  document.addEventListener('keydown', onKeydown);

  overlay.addEventListener('click', (event) => {
    const target = event.target;
    // 表单保存成功后 close() 已执行，事件继续冒泡到这里：
    // 立刻禁用被点的按钮，防止第二次点击/双击重复写入
    if (closed) {
      const button = target.closest('button');
      if (button) button.disabled = true;
      return;
    }
    if (target.closest('[data-sheet-close]') || target.closest('[data-sheet-backdrop]')) {
      if (dismissible) close();
    }
  });

  const handle = { root: overlay, overlay, sheet: sheetEl, body: bodyEl, footer: footerEl, close };
  activeSheet = handle;

  if (typeof onMount === 'function') {
    try {
      onMount(handle);
    } catch (err) {
      console.error('[ui] sheet mount error', err);
    }
  }

  return handle;
}

export function closeSheet(immediate = false) {
  if (activeSheet) activeSheet.close(immediate);
}

/* ------------------------------------------------------------------ */
/* 确认框                                                               */
/* ------------------------------------------------------------------ */

export function confirmDialog(options = {}) {
  const {
    title = '确认操作',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
    iconName = 'info',
  } = options;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML =
      '<div class="confirm-card" role="alertdialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="confirm-icon ' + (danger ? 'is-danger' : '') + '">' + icon(iconName, 24) + '</div>' +
        '<h3>' + esc(title) + '</h3>' +
        '<p>' + esc(message) + '</p>' +
        '<div class="confirm-actions">' +
          '<button type="button" class="btn btn-ghost" data-confirm-cancel>' + esc(cancelText) + '</button>' +
          '<button type="button" class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-confirm-ok>' + esc(confirmText) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    lockScroll();
    requestAnimationFrame(() => overlay.classList.add('is-in'));

    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      unlockScroll();
      overlay.classList.remove('is-in');
      setTimeout(() => overlay.remove(), 180);
      resolve(value);
    }

    overlay.addEventListener('click', (event) => {
      if (event.target.closest('[data-confirm-ok]')) finish(true);
      else if (event.target.closest('[data-confirm-cancel]') || event.target === overlay) finish(false);
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') finish(false);
        if (event.key === 'Enter') finish(true);
      },
      { once: true }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Toast                                                                */
/* ------------------------------------------------------------------ */

export function toast(message, options = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML =
    (options.icon === false ? '' : icon(options.icon || 'check', 16)) +
    '<span>' + esc(message) + '</span>';
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 260);
  }, options.duration || 2400);
}

/* ------------------------------------------------------------------ */
/* 轻触反馈                                                             */
/* ------------------------------------------------------------------ */

export function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch (err) {
    /* iOS 不支持，忽略 */
  }
}