/**
 * 宝宝成长记 · 纯 SVG 图表（无任何外部依赖）
 * 导出：barChart / groupedBarChart / lineChart
 *
 * 设计说明：
 * - 图表以“容器实际像素尺寸”建立 viewBox（1 单位 = 1 CSS 像素），
 *   再以 width/height 100% 填充容器，保证中文标签清晰、不横向拉伸；
 *   容器尺寸变化（横竖屏）时自动重绘。
 * - 颜色全部来自 styles.css 的 CSS 变量，若变量缺失使用同款回退色。
 * - 空数据（全 0 / 无标签）渲染柔和占位，不出现除零、NaN。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const FALLBACK_COLORS = {
  '--coral': '#E58A72',
  '--coral-deep': '#D2705A',
  '--coral-soft': '#FBE4DC',
  '--peach': '#F6C6B4',
  '--sage': '#7F9C83',
  '--sage-soft': '#E7EFE6',
  '--amber': '#D9A24C',
  '--lilac': '#A98FBF',
  '--sky': '#7FA6B8',
  '--ink': '#40342E',
  '--ink-2': '#7D6C63',
  '--ink-3': '#A8978C',
  '--line': '#EFE2D8',
  '--surface': '#FFFDFB',
  '--bg': '#FAF5EF',
};

/** 解析 CSS 变量为真实颜色（渐变停止点、Canvas 等场景更稳） */
function resolveColor(color) {
  if (!color) return FALLBACK_COLORS['--coral'];
  const name = String(color).trim();
  if (name.startsWith('var(')) {
    const varName = name.slice(4, -1).split(',')[0].trim();
    try {
      const fromCss = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      if (fromCss) return fromCss;
    } catch (err) {
      /* 非浏览器环境忽略 */
    }
    return FALLBACK_COLORS[varName] || FALLBACK_COLORS['--coral'];
  }
  return name;
}

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 默认数值格式化：整数不带小数点，小数最多 1 位 */
function formatNumber(value) {
  const n = toNum(value);
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString('zh-CN');
  if (Math.abs(n) >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

/** 取一个好看的坐标上限（1/2/2.5/5/10 × 10^n） */
function niceMax(value) {
  const v = Math.max(0, toNum(value));
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

/** 读取容器尺寸：优先真实布局尺寸，隐藏时回退到设计高度 */
function measure(el, fallbackHeight) {
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0 };
  const width = Math.max(180, Math.round(rect.width || el.clientWidth || 354));
  const height = Math.max(120, Math.round(rect.height || el.clientHeight || fallbackHeight || 190));
  return { width, height };
}

/* 容器尺寸变化时统一重绘（窗口横竖屏 / 分屏） */
const resizeRegistry = new Map();
let resizeBound = false;

function bindResize(el, draw) {
  resizeRegistry.set(el, draw);
  if (resizeBound || typeof window === 'undefined') return;
  resizeBound = true;
  let timer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      resizeRegistry.forEach((fn, node) => {
        if (!node.isConnected) {
          resizeRegistry.delete(node);
          return;
        }
        try {
          fn();
        } catch (err) {
          console.error('[charts] 重绘失败', err);
        }
      });
    }, 120);
  });
}

/* ------------------------------------------------------------------ */
/* 图形基础                                                             */
/* ------------------------------------------------------------------ */

/** 顶部圆角矩形（底部直角），用于柱子 */
function barPath(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0.6) return '';
  const rr = radius;
  return (
    'M' + (x) + ' ' + (y + h) +
    'V' + (y + rr) +
    'Q' + x + ' ' + y + ' ' + (x + rr) + ' ' + y +
    'H' + (x + w - rr) +
    'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + rr) +
    'V' + (y + h) +
    'Z'
  );
}

/** x 轴标签抽稀：最多 maxLabels 个，保持首尾 */
function labelIndices(count, maxLabels) {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const out = [];
  const step = (count - 1) / (maxLabels - 1);
  for (let i = 0; i < maxLabels; i += 1) out.push(Math.round(i * step));
  return Array.from(new Set(out)).filter((i) => i >= 0 && i < count);
}

function gridSvg(ctx, yMax, formatValue) {
  const { left, right, top, bottom, width, height } = ctx.pad;
  const plotLeft = left;
  const plotRight = width - right;
  const plotTop = top;
  const plotBottom = height - bottom;
  const toY = (v) => plotBottom - (Math.max(0, v) / yMax) * (plotBottom - plotTop);
  const parts = [];
  const ticks = [0, 1 / 3, 2 / 3, 1];
  ticks.forEach((ratio) => {
    const y = plotBottom - ratio * (plotBottom - plotTop);
    if (ratio === 0) {
      parts.push(
        '<line x1="' + plotLeft + '" y1="' + y.toFixed(1) + '" x2="' + plotRight +
        '" y2="' + y.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>'
      );
    } else {
      parts.push(
        '<line x1="' + plotLeft + '" y1="' + y.toFixed(1) + '" x2="' + plotRight +
        '" y2="' + y.toFixed(1) + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 6" opacity=".7"/>'
      );
    }
  });
  const maxLabel = formatValue(yMax);
  parts.push(
    '<text x="' + (plotLeft - 6) + '" y="' + (plotTop + 4) + '" text-anchor="end" font-size="10.5" fill="var(--ink-3)">' +
    esc(maxLabel) + '</text>'
  );
  parts.push(
    '<text x="' + (plotLeft - 6) + '" y="' + (plotBottom + 1) + '" text-anchor="end" font-size="10.5" fill="var(--ink-3)">0</text>'
  );
  return { parts, toY, plotLeft, plotRight, plotTop, plotBottom };
}

function leftPadFor(label) {
  const len = String(label).length;
  return Math.max(34, Math.min(64, len * 6.4 + 12));
}

function emptyHtml(text) {
  return '<div class="chart-empty st-chart-empty">' + esc(text || '这段时间还没有数据') + '</div>';
}

/* ------------------------------------------------------------------ */
/* 柱状图                                                               */
/* ------------------------------------------------------------------ */

/**
 * 单系列柱状图
 * @param {HTMLElement} el 容器（调用方给固定高度）
 * @param {{labels:string[], values:number[], color?:string, unit?:string, average?:number|null,
 *          height?:number, valueFormat?:Function, emptyText?:string}} options
 */
export function barChart(el, options = {}) {
  if (!el) return;
  const opts = { ...options };
  const draw = () => renderBar(el, opts);
  bindResize(el, draw);
  draw();
}

function renderBar(el, options) {
  const labels = Array.isArray(options.labels) ? options.labels : [];
  const values = (Array.isArray(options.values) ? options.values : []).map(toNum);
  const count = Math.min(labels.length, values.length);
  const labelList = labels.slice(0, count);
  const valueList = values.slice(0, count);
  const emptyText = options.emptyText || '这段时间还没有数据';

  if (!count || !valueList.some((v) => v > 0)) {
    el.innerHTML = emptyHtml(emptyText);
    return;
  }

  const color = resolveColor(options.color || 'var(--coral)');
  const unit = options.unit || '';
  const formatValue = typeof options.valueFormat === 'function' ? options.valueFormat : formatNumber;
  const avg = Number.isFinite(Number(options.average)) ? Number(options.average) : null;
  const { width, height } = measure(el, options.height || 200);

  const maxValue = Math.max(...valueList, avg != null && avg > 0 ? avg : 0);
  const yMax = niceMax(maxValue * 1.08);
  const axisText = formatValue(yMax);
  const pad = {
    left: leftPadFor(axisText),
    right: 10,
    top: 20,
    bottom: 26,
    width,
    height,
  };
  const ctx = {
    pad,
    width,
    height,
    x: (i) => {
      const plotW = width - pad.left - pad.right;
      return pad.left + (plotW / count) * (i + 0.5);
    },
  };
  const grid = gridSvg(ctx, yMax, formatValue);
  const plotW = width - pad.left - pad.right;
  const step = plotW / count;
  const barW = Math.max(3, Math.min(26, step * 0.58));
  const gid = 'stg' + Math.random().toString(36).slice(2, 8);
  const radius = Math.min(5, barW / 2);

  const bars = valueList
    .map((value, i) => {
      const cx = ctx.x(i);
      const x = cx - barW / 2;
      const y = grid.toY(value);
      const barH = Math.max(2, grid.plotBottom - y);
      const y0 = grid.plotBottom - barH;
      const hint = unit ? formatValue(value) + unit : formatValue(value);
      return (
        '<g><title>' + esc((labelList[i] == null ? '' : labelList[i]) + '：' + hint) + '</title>' +
        '<path d="' + barPath(x, y0, barW, barH, radius) + '" fill="url(#' + gid + ')"/></g>'
      );
    })
    .join('');

  let averageLine = '';
  if (avg != null && avg > 0) {
    const avgY = grid.toY(avg);
    let labelY = avgY - 5;
    labelY = Math.max(11, Math.min(grid.plotBottom - 4, labelY));
    averageLine =
      '<line x1="' + grid.plotLeft + '" y1="' + avgY.toFixed(1) + '" x2="' + grid.plotRight +
      '" y2="' + avgY.toFixed(1) + '" stroke="var(--coral-deep)" stroke-width="1.2" stroke-dasharray="4 5" opacity=".55"/>' +
      '<text x="' + grid.plotRight + '" y="' + labelY.toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--ink-2)">' +
      esc('日均 ' + formatValue(avg) + (unit && unit.length <= 2 ? unit : '')) + '</text>';
  }

  const xLabels = labelIndices(count, 7)
    .map((i) => {
      const cx = ctx.x(i);
      let anchor = 'middle';
      if (cx < 12) anchor = 'start';
      else if (cx > width - 12) anchor = 'end';
      return { cx, anchor, text: labelList[i] == null ? '' : String(labelList[i]) };
    })
    .filter((item) => item.text)
    .map(
      (item) =>
        '<text x="' + item.cx.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="' + item.anchor +
        '" font-size="10.5" fill="var(--ink-3)">' + esc(item.text) + '</text>'
    )
    .join('');

  el.innerHTML =
    '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-hidden="true">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + color + '" stop-opacity=".95"/>' +
    '<stop offset="1" stop-color="' + color + '" stop-opacity=".42"/>' +
    '</linearGradient></defs>' +
    grid.parts.join('') +
    bars +
    averageLine +
    xLabels +
    '</svg>';
}

/* ------------------------------------------------------------------ */
/* 分组柱状图                                                           */
/* ------------------------------------------------------------------ */

/**
 * 分组（多系列）柱状图
 * @param {HTMLElement} el
 * @param {{labels:string[], series:{name:string, values:number[], color?:string}[],
 *          unit?:string, height?:number, valueFormat?:Function, emptyText?:string}} options
 */
export function groupedBarChart(el, options = {}) {
  if (!el) return;
  const opts = { ...options };
  const draw = () => renderGroupedBar(el, opts);
  bindResize(el, draw);
  draw();
}

function renderGroupedBar(el, options) {
  const labels = Array.isArray(options.labels) ? options.labels : [];
  const seriesIn = Array.isArray(options.series) ? options.series : [];
  const series = seriesIn
    .map((item) => ({
      name: item && item.name ? String(item.name) : '',
      color: resolveColor((item && item.color) || 'var(--sage)'),
      values: (item && Array.isArray(item.values) ? item.values : []).map(toNum),
    }))
    .filter((item) => item.values.length > 0);
  const count = Math.min(labels.length, ...series.map((s) => s.values.length));
  const emptyText = options.emptyText || '这段时间还没有数据';
  const hasValue = count > 0 && series.some((s) => s.values.slice(0, count).some((v) => v > 0));

  if (!count || !series.length || !hasValue) {
    el.innerHTML = emptyHtml(emptyText);
    return;
  }

  const unit = options.unit || '';
  const formatValue = typeof options.valueFormat === 'function' ? options.valueFormat : formatNumber;
  const { width, height } = measure(el, options.height || 220);
  const allValues = series.flatMap((s) => s.values.slice(0, count));
  const yMax = niceMax(Math.max(...allValues) * 1.08);
  const axisText = formatValue(yMax);
  const pad = {
    left: leftPadFor(axisText),
    right: 10,
    top: 34,
    bottom: 26,
    width,
    height,
  };
  const ctx = {
    pad,
    width,
    height,
    x: (i) => {
      const plotW = width - pad.left - pad.right;
      return pad.left + (plotW / count) * (i + 0.5);
    },
  };
  const grid = gridSvg(ctx, yMax, formatValue);
  const plotW = width - pad.left - pad.right;
  const step = plotW / count;
  const groupW = Math.min(34, step * 0.68);
  const gap = series.length > 1 ? 1.5 : 0;
  const barW = Math.max(2, (groupW - gap * (series.length - 1)) / series.length);
  const gids = series.map(() => 'stg' + Math.random().toString(36).slice(2, 8));
  const radius = Math.min(4, barW / 2);

  const bars = series
    .map((s, si) => {
      const groupStart = -groupW / 2 + si * (barW + gap);
      return s.values
        .slice(0, count)
        .map((value, i) => {
          const x = ctx.x(i) + groupStart;
          const y = grid.toY(value);
          const barH = Math.max(2, grid.plotBottom - y);
          const y0 = grid.plotBottom - barH;
          const hint = unit ? formatValue(value) + unit : formatValue(value);
          return (
            '<g><title>' + esc((labelListSafe(labels, i) || '') + ' · ' + s.name + '：' + hint) + '</title>' +
            '<path d="' + barPath(x, y0, barW, barH, radius) + '" fill="url(#' + gids[si] + ')"/></g>'
          );
        })
        .join('');
    })
    .join('');

  const defs = series
    .map(
      (s, si) =>
        '<linearGradient id="' + gids[si] + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + s.color + '" stop-opacity=".95"/>' +
        '<stop offset="1" stop-color="' + s.color + '" stop-opacity=".42"/>' +
        '</linearGradient>'
    )
    .join('');

  const legend = series
    .map((s, si) => {
      const lx = width - pad.right - (series.length - si) * 62;
      return (
        '<circle cx="' + (lx - 10) + '" cy="13" r="3.2" fill="' + s.color + '"/>' +
        '<text x="' + (lx - 3) + '" y="16.5" font-size="10.5" fill="var(--ink-2)">' + esc(s.name) + '</text>'
      );
    })
    .join('');

  const xLabels = labelIndices(count, 7)
    .map((i) => {
      const cx = ctx.x(i);
      let anchor = 'middle';
      if (cx < 12) anchor = 'start';
      else if (cx > width - 12) anchor = 'end';
      return { cx, anchor, text: labels[i] == null ? '' : String(labels[i]) };
    })
    .filter((item) => item.text)
    .map(
      (item) =>
        '<text x="' + item.cx.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="' + item.anchor +
        '" font-size="10.5" fill="var(--ink-3)">' + esc(item.text) + '</text>'
    )
    .join('');

  el.innerHTML =
    '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-hidden="true">' +
    '<defs>' + defs + '</defs>' +
    grid.parts.join('') +
    legend +
    bars +
    xLabels +
    '</svg>';
}

function labelListSafe(labels, i) {
  return labels[i] == null ? '' : String(labels[i]);
}

/* ------------------------------------------------------------------ */
/* 折线图                                                               */
/* ------------------------------------------------------------------ */

/**
 * 折线图（带柔和面积）
 * @param {HTMLElement} el
 * @param {{labels:string[], values:number[], color?:string, unit?:string, height?:number,
 *          valueFormat?:Function, emptyText?:string}} options
 */
export function lineChart(el, options = {}) {
  if (!el) return;
  const opts = { ...options };
  const draw = () => renderLine(el, opts);
  bindResize(el, draw);
  draw();
}

function renderLine(el, options) {
  const labels = Array.isArray(options.labels) ? options.labels : [];
  const values = (Array.isArray(options.values) ? options.values : []).map(toNum);
  const count = Math.min(labels.length, values.length);
  const labelList = labels.slice(0, count);
  const valueList = values.slice(0, count);
  const emptyText = options.emptyText || '这段时间还没有数据';

  if (!count || !valueList.some((v) => v > 0)) {
    el.innerHTML = emptyHtml(emptyText);
    return;
  }

  const color = resolveColor(options.color || 'var(--sky)');
  const unit = options.unit || '';
  const formatValue = typeof options.valueFormat === 'function' ? options.valueFormat : formatNumber;
  const { width, height } = measure(el, options.height || 200);
  const yMax = niceMax(Math.max(...valueList) * 1.08);
  const axisText = formatValue(yMax);
  const pad = {
    left: leftPadFor(axisText),
    right: 12,
    top: 20,
    bottom: 26,
    width,
    height,
  };
  const ctx = {
    pad,
    width,
    height,
    x: (i) => {
      const plotW = width - pad.left - pad.right;
      if (count === 1) return pad.left + plotW / 2;
      return pad.left + (plotW / (count - 1)) * i;
    },
  };
  const grid = gridSvg(ctx, yMax, formatValue);
  const points = valueList.map((value, i) => ({ x: ctx.x(i), y: grid.toY(value), value }));
  const linePath = points
    .map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1))
    .join(' ');
  const areaPath =
    linePath +
    ' L' + points[points.length - 1].x.toFixed(1) + ' ' + grid.plotBottom.toFixed(1) +
    ' L' + points[0].x.toFixed(1) + ' ' + grid.plotBottom.toFixed(1) + ' Z';
  const gid = 'stg' + Math.random().toString(36).slice(2, 8);

  const dots =
    count <= 16
      ? points
          .map(
            (p, i) =>
              '<g><title>' + esc((labelList[i] == null ? '' : String(labelList[i])) + '：' + formatValue(valueList[i]) + unit) + '</title>' +
              '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.8" fill="var(--surface)" stroke="' + color + '" stroke-width="1.8"/></g>'
          )
          .join('')
      : '';

  const xLabels = labelIndices(count, 7)
    .map((i) => {
      const cx = ctx.x(i);
      let anchor = 'middle';
      if (cx < 12) anchor = 'start';
      else if (cx > width - 12) anchor = 'end';
      return { cx, anchor, text: labelList[i] == null ? '' : String(labelList[i]) };
    })
    .filter((item) => item.text)
    .map(
      (item) =>
        '<text x="' + item.cx.toFixed(1) + '" y="' + (height - 7) + '" text-anchor="' + item.anchor +
        '" font-size="10.5" fill="var(--ink-3)">' + esc(item.text) + '</text>'
    )
    .join('');

  el.innerHTML =
    '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-hidden="true">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + color + '" stop-opacity=".28"/>' +
    '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    grid.parts.join('') +
    '<path d="' + areaPath + '" fill="url(#' + gid + ')"/>' +
    '<path d="' + linePath + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    dots +
    xLabels +
    '</svg>';
}
