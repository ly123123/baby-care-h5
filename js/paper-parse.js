/**
 * 纸质记录文本解析器（纯函数，不联网）
 *
 * 输入：iPhone 实况文本 / 手动粘贴出来的整页文字
 * 输出：可编辑的当天结构化数据，所有字段都只作“建议值”，
 *      由用户核对后再写入 store。
 */

const SUPPLEMENT_LABELS = [
  { key: 'ad', label: 'AD' },
  { key: 'd3', label: 'D3' },
  { key: 'dha', label: 'DHA' },
  { key: 'iron', label: '铁' },
  { key: 'water', label: '水' },
  { key: 'probiotic', label: '益生菌' },
  { key: 'lactase', label: '乳糖酶' },
];

const CARE_LABELS = [
  { key: 'face', label: '洗脸' },
  { key: 'mouth', label: '口/鼻清洁' },
  { key: 'hands', label: '洗手' },
  { key: 'nails', label: '剪指甲' },
  { key: 'bath', label: '洗澡' },
  { key: 'lotion', label: '保湿' },
];

const EARLY_LABELS = [
  { key: 'visual', label: '视觉训练' },
  { key: 'hearing', label: '听觉训练' },
  { key: 'gross', label: '大动作训练' },
  { key: 'fine', label: '精细动作' },
];

const WEATHER = ['晴', '多云', '阴', '雨', '雪'];
const MOOD = ['开心', '平静', '困倦', '闹腾'];
const COLORS = ['黄', '绿', '棕', '黑', '红'];
const CHECK_MARK = '[✓√✔☑●]';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeText(input) {
  return String(input || '')
    .replace(/\r/g, '\n')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[．]/g, '.')
    .replace(/[／]/g, '/')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function makeDateKey(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return '';
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  return y + '-' + pad2(m) + '-' + pad2(d);
}

function extractDate(text, options) {
  const today = options.todayKey || '';
  const yearHint = options.year || (today ? Number(today.slice(0, 4)) : new Date().getFullYear());
  const match = text.match(/(?:日期\s*[:：]?\s*)?(\d{1,2})\s*[.\-/月]\s*(\d{1,2})\s*日?/);
  if (!match) return { key: '', parsed: false };
  let year = yearHint;
  let key = makeDateKey(year, match[1], match[2]);
  if (key && today && key > today) {
    // 跨年：12 月录入 1 月的纸，回退到上一年
    const prev = makeDateKey(year - 1, match[1], match[2]);
    if (prev) key = prev;
  }
  return { key, parsed: Boolean(key) };
}

function lineHasTotalMilk(line) {
  return /总奶量|总奶|合计|奶量合计/.test(line);
}

function extractAmounts(line) {
  const out = [];
  // OCR 常把 "120+20" 读成 "120+2°"；先把 +2° 还原为 +20
  const normalized = line.replace(/(\+\s*\d)\s*[°º]/g, '$10');
  // 允许 "120+20ml"、"120+2°ml"、"130 ml"；不要求 ml 后是单词边界（"130ml1"也要识别）
  const re = /(\d{2,3})(?:\s*\+\s*(\d{1,3}))?\s*[°º]?\s*(?:ml|毫升)/gi;
  let match;
  while ((match = re.exec(normalized)) !== null) {
    const value = Number(match[1]) + Number(match[2] || 0);
    const before = normalized.slice(Math.max(0, match.index - 24), match.index);
    // 总奶量后面的数字不是单次喂养，跳过
    if (/总奶量|总奶|合计|奶量合计/.test(before)) continue;
    // 单次奶量合理范围；<20 多半是误识别
    if (value >= 20 && value <= 500) out.push(value);
  }
  return out;
}

function extractTimes(line) {
  const out = [];
  const re = /(?:^|[^0-9])([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?![0-9])/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    out.push(pad2(Number(match[1])) + ':' + match[2]);
  }
  return out;
}

function pairFeeds(text) {
  // 实况文本/OCR 经常把“时间”和“奶量”拆到不同行，先把整段压平再按出现顺序配对。
  const flat = text.replace(/\s*\n\s*/g, ' ');
  const times = extractTimes(flat);
  const amounts = extractAmounts(flat);

  // 同一时间只保留第一次出现，避免尿布时间/表头时间混入
  const uniqueTimes = [];
  const timeSeen = new Set();
  times.forEach((time) => {
    if (timeSeen.has(time)) return;
    timeSeen.add(time);
    uniqueTimes.push(time);
  });

  const pairs = [];
  const count = Math.min(uniqueTimes.length, amounts.length);
  for (let i = 0; i < count; i += 1) {
    pairs.push({ time: uniqueTimes[i], amountMl: amounts[i] });
  }

  const seen = new Set();
  const feeds = [];
  pairs.forEach((pair) => {
    const key = pair.time + '|' + pair.amountMl;
    if (seen.has(key)) return;
    seen.add(key);
    feeds.push({
      time: pair.time,
      kind: 'formula',
      amountMl: pair.amountMl,
      minutes: 0,
      note: '',
    });
  });
  feeds.sort((a, b) => a.time.localeCompare(b.time));
  return {
    feeds,
    unmatchedTimes: uniqueTimes.length > amounts.length,
    unmatchedAmounts: amounts.length > uniqueTimes.length,
  };
}

function hasCheckedMark(text, label) {
  const safe = label.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');
  const re = new RegExp('(?:' + CHECK_MARK + '\\s*' + safe + '|' + safe + '\\s*' + CHECK_MARK + ')');
  return re.test(text);
}

function extractCheckedList(text, defs) {
  const out = [];
  defs.forEach((def) => {
    if (hasCheckedMark(text, def.label)) out.push(def.key);
  });
  return out;
}

function extractEarly(text) {
  const out = {};
  EARLY_LABELS.forEach((def) => {
    const lines = text.split('\n');
    const hit = lines.find((line) => line.indexOf(def.label) >= 0);
    if (!hit) return;
    const m = hit.match(/(\d{1,3})\s*(?:分钟|分)/);
    if (m) {
      out[def.key] = { done: true, minutes: Number(m[1]), item: '' };
    }
  });
  return out;
}

function extractSleep(text) {
  const total = text.match(/睡眠时长\s*[:：]?\s*(\d{1,2})\s*(?:小时|h|钟头)\s*(?:(\d{1,2})\s*(?:分钟|分))?/i);
  let totalMinutes = 0;
  if (total) totalMinutes = Number(total[1]) * 60 + Number(total[2] || 0);
  return { totalMinutes, start: '', end: '' };
}

function extractDiaper(text) {
  const countMatch = text.match(/尿布张数\s*[:：]?\s*(\d{1,2})/);
  const poopMatch = text.match(/大便次数\s*[:：]?\s*(\d{1,2})/);
  let color = '';
  if (text.indexOf('金黄') >= 0) color = '黄';
  else {
    for (let i = 0; i < COLORS.length; i += 1) {
      if (text.indexOf(COLORS[i]) >= 0 && text.indexOf('颜色') >= 0) {
        color = COLORS[i];
        break;
      }
    }
  }
  let amount = '';
  const amountMatch = text.match(/(?:量\s*[:：]?\s*)(少|中|多)/);
  if (amountMatch) amount = amountMatch[1];
  return {
    count: countMatch ? Number(countMatch[1]) : 0,
    poopCount: poopMatch ? Number(poopMatch[1]) : 0,
    color,
    amount,
  };
}

function extractNote(text) {
  const lines = text.split('\n').map((line) => line.trim());
  const idx = lines.findIndex((line) => line.indexOf('今日心得') >= 0);
  if (idx < 0) return '';
  const first = lines[idx].replace(/^.*今日心得\s*[:：]?\s*/, '').trim();
  if (first) return first.slice(0, 300);
  // 只取下一行，且必须是明显不像栏目标题的内容；避免把整页 OCR 误当心得
  const next = (lines[idx + 1] || '').trim();
  if (!next) return '';
  if (/^(项目|类别|时间|总奶量|大便次数|尿布张数|睡眠|疫苗|不良反应|早教|护理|补剂|视觉训练|听觉训练|大动作|精细动作|洗脸|洗手|洗澡|保湿)/.test(next)) return '';
  return next.slice(0, 300);
}

function cleanFieldValue(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^(项目|类别|时间|总奶量|大便次数|尿布张数|睡眠|疫苗|不良反应|早教|护理|补剂)/.test(v)) return '';
  return v.slice(0, 100);
}

function extractMisc(text) {
  const weatherMatch = text.match(/天气\s*[:：]?\s*(晴|多云|阴|雨|雪)/);
  const moodMatch = text.match(/精神状态\s*[:：]?\s*(开心|平静|困倦|闹腾)/);
  const tempMatch = text.match(/体温\s*[:：]?\s*(\d{2}(?:\.\d)?)/);
  const lines = text.split('\n').map((line) => line.trim());
  let vaccine = '';
  let adverse = '';
  lines.forEach((line) => {
    if (!vaccine && line.indexOf('疫苗') >= 0) {
      vaccine = cleanFieldValue(line.replace(/^.*疫苗\s*[:：]?\s*/, ''));
    }
    if (!adverse && line.indexOf('不良反应') >= 0) {
      adverse = cleanFieldValue(line.replace(/^.*不良反应\s*[:：]?\s*/, ''));
    }
  });
  return {
    weather: weatherMatch ? weatherMatch[1] : '',
    mood: moodMatch ? moodMatch[1] : '',
    temperature: tempMatch ? tempMatch[1] : '',
    vaccine,
    adverse,
  };
}

/**
 * @param {string} input 实况文本/粘贴文本
 * @param {{dateKey?: string, todayKey?: string, year?: number}} options
 */
export function parsePaperText(input, options = {}) {
  const text = normalizeText(input);
  const fallbackDate = options.dateKey || options.todayKey || '';
  const warnings = [];
  if (!text) {
    return {
      dateKey: fallbackDate,
      dateParsed: false,
      feeds: [],
      totalMilk: 0,
      diaper: { count: 0, poopCount: 0, color: '', amount: '' },
      supplements: [],
      cares: [],
      early: {},
      sleep: { totalMinutes: 0, start: '', end: '' },
      note: '',
      weather: '',
      mood: '',
      temperature: '',
      vaccine: '',
      adverse: '',
      warnings: ['没有识别文本，请先粘贴实况文本'],
    };
  }

  const dateInfo = extractDate(text, {
    todayKey: options.todayKey || fallbackDate,
    year: options.year,
  });
  let dateKey = dateInfo.key || fallbackDate;
  if (!dateInfo.parsed) warnings.push('未识别到日期，已使用当前选中的日期');

  const feedInfo = pairFeeds(text);
  const feeds = feedInfo.feeds;
  if (!feeds.length) warnings.push('未识别到喂养记录，请手动补充');
  else warnings.push('喂养时间和奶量是按文字顺序配对的，请逐条核对');
  if (feedInfo.unmatchedTimes || feedInfo.unmatchedAmounts) {
    warnings.push('时间与奶量数量不一致，可能有遗漏，请核对');
  }

  const totalMatch = text.match(/总奶量\s*[:：]?\s*(\d{2,4})\s*(?:ml|毫升)?/i);
  const feedSum = feeds.reduce((sum, feed) => sum + feed.amountMl, 0);
  const totalMilk = totalMatch ? Number(totalMatch[1]) : feedSum;
  if (totalMatch && feedSum && Math.abs(totalMilk - feedSum) > 60) {
    warnings.push('纸上总奶量 ' + totalMilk + ' ml，单次合计 ' + feedSum + ' ml，请核对');
  }

  const diaper = extractDiaper(text);
  if (!diaper.count && !diaper.poopCount) warnings.push('未识别到尿布汇总，请手动填写');
  else warnings.push('尿布明细时间无法从汇总中还原，保存时会记在导入时间');

  const supplements = extractCheckedList(text, SUPPLEMENT_LABELS);
  const cares = extractCheckedList(text, CARE_LABELS);
  if (!supplements.length && !cares.length) {
    warnings.push('补剂和护理的勾选无法可靠识别，请在下方手动确认');
  }

  const early = extractEarly(text);
  const sleep = extractSleep(text);
  if (!sleep.totalMinutes) warnings.push('未识别到睡眠总时长，可在下方补填或稍后记录');

  const misc = extractMisc(text);
  const note = extractNote(text);

  return {
    dateKey,
    dateParsed: dateInfo.parsed,
    feeds,
    totalMilk,
    diaper,
    supplements,
    cares,
    early,
    sleep,
    note,
    weather: misc.weather,
    mood: misc.mood,
    temperature: misc.temperature,
    vaccine: misc.vaccine,
    adverse: misc.adverse,
    warnings,
  };
}

export { SUPPLEMENT_LABELS, CARE_LABELS, EARLY_LABELS };
