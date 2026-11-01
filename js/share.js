/**
 * 宝宝成长记 · 成长简报（Canvas 1080×1620）+ 分享 / 保存
 *
 * 公开 API：openBriefSheet({ period, anchor })
 * - 弹层复用 ui.js 的 openSheet（滚动锁定、重复打开自动关闭、Esc / 点击遮罩关闭）
 * - 优先 navigator.share({ files: [File] })（iOS / Android 系统分享面板）
 * - 不支持文件分享时降级下载；iOS 不支持下载时提示长按图片保存
 */

import { computeReport } from './stats.js';
import { getProfile, ageLabel, formatDateCN, formatMinutes, todayKey } from './store.js';
import { openSheet, toast, icon } from './ui.js';

const W = 1080;
const H = 1620;

const C = {
  bg: '#FAF5EF',
  bgDeep: '#F4EBE2',
  surface: '#FFFDFB',
  surface2: '#FFF8F2',
  ink: '#40342E',
  ink2: '#7D6C63',
  ink3: '#8C7A6E',
  line: '#EFE2D8',
  coral: '#E58A72',
  coralDeep: '#D2705A',
  coralSoft: '#FBE4DC',
  peach: '#F6C6B4',
  sage: '#7F9C83',
  sageSoft: '#E7EFE6',
  amber: '#D9A24C',
  amberSoft: '#FBF0DC',
  lilac: '#A98FBF',
  sky: '#7FA6B8',
};

const FONT = '"PingFang SC", -apple-system, "Helvetica Neue", "Noto Sans SC", "Microsoft YaHei", sans-serif';

const LAYOUT = {
  pad: 48,
  header: { x: 48, y: 48, w: 984, h: 236, r: 44 },
  pill: { x: 84, y: 252, w: 912, h: 110, r: 55 },
  kpi: { x: 48, y: 396, w: 480, h: 172, gapX: 24, gapY: 24, r: 28 },
  chart: { x: 48, y: 792, w: 984, h: 354, r: 32 },
  completion: { x: 48, y: 1174, w: 312, h: 216, gap: 24, r: 28 },
  warmY: 1434,
  footerY: 1506,
  brandY: 1548,
};

let activeHandle = null;
let activeUrl = '';
let opening = false;

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 打开成长简报弹层
 * @param {{period?: 'week'|'month'|'quarter', anchor?: string}} options
 * @returns {Promise<object|undefined>} openSheet 返回的 handle
 */
export async function openBriefSheet(options = {}) {
  if (opening || activeHandle) {
    pulseSheet(activeHandle);
    return activeHandle || undefined;
  }
  opening = true;

  const period = ['week', 'month', 'quarter'].includes(options.period) ? options.period : 'week';
  const anchorKey = typeof options.anchor === 'string' && options.anchor ? options.anchor : todayKey();

  let report;
  try {
    report = computeReport(period, anchorKey);
  } catch (err) {
    console.error('[share] 统计聚合失败', err);
    toast('暂时无法生成简报，请稍后再试');
    opening = false;
    return undefined;
  }

  const handle = openSheet({
    title: '成长简报',
    subtitle: report.title + ' · ' + report.rangeText,
    body: briefBodyHtml(),
    footer: briefFooterHtml(),
    className: 'st-brief-sheet',
    onMount: (sheetHandle) => bindSheet(sheetHandle),
    onClose: () => {
      if (activeUrl) {
        try { URL.revokeObjectURL(activeUrl); } catch (err) { /* 忽略 */ }
        activeUrl = '';
      }
      activeHandle = null;
      opening = false;
    },
  });

  activeHandle = handle;

  try {
    await renderBrief(handle, report);
  } catch (err) {
    console.error('[share] 生成简报失败', err);
    showSheetError(handle);
    toast('简报生成失败，请稍后再试');
  } finally {
    opening = false;
  }

  return handle;
}

/* ------------------------------------------------------------------ */
/* 弹层结构                                                             */
/* ------------------------------------------------------------------ */

function briefBodyHtml() {
  return (
    '<div class="st-brief">' +
    '<div class="st-brief-preview" data-brief-preview>' +
    '<div class="st-brief-loading" data-brief-loading>' +
    '<span class="st-spinner" aria-hidden="true"></span>' +
    '<p>正在为宝宝画一张简报…</p>' +
    '</div>' +
    '<img class="st-brief-img" data-brief-img alt="宝宝成长简报预览" hidden>' +
    '</div>' +
    '<p class="st-brief-tip" data-brief-tip>长按图片可保存到相册，也可以直接分享给家人。</p>' +
    '</div>'
  );
}

function briefFooterHtml() {
  return (
    '<div class="st-brief-actions">' +
    '<button type="button" class="btn btn-primary btn-block st-brief-primary" data-brief-share disabled>' +
    icon('share', 18, 'st-btn-icon') +
    '<span>分享到微信</span>' +
    '</button>' +
    '<button type="button" class="btn btn-soft btn-block st-brief-secondary" data-brief-save disabled>' +
    icon('download', 18, 'st-btn-icon') +
    '<span>保存图片</span>' +
    '</button>' +
    '</div>'
  );
}

function bindSheet(handle) {
  const footer = handle.footer;
  if (footer) {
    footer.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-brief-share], [data-brief-save]') : null;
      if (!target) return;
      if (target.hasAttribute('data-brief-share')) doShare(handle);
      else doSave(handle);
    });
  }
  const img = handle.body && handle.body.querySelector('[data-brief-img]');
  if (img) {
    img.addEventListener('load', () => {
      img.hidden = false;
      const loading = handle.body.querySelector('[data-brief-loading]');
      if (loading) loading.remove();
    });
    img.addEventListener('error', () => showSheetError(handle));
  }
}

function pulseSheet(handle) {
  if (!handle || !handle.overlay) return;
  const el = handle.overlay;
  el.classList.remove('st-brief-pulse');
  void el.offsetWidth;
  el.classList.add('st-brief-pulse');
}

function showSheetError(handle) {
  if (!handle || !handle.body) return;
  const preview = handle.body.querySelector('[data-brief-preview]');
  if (preview) {
    preview.innerHTML = '<div class="st-brief-error"><p>这张简报没有画成功，再试一次吧。</p></div>';
  }
  const tip = handle.body.querySelector('[data-brief-tip]');
  if (tip) tip.textContent = '可以关闭后重新生成。';
}

/* ------------------------------------------------------------------ */
/* 生成与绑定                                                           */
/* ------------------------------------------------------------------ */

async function renderBrief(handle, report) {
  await waitForFonts();
  if (!handle.overlay || !handle.overlay.isConnected) return;

  const canvas = drawBrief(report);
  const blob = await canvasToBlob(canvas);
  if (!handle.overlay || !handle.overlay.isConnected) return;

  const url = URL.createObjectURL(blob);
  activeUrl = url;

  const fileName = briefFileName(report);
  const brief = { blob, url, canvas, fileName, file: null };
  handle._brief = brief;

  const img = handle.body && handle.body.querySelector('[data-brief-img]');
  if (img) img.src = url;
  else showImageFallback(handle, url);

  const shareBtn = handle.footer && handle.footer.querySelector('[data-brief-share]');
  const saveBtn = handle.footer && handle.footer.querySelector('[data-brief-save]');
  if (shareBtn) shareBtn.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
}

function showImageFallback(handle, url) {
  const preview = handle.body && handle.body.querySelector('[data-brief-preview]');
  if (!preview) return;
  preview.innerHTML = '<img class="st-brief-img" alt="宝宝成长简报预览" src="' + url + '">';
}

function waitForFonts() {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(done, done);
        setTimeout(done, 1800);
      } else {
        done();
      }
    } catch (err) {
      done();
    }
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          try {
            resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
          } catch (err) {
            reject(err);
          }
        }, 'image/png');
        return;
      }
      resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
    } catch (err) {
      reject(err);
    }
  });
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mimeMatch = /:(.*?);/.exec(parts[0]);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function briefFileName(report) {
  const safe = String(report.title || '成长简报').replace(/[\\/:*?"<>|\s]/g, '');
  return '宝宝成长记-' + safe + '-成长简报.png';
}

/* ------------------------------------------------------------------ */
/* 分享 / 保存                                                          */
/* ------------------------------------------------------------------ */

function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1;
}

function makeFile(brief) {
  if (brief.file) return brief.file;
  try {
    if (typeof File !== 'function') return null;
    brief.file = new File([brief.blob], brief.fileName, { type: 'image/png' });
    return brief.file;
  } catch (err) {
    return null;
  }
}

async function doShare(handle) {
  const brief = handle && handle._brief;
  if (!brief) return;
  const file = makeFile(brief);

  let canShareFiles = false;
  if (file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      canShareFiles = navigator.canShare({ files: [file] });
    } catch (err) {
      canShareFiles = false;
    }
  }

  if (!canShareFiles) {
    fallbackDownload(handle, 'share');
    return;
  }

  try {
    await navigator.share({
      files: [file],
      title: '宝宝成长记 · 成长简报',
      text: '这是宝宝这一周期的成长简报。',
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    fallbackDownload(handle, 'share');
  }
}

function doSave(handle) {
  const brief = handle && handle._brief;
  if (!brief) return;
  if (isIOS()) {
    toast('长按图片即可保存到相册');
    return;
  }
  triggerDownload(brief);
  toast('已保存图片，可在相册中发送');
}

function fallbackDownload(handle, kind) {
  const brief = handle && handle._brief;
  if (!brief) return;
  if (isIOS()) {
    toast('长按图片即可保存到相册');
    return;
  }
  triggerDownload(brief);
  toast(kind === 'share' ? '已保存图片，可在相册中发送' : '已保存图片');
}

function triggerDownload(brief) {
  try {
    const a = document.createElement('a');
    a.href = brief.url;
    a.download = brief.fileName || '宝宝成长记-成长简报.png';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error('[share] 下载失败', err);
    toast('保存失败，可以长按图片保存');
  }
}

/* ------------------------------------------------------------------ */
/* Canvas 绘制工具                                                      */
/* ------------------------------------------------------------------ */

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function topRoundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function setFont(ctx, size, weight) {
  ctx.font = String(weight || 400) + ' ' + size + 'px ' + FONT;
}

function drawText(ctx, str, x, y, options = {}) {
  const {
    size = 24,
    weight = 400,
    color = C.ink,
    align = 'left',
    baseline = 'alphabetic',
    alpha = 1,
  } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  setFont(ctx, size, weight);
  ctx.fillText(String(str == null ? '' : str), x, y);
  ctx.restore();
}

function measureText(ctx, str, size, weight) {
  ctx.save();
  setFont(ctx, size, weight);
  const width = ctx.measureText(String(str == null ? '' : str)).width;
  ctx.restore();
  return width;
}

function truncateText(value, maxChars) {
  const text = String(value == null ? '' : value);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function softGlow(ctx, x, y, r, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(250,245,239,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCard(ctx, x, y, w, h, r, fill) {
  ctx.save();
  ctx.shadowColor = 'rgba(160,110,90,0.10)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = fill || C.surface;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
  ctx.stroke();
  ctx.restore();
}

function niceMax(value) {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  let m = 10;
  if (n <= 1) m = 1;
  else if (n <= 1.25) m = 1.25;
  else if (n <= 1.5) m = 1.5;
  else if (n <= 2) m = 2;
  else if (n <= 2.5) m = 2.5;
  else if (n <= 3) m = 3;
  else if (n <= 4) m = 4;
  else if (n <= 5) m = 5;
  else if (n <= 6) m = 6;
  else if (n <= 8) m = 8;
  return m * base;
}

function labelIndices(count, maxLabels) {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const out = [];
  const step = (count - 1) / (maxLabels - 1);
  for (let i = 0; i < maxLabels; i += 1) out.push(Math.round(i * step));
  return Array.from(new Set(out)).filter((i) => i >= 0 && i < count);
}

/* ------------------------------------------------------------------ */
/* 简报绘制                                                             */
/* ------------------------------------------------------------------ */

function drawBrief(report) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持 Canvas');

  const profile = getProfile();
  const name = truncateText(profile.name || '宝宝', 10);
  const effectiveDate = report.endKey <= todayKey() ? report.endKey : todayKey();
  const ageText = profile.birthday ? ageLabel(profile.birthday, effectiveDate) : '';

  /* 背景 */
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  softGlow(ctx, 1010, 30, 430, 'rgba(246,198,180,0.55)');
  softGlow(ctx, 20, 1600, 420, 'rgba(231,239,230,0.9)');

  /* 顶部标题块 */
  const head = LAYOUT.header;
  ctx.save();
  ctx.shadowColor = 'rgba(210,112,90,0.24)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundRectPath(ctx, head.x, head.y, head.w, head.h, head.r);
  const headGradient = ctx.createLinearGradient(head.x, head.y, head.x + head.w, head.y + head.h);
  headGradient.addColorStop(0, '#ECA083');
  headGradient.addColorStop(1, C.coralDeep);
  ctx.fillStyle = headGradient;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(934, 116, 132, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1032, 252, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawText(ctx, '宝宝成长记', 100, 128, { size: 26, weight: 500, color: '#FFFFFF', alpha: 0.86 });
  drawText(ctx, '成长简报', 100, 210, { size: 60, weight: 700, color: '#FFFFFF' });

  drawText(ctx, name, 980, 156, { size: 34, weight: 700, color: '#FFFFFF', align: 'right' });
  if (ageText) {
    drawText(ctx, ageText, 980, 200, { size: 24, weight: 400, color: '#FFFFFF', align: 'right', alpha: 0.88 });
  }

  /* 周期胶囊 */
  const pill = LAYOUT.pill;
  drawCard(ctx, pill.x, pill.y, pill.w, pill.h, pill.r, C.surface);
  drawText(ctx, report.title, W / 2, pill.y + 46, {
    size: 31,
    weight: 700,
    color: C.ink,
    align: 'center',
  });
  drawText(ctx, report.rangeText, W / 2, pill.y + 84, {
    size: 23,
    weight: 400,
    color: C.ink2,
    align: 'center',
  });

  /* 4 个 KPI */
  const kpi = LAYOUT.kpi;
  const cardPositions = [
    { x: kpi.x, y: kpi.y },
    { x: kpi.x + kpi.w + kpi.gapX, y: kpi.y },
    { x: kpi.x, y: kpi.y + kpi.h + kpi.gapY },
    { x: kpi.x + kpi.w + kpi.gapX, y: kpi.y + kpi.h + kpi.gapY },
  ];
  const effective = report.effectiveDays;
  const sleepAvg = effective > 0 ? report.averages.sleepMin / 60 : 0;
  const kpis = [
    {
      label: '日均奶量',
      value: String(Math.round(report.averages.milkMl)),
      unit: 'ml',
      sub: '共 ' + fmtInt(report.totals.milkMl) + ' ml',
      color: C.coral,
    },
    {
      label: '大便次数',
      value: String(report.totals.poopCount),
      unit: '次',
      sub: '日均 ' + round1(report.averages.poopCount) + ' 次',
      color: C.amber,
    },
    {
      label: '尿布张数',
      value: String(report.totals.diaperCount),
      unit: '张',
      sub: '日均 ' + round1(report.averages.diaperCount) + ' 张',
      color: C.sky,
    },
    {
      label: '日均睡眠',
      value: sleepAvg.toFixed(1),
      unit: '小时',
      sub: '共 ' + formatMinutes(report.totals.sleepMin),
      color: C.lilac,
    },
  ];
  kpis.forEach((item, index) => {
    const pos = cardPositions[index];
    drawCard(ctx, pos.x, pos.y, kpi.w, kpi.h, kpi.r, C.surface);
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(pos.x + 38, pos.y + 44, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawText(ctx, item.label, pos.x + 56, pos.y + 52, { size: 24, weight: 500, color: C.ink2 });
    const valueWidth = measureText(ctx, item.value, 58, 700);
    drawText(ctx, item.value, pos.x + 36, pos.y + 122, { size: 58, weight: 700, color: C.ink });
    drawText(ctx, item.unit, pos.x + 36 + valueWidth + 8, pos.y + 122, {
      size: 26,
      weight: 500,
      color: C.ink2,
    });
    drawText(ctx, item.sub, pos.x + 36, pos.y + 158, { size: 21, weight: 400, color: C.ink3 });
  });

  /* 奶量趋势 */
  drawMilkChart(ctx, report);

  /* 补剂 / 护理 / 早教 */
  drawCompletionCards(ctx, report);

  /* 底部 */
  drawText(
    ctx,
    '这一周期记录了 ' + report.recordedDays + ' 天，每一天都值得被记住。',
    W / 2,
    LAYOUT.warmY,
    { size: 24, weight: 400, color: C.ink2, align: 'center' }
  );
  drawText(
    ctx,
    '记录 ' + report.recordedDays + ' 天 · 生成于 ' + todayKey().replace(/-/g, '.'),
    W / 2,
    LAYOUT.footerY,
    { size: 22, weight: 400, color: C.ink3, align: 'center' }
  );
  drawText(ctx, '宝宝成长记 · 数据仅保存在本机', W / 2, LAYOUT.brandY, {
    size: 19,
    weight: 400,
    color: '#BBA99D',
    align: 'center',
  });

  return canvas;
}

function drawMilkChart(ctx, report) {
  const chart = LAYOUT.chart;
  drawCard(ctx, chart.x, chart.y, chart.w, chart.h, chart.r, C.surface);

  drawText(ctx, report.buckets === 'week' ? '奶量趋势 · 周均' : '奶量趋势', chart.x + 48, chart.y + 52, {
    size: 28,
    weight: 700,
    color: C.ink,
  });
  const chartNote = report.seriesTrimmed
    ? '日均 ' + fmtInt(report.averages.milkMl) + ' ml · 自 ' + formatDateCN(report.seriesStartKey) + ' 起'
    : '日均 ' + fmtInt(report.averages.milkMl) + ' ml · 共 ' + report.recordedDays + ' 天';
  drawText(
    ctx,
    chartNote,
    chart.x + chart.w - 48,
    chart.y + 52,
    { size: 21, weight: 400, color: C.ink3, align: 'right' }
  );

  const plotLeft = chart.x + 104;
  const plotRight = chart.x + chart.w - 48;
  const plotTop = chart.y + 96;
  const plotBottom = chart.y + chart.h - 66;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const points = report.series.milk || [];
  const values = points.map((point) => Number(point.value) || 0);
  const maxValue = Math.max.apply(null, values.concat([0]));

  ctx.save();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  [1 / 3, 2 / 3, 1].forEach((ratio) => {
    const y = plotBottom - ratio * plotH;
    ctx.beginPath();
    ctx.setLineDash([3, 8]);
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.strokeStyle = '#E4D5C8';
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();
  ctx.restore();

  if (!points.length || maxValue <= 0) {
    drawText(ctx, '这一周期还没有奶量记录', (plotLeft + plotRight) / 2, plotTop + plotH / 2, {
      size: 24,
      weight: 400,
      color: C.ink3,
      align: 'center',
    });
    return;
  }

  const yMax = niceMax(maxValue * 1.1);
  const toY = (value) => plotBottom - (Math.max(0, value) / yMax) * plotH;
  drawText(ctx, String(Math.round(yMax)), plotLeft - 18, plotTop + 8, {
    size: 20,
    weight: 400,
    color: C.ink3,
    align: 'right',
  });
  drawText(ctx, '0', plotLeft - 18, plotBottom + 7, {
    size: 20,
    weight: 400,
    color: C.ink3,
    align: 'right',
  });

  const count = points.length;
  const step = plotW / count;
  const barW = Math.max(6, Math.min(34, step * 0.56));
  const radius = Math.min(6, barW / 2);

  const barGradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  barGradient.addColorStop(0, C.coral);
  barGradient.addColorStop(1, 'rgba(246,198,180,0.75)');

  values.forEach((value, index) => {
    const cx = plotLeft + step * (index + 0.5);
    const x = cx - barW / 2;
    const y = toY(value);
    const barH = Math.max(3, plotBottom - y);
    ctx.save();
    ctx.fillStyle = barGradient;
    topRoundRectPath(ctx, x, plotBottom - barH, barW, barH, radius);
    ctx.fill();
    ctx.restore();
  });

  const avg = Number(report.averages.milkMl) || 0;
  if (avg > 0) {
    const avgY = toY(avg);
    ctx.save();
    ctx.strokeStyle = 'rgba(210,112,90,0.62)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(plotLeft, avgY);
    ctx.lineTo(plotRight, avgY);
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '日均 ' + fmtInt(avg) + ' ml', plotRight, Math.max(plotTop + 16, avgY - 12), {
      size: 20,
      weight: 500,
      color: C.coralDeep,
      align: 'right',
    });
  }

  const indices = labelIndices(count, 6);
  indices.forEach((index) => {
    const cx = plotLeft + step * (index + 0.5);
    const label = points[index].label == null ? '' : String(points[index].label);
    let align = 'center';
    if (cx < plotLeft + 14) align = 'left';
    else if (cx > plotRight - 14) align = 'right';
    drawText(ctx, label, cx, plotBottom + 42, { size: 20, weight: 400, color: C.ink3, align });
  });
}

function drawProgressBar(ctx, x, y, w, h, ratio, color) {
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = C.bgDeep;
  ctx.fill();
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (safeRatio > 0) {
    const fillW = Math.max(h, w * safeRatio);
    roundRectPath(ctx, x, y, Math.min(w, fillW), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function shortMonthDay(key) {
  const parts = String(key || '').split('-');
  if (parts.length !== 3) return '';
  return Number(parts[1]) + '/' + Number(parts[2]);
}

function drawCompletionCards(ctx, report) {
  const area = LAYOUT.completion;
  const effective = report.effectiveDays;
  const supplements = report.supplements || [];
  const cares = report.cares || [];
  const early = report.early || [];
  const suppDone = supplements.reduce((acc, item) => acc + item.doneDays, 0);
  const careDone = cares.reduce((acc, item) => acc + item.doneDays, 0);
  const suppRate = effective > 0 ? suppDone / (effective * Math.max(1, supplements.length)) : 0;
  const careRate = effective > 0 ? careDone / (effective * Math.max(1, cares.length)) : 0;
  const earlyDone = early.reduce((acc, item) => acc + item.doneDays, 0);
  const earlyMin = early.reduce((acc, item) => acc + item.minutes, 0);
  const earlyDays = report.days.filter((day) => day.summary && day.summary.earlyDone > 0).length;
  const trimSuffix = report.seriesTrimmed
    ? ' · 自 ' + shortMonthDay(report.effectiveStartKey) + ' 起'
    : '';

  const cards = [
    {
      x: area.x,
      label: '补剂完成率',
      value: Math.round(suppRate * 100) + '%',
      ratio: suppRate,
      color: C.sage,
      meta: suppDone + ' 项次 / ' + effective + ' 天' + trimSuffix,
    },
    {
      x: area.x + area.w + area.gap,
      label: '护理完成率',
      value: Math.round(careRate * 100) + '%',
      ratio: careRate,
      color: C.sky,
      meta: careDone + ' 项次 / ' + effective + ' 天' + trimSuffix,
    },
    {
      x: area.x + (area.w + area.gap) * 2,
      label: '早教陪伴',
      value: earlyDone + ' 次',
      ratio: effective > 0 ? earlyDays / effective : 0,
      color: C.amber,
      meta: earlyDays + '/' + effective + ' 天 · ' + earlyMin + ' 分钟',
    },
  ];

  cards.forEach((card) => {
    drawCard(ctx, card.x, area.y, area.w, area.h, area.r, C.surface);
    drawText(ctx, card.label, card.x + 28, area.y + 50, { size: 22, weight: 500, color: C.ink2 });
    drawText(ctx, card.value, card.x + 28, area.y + 122, { size: 48, weight: 700, color: C.ink });
    drawProgressBar(ctx, card.x + 28, area.y + 150, area.w - 56, 12, card.ratio, card.color);
    drawText(ctx, card.meta, card.x + 28, area.y + 196, { size: 19, weight: 400, color: C.ink3 });
  });
}

/* ------------------------------------------------------------------ */
/* 数字格式化（与 stats 页保持一致）                                     */
/* ------------------------------------------------------------------ */

function fmtInt(value) {
  const n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
