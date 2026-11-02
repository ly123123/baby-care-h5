/**
 * 拍照导入纸质记录
 *
 * 安全设计：
 * - 照片只在当前页面内预览，不上传；
 * - 文字由内置 PaddleOCR 在本机 WebAssembly 中识别；
 * - 解析结果只作为建议，必须核对后才会写入当天数据。
 */

import * as store from './store.js';
import { icon, esc, openSheet, toast, confirmDialog, haptic } from './ui.js';
import { parsePaperText } from './paper-parse.js';
import { recognizePaper } from './paper-ocr.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function options(items, selected) {
  return items
    .map((item) => '<option value="' + esc(item.key) + '"' + (item.key === selected ? ' selected' : '') + '>' + esc(item.label) + '</option>')
    .join('');
}

function feedRow(feed) {
  const kind = feed.kind || 'formula';
  const time = feed.time || '';
  const amount = feed.amountMl || '';
  const minutes = feed.minutes || '';
  return (
    '<div class="pi-feed-row">' +
      '<div class="pi-feed-main">' +
        '<input class="input pi-feed-time" type="time" value="' + esc(time) + '" aria-label="喂奶时间">' +
        '<select class="input pi-feed-kind" aria-label="喂养方式">' + options(store.FEED_KINDS, kind) + '</select>' +
        '<button type="button" class="pi-icon-btn" data-pi-del-feed aria-label="删除这条">' + icon('close', 16) + '</button>' +
      '</div>' +
      '<div class="pi-feed-sub">' +
        '<label class="pi-mini-field"><span>奶量</span><span class="input-unit"><input class="input num pi-feed-amount" type="number" inputmode="numeric" min="0" max="500" step="5" value="' + esc(String(amount)) + '" placeholder="0"><em>ml</em></span></label>' +
        '<label class="pi-mini-field"><span>亲喂时长</span><span class="input-unit"><input class="input num pi-feed-minutes" type="number" inputmode="numeric" min="0" max="120" step="1" value="' + esc(String(minutes)) + '" placeholder="0"><em>分钟</em></span></label>' +
      '</div>' +
    '</div>'
  );
}

function checkboxes(defs, selected, group) {
  const set = new Set(selected || []);
  return defs
    .map(
      (def) =>
        '<label class="pi-check"><input type="checkbox" data-pi-' + group + '="' + esc(def.key) + '"' + (set.has(def.key) ? ' checked' : '') + '><span>' + esc(def.label) + '</span></label>'
    )
    .join('');
}

function earlyRows(entries) {
  return store.EARLY_EDU.map((def) => {
    const item = entries && entries[def.key];
    const checked = item && item.done;
    return (
      '<label class="pi-early-row">' +
        '<span class="pi-check"><input type="checkbox" data-pi-early="' + esc(def.key) + '"' + (checked ? ' checked' : '') + '><span>' + esc(def.label) + '</span></span>' +
        '<span class="input-unit pi-early-min"><input class="input num" type="number" inputmode="numeric" min="0" max="180" step="1" data-pi-early-min="' + esc(def.key) + '" value="' + (checked && item.minutes ? esc(String(item.minutes)) : '') + '" placeholder="0"><em>分钟</em></span>' +
      '</label>'
    );
  }).join('');
}

function reviewHtml(model) {
  const feeds = model.feeds || [];
  const warnings = model.warnings || [];
  const warningHtml = warnings.length
    ? '<div class="pi-warns"><strong>' + icon('info', 15) + ' 请核对</strong>' + warnings.map((w) => '<p>' + esc(w) + '</p>').join('') + '</div>'
    : '<div class="pi-ok">' + icon('check', 15) + ' 已识别，请逐项核对后保存</div>';

  return (
    '<div class="pi-review-head"><span class="pi-step">3</span><div><h3>核对后写入当天</h3><p>识别只是建议值，保存前请对照照片检查。</p></div><button type="button" class="pi-photo-link" data-pi-goto-photo>对照照片</button></div>' +
    warningHtml +
    '<label class="field pi-date-field"><span class="field-label">记录到哪一天</span><input class="input" id="pi-date" type="date" max="' + esc(store.todayKey()) + '" value="' + esc(model.dateKey || store.todayKey()) + '"></label>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>喂养</h4><span class="pi-total">' + (model.totalMilk ? '纸上总量 <b>' + esc(String(model.totalMilk)) + '</b> ml · ' : '') + '当前 <b id="pi-total">0</b> ml</span></div>' +
      '<div id="pi-feeds">' + (feeds.length ? feeds.map(feedRow).join('') : '') + '</div>' +
      '<button type="button" class="btn btn-soft btn-block pi-add-btn" data-pi-add-feed>' + icon('plus', 15) + ' 添加一条喂养</button>' +
      '<p class="pi-micro">母乳亲喂填时长，瓶喂/配方奶填 ml；时间按纸质表填写。</p>' +
    '</section>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>尿布汇总</h4></div>' +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">尿布总数</span><input class="input num" id="pi-diaper-count" type="number" inputmode="numeric" min="0" max="40" value="' + esc(String(model.diaper && model.diaper.count || 0)) + '"></label>' +
        '<label class="field"><span class="field-label">大便次数</span><input class="input num" id="pi-poop-count" type="number" inputmode="numeric" min="0" max="40" value="' + esc(String(model.diaper && model.diaper.poopCount || 0)) + '"></label>' +
      '</div>' +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">大便颜色</span><select class="input" id="pi-diaper-color"><option value="">未记录</option>' + options(store.DIAPER_COLORS.map((x) => ({ key: x, label: x })), model.diaper && model.diaper.color) + '</select></label>' +
        '<label class="field"><span class="field-label">量</span><select class="input" id="pi-diaper-amount"><option value="">未记录</option>' + options(store.DIAPER_AMOUNTS.map((x) => ({ key: x, label: x })), model.diaper && model.diaper.amount) + '</select></label>' +
      '</div>' +
      '<p class="pi-micro">纸质表只有汇总时，会按汇总生成记录，时间记为导入时间，可在记录页调整。</p>' +
    '</section>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>睡眠</h4><span class="pi-total">识别总时长：<b id="pi-sleep-total">' + esc(String(model.sleep && model.sleep.totalMinutes || 0)) + '</b> 分钟</span></div>' +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">开始（可选）</span><input class="input" id="pi-sleep-start" type="time" value=""></label>' +
        '<label class="field"><span class="field-label">结束（可选）</span><input class="input" id="pi-sleep-end" type="time" value=""></label>' +
      '</div>' +
      '<p class="pi-micro">' + (model.sleep && model.sleep.totalMinutes ? '识别到总时长 ' + esc(String(model.sleep.totalMinutes)) + ' 分钟；不填起止时间时不会写入睡眠统计，会补充到今日心得备注。' : '纸上没有明确起止时间时留空即可，稍后可在睡眠记录里补。') + '</p>' +
    '</section>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>补剂</h4><span class="pi-total">请按纸上勾选核对</span></div>' +
      '<div class="pi-checks">' + checkboxes(store.SUPPLEMENTS, model.supplements, 'supplement') + '</div>' +
    '</section>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>护理</h4><span class="pi-total">请按纸上勾选核对</span></div>' +
      '<div class="pi-checks">' + checkboxes(store.CARES, model.cares, 'care') + '</div>' +
    '</section>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>早教</h4></div>' +
      '<div class="pi-early-list">' + earlyRows(model.early) + '</div>' +
    '</section>' +

    '<section class="pi-block">' +
      '<div class="pi-block-head"><h4>状态与心得</h4></div>' +
      '<div class="field-grid">' +
        '<label class="field"><span class="field-label">天气</span><select class="input" id="pi-weather"><option value="">未记录</option>' + store.WEATHER_OPTIONS.map((x) => '<option' + (x === model.weather ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span class="field-label">精神</span><select class="input" id="pi-mood"><option value="">未记录</option>' + store.MOOD_OPTIONS.map((x) => '<option' + (x === model.mood ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<label class="field"><span class="field-label">体温</span><input class="input" id="pi-temperature" type="text" maxlength="8" value="' + esc(model.temperature || '') + '" placeholder="例如 36.5"></label>' +
      '<label class="field"><span class="field-label">疫苗</span><input class="input" id="pi-vaccine" type="text" maxlength="200" value="' + esc(model.vaccine || '') + '" placeholder="今天接种的疫苗"></label>' +
      '<label class="field"><span class="field-label">不良反应</span><input class="input" id="pi-adverse" type="text" maxlength="200" value="' + esc(model.adverse || '') + '" placeholder="没有可留空"></label>' +
      '<label class="field"><span class="field-label">今日心得</span><textarea class="input pi-note" id="pi-note" maxlength="2000" rows="4" placeholder="从纸上抄下今天的心得，或稍后补写">' + esc(model.note || '') + '</textarea></label>' +
    '</section>' +

    '<div class="pi-save-card">' +
      '<p class="pi-micro">保存会覆盖当天已有的喂养、尿布、睡眠、补剂、护理、早教和心得记录。</p>' +
      '<button type="button" class="btn btn-primary btn-block" data-pi-save>' + icon('check', 17) + ' 核对无误，保存到当天</button>' +
    '</div>'
  );
}

function collectFeeds(review) {
  const feeds = [];
  $$('.pi-feed-row', review).forEach((row) => {
    const time = $('.pi-feed-time', row).value;
    const kind = $('.pi-feed-kind', row).value;
    const amount = Number($('.pi-feed-amount', row).value) || 0;
    const minutes = Number($('.pi-feed-minutes', row).value) || 0;
    if (!time) return;
    if (kind === 'breast') {
      if (minutes > 0) feeds.push({ time, kind, minutes, amountMl: 0, side: 'both', note: '纸质表导入' });
    } else if (amount > 0) {
      feeds.push({ time, kind, amountMl: amount, minutes: 0, side: 'both', note: '纸质表导入' });
    }
  });
  return feeds;
}

function updateTotal(review) {
  const total = collectFeeds(review).reduce((sum, feed) => sum + feed.amountMl, 0);
  const el = $('#pi-total', review);
  if (el) el.textContent = String(total);
}

function countExisting(day) {
  return (
    day.feeds.length +
    day.diapers.length +
    day.sleeps.length +
    Object.keys(day.supplements || {}).length +
    Object.keys(day.cares || {}).length +
    Object.keys(day.early || {}).length +
    (day.note ? 1 : 0)
  );
}

export function openPaperImport(options = {}) {
  const initialDate = options.dateKey || store.todayKey();
  let photoUrl = '';
  let selectedFile = null;

  const body =
    '<div class="pi">' +
      '<div class="pi-privacy">' + icon('shield', 15) + ' 照片和文字只在本机处理，不会上传；识别结果需你核对后才会保存。</div>' +

      '<section class="pi-card">' +
        '<div class="pi-card-head"><span class="pi-step">1</span><div><h3>拍下纸质记录</h3><p>整张纸入镜，光线均匀，字迹清晰。</p></div></div>' +
        '<div class="pi-photo-actions">' +
          '<button type="button" class="btn btn-soft" data-pi-pick="camera">' + icon('camera', 16) + ' 拍照</button>' +
          '<button type="button" class="btn btn-soft" data-pi-pick="library">' + icon('image', 16) + ' 从相册选择</button>' +
        '</div>' +
        '<input id="pi-camera" type="file" accept="image/*" capture="environment" hidden>' +
        '<input id="pi-library" type="file" accept="image/*" hidden>' +
        '<div id="pi-photo-wrap" class="pi-photo-wrap is-hidden"><img id="pi-photo" alt="纸质记录照片"><button type="button" class="pi-photo-clear" data-pi-clear>移除照片</button></div>' +
        '<div id="pi-ocr-wrap" class="pi-ocr-wrap is-hidden">' +
          '<div class="pi-ocr-actions">' +
            '<button type="button" class="btn btn-primary" data-pi-ocr>' + icon('sparkle', 16) + ' 本地 OCR 识别</button>' +
            '<button type="button" class="btn btn-soft" data-pi-rotate>' + icon('restore', 16) + ' 旋转 90°</button>' +
          '</div>' +
          '<p class="pi-ocr-status" id="pi-ocr-status"></p>' +
          '<p class="pi-micro">首次识别需下载约 60MB 本机 OCR 文件（仅一次），之后可离线使用；照片不上传。</p>' +
        '</div>' +
      '</section>' +

      '<section class="pi-card">' +
        '<div class="pi-card-head"><span class="pi-step">2</span><div><h3>核对识别文字</h3><p>本机 PaddleOCR 识别；识别结果可编辑。</p></div></div>' +
        '<div class="pi-text-actions">' +
          '<button type="button" class="btn btn-soft" data-pi-paste>' + icon('copy', 16) + ' 粘贴文字</button>' +
          '<button type="button" class="btn btn-primary" data-pi-parse>' + icon('sparkle', 16) + ' 自动解析</button>' +
        '</div>' +
        '<textarea class="input pi-textarea" id="pi-text" rows="8" placeholder="识别结果会自动出现在这里；也可以长按粘贴…"></textarea>' +
        '<p class="pi-micro">首次识别会下载模型；识别完成后文字仍会保留，可手动修正。若方向不对，点上面的「旋转 90°」后重试。</p>' +
      '</section>' +

      '<div id="pi-review" class="pi-review is-hidden"></div>' +
    '</div>';

  const sheet = openSheet({
    title: '拍照导入纸质记录',
    subtitle: store.formatDateCN(initialDate, true) + ' · 本机识别',
    body,
    onClose() {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = '';
      selectedFile = null;
    },
    onMount({ root, close }) {
      const review = $('#pi-review', root);
      const textarea = $('#pi-text', root);
      let saving = false;
      const photoWrap = $('#pi-photo-wrap', root);
      const photoImg = $('#pi-photo', root);
      const ocrWrap = $('#pi-ocr-wrap', root);
      const ocrStatus = $('#pi-ocr-status', root);
      let photoRotation = 0;

      function setPhoto(file) {
        if (!file) return;
        if (!/^image\//.test(file.type)) {
          toast('请选择图片文件', { icon: 'info' });
          return;
        }
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        selectedFile = file;
        photoRotation = 0;
        photoUrl = URL.createObjectURL(file);
        photoImg.style.transform = '';
        photoImg.src = photoUrl;
        photoWrap.classList.remove('is-hidden');
        ocrWrap.classList.remove('is-hidden');
        ocrStatus.textContent = '';
        haptic();
      }

      function clearPhoto() {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoUrl = '';
        selectedFile = null;
        photoRotation = 0;
        photoImg.style.transform = '';
        photoImg.removeAttribute('src');
        photoWrap.classList.add('is-hidden');
        ocrWrap.classList.add('is-hidden');
        ocrStatus.textContent = '';
      }

      $$('[data-pi-pick]', root).forEach((button) => {
        button.addEventListener('click', () => {
          const mode = button.getAttribute('data-pi-pick');
          const input = mode === 'camera' ? $('#pi-camera', root) : $('#pi-library', root);
          input.value = '';
          input.click();
        });
      });
      $('#pi-camera', root).addEventListener('change', (event) => setPhoto(event.target.files && event.target.files[0]));
      $('#pi-library', root).addEventListener('change', (event) => setPhoto(event.target.files && event.target.files[0]));
      $('[data-pi-clear]', root).addEventListener('click', clearPhoto);

      function parseText(text, options = {}) {
        const value = String(text || '').trim();
        if (!value) {
          toast('请先拍照识别或粘贴文字', { icon: 'info' });
          textarea.focus();
          return;
        }
        const model = parsePaperText(value, {
          dateKey: $('#pi-date') ? $('#pi-date').value : initialDate,
          todayKey: store.todayKey(),
        });
        review.innerHTML = reviewHtml(model);
        review.classList.remove('is-hidden');
        updateTotal(review);
        haptic();
        if (options.scroll !== false) {
          review.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      async function importClipboard() {
        try {
          if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard');
          const text = await navigator.clipboard.readText();
          if (!text || !text.trim()) {
            toast('剪贴板是空的', { icon: 'info' });
            textarea.focus();
            return;
          }
          textarea.value = text;
          toast('已粘贴，点「自动解析」');
        } catch (err) {
          textarea.focus();
          toast('请长按输入框，选择「粘贴」', { icon: 'info' });
        }
      }

      $('[data-pi-paste]', root).addEventListener('click', () => importClipboard());

      $('[data-pi-parse]', root).addEventListener('click', () => {
        parseText(textarea.value);
      });

      const ocrButton = $('[data-pi-ocr]', root);
      const rotateButton = $('[data-pi-rotate]', root);
      let ocrBusy = false;

      rotateButton.addEventListener('click', () => {
        if (!selectedFile) return;
        photoRotation = (photoRotation + 90) % 360;
        photoImg.style.transform = photoRotation ? 'rotate(' + photoRotation + 'deg)' : '';
        ocrStatus.textContent = '已旋转到 ' + photoRotation + '°，可以重新识别';
      });

      ocrButton.addEventListener('click', async () => {
        if (ocrBusy) return;
        if (!selectedFile) {
          toast('请先拍照或从相册选择一张纸质记录', { icon: 'info' });
          return;
        }
        ocrBusy = true;
        ocrButton.disabled = true;
        rotateButton.disabled = true;
        ocrStatus.textContent = '正在准备本机 OCR…首次需要下载模型';
        try {
          const result = await recognizePaper(selectedFile, {
            rotation: photoRotation,
            autoRotate: true,
            onProgress(progress) {
              if (progress && progress.message) ocrStatus.textContent = progress.message;
            },
          });
          textarea.value = result.text;
          ocrStatus.textContent = '识别完成 · ' + result.angle + '° · ' + (result.score >= 80 ? '质量较好' : '请重点核对');
          parseText(result.text, { scroll: true });
          toast('本机 OCR 完成，请逐项核对');
        } catch (err) {
          ocrStatus.textContent = '识别失败：' + (err && err.message ? err.message : '未知错误');
          toast('识别失败，请换清晰照片或旋转后重试', { icon: 'info' });
        } finally {
          ocrBusy = false;
          ocrButton.disabled = false;
          rotateButton.disabled = false;
        }
      });

      review.addEventListener('click', async (event) => {
        const add = event.target.closest('[data-pi-add-feed]');
        if (add) {
          $('#pi-feeds', review).insertAdjacentHTML('beforeend', feedRow({ kind: 'formula', time: store.nowHM() }));
          updateTotal(review);
          return;
        }
        const remove = event.target.closest('[data-pi-del-feed]');
        if (remove) {
          const row = remove.closest('.pi-feed-row');
          if (row) row.remove();
          updateTotal(review);
          return;
        }
        const gotoPhoto = event.target.closest('[data-pi-goto-photo]');
        if (gotoPhoto) {
          if (photoWrap.classList.contains('is-hidden')) {
            toast('还没有选择照片，可以直接核对下方文字', { icon: 'info' });
          } else {
            photoWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        const save = event.target.closest('[data-pi-save]');
        if (save) {
          if (saving) return;
          saving = true;
          try {
            await saveReview(root, review, close);
          } finally {
            saving = false;
          }
        }
      });

      review.addEventListener('input', () => updateTotal(review));

      async function saveReview(sheetRoot, reviewEl, closeFn) {
        const dateKey = $('#pi-date', reviewEl).value;
        if (!store.isDateKey(dateKey)) {
          toast('请选择有效日期', { icon: 'info' });
          return;
        }
        if (dateKey > store.todayKey()) {
          toast('不能导入未来的日期', { icon: 'info' });
          return;
        }

        const feeds = collectFeeds(reviewEl);
        for (let i = 0; i < feeds.length; i += 1) {
          if (feeds[i].amountMl > 500) {
            toast('单次奶量请填写 0–500 ml 之间', { icon: 'info' });
            return;
          }
        }

        const diaperCount = Math.max(0, Math.min(40, Number($('#pi-diaper-count', reviewEl).value) || 0));
        const poopCount = Math.max(0, Math.min(diaperCount, Number($('#pi-poop-count', reviewEl).value) || 0));
        const diaperColor = $('#pi-diaper-color', reviewEl).value;
        const diaperAmount = $('#pi-diaper-amount', reviewEl).value;

        const sleepStart = $('#pi-sleep-start', reviewEl).value;
        const sleepEnd = $('#pi-sleep-end', reviewEl).value;
        if ((sleepStart && !sleepEnd) || (!sleepStart && sleepEnd)) {
          toast('睡眠开始和结束时间要一起填，或都留空', { icon: 'info' });
          return;
        }
        if (sleepStart && sleepStart === sleepEnd) {
          toast('睡眠开始和结束时间不能相同', { icon: 'info' });
          return;
        }

        const supplements = $$('[data-pi-supplement]:checked', reviewEl).map((el) => el.getAttribute('data-pi-supplement'));
        const cares = $$('[data-pi-care]:checked', reviewEl).map((el) => el.getAttribute('data-pi-care'));
        const early = {};
        $$('[data-pi-early]:checked', reviewEl).forEach((el) => {
          const key = el.getAttribute('data-pi-early');
          const minEl = $('[data-pi-early-min="' + key + '"]', reviewEl);
          early[key] = { done: true, minutes: Number(minEl && minEl.value) || 0, item: '' };
        });

        let note = $('#pi-note', reviewEl).value.slice(0, 2000);
        const sleepTotal = Number($('#pi-sleep-total', reviewEl) && $('#pi-sleep-total', reviewEl).textContent) || 0;
        if (sleepTotal > 0 && !sleepStart) {
          const sleepText = '纸质表睡眠总时长约 ' + store.formatMinutes(sleepTotal) + '（未记录起止时间）';
          note = (note ? note + '\n' : '') + sleepText;
        }
        const weather = $('#pi-weather', reviewEl).value;
        const mood = $('#pi-mood', reviewEl).value;
        const temperature = $('#pi-temperature', reviewEl).value.trim().slice(0, 8);
        const vaccine = $('#pi-vaccine', reviewEl).value.trim().slice(0, 200);
        const adverse = $('#pi-adverse', reviewEl).value.trim().slice(0, 200);

        const existing = store.getDay(dateKey);
        const existingCount = countExisting(existing);
        if (existingCount > 0) {
          const ok = await confirmDialog({
            title: '覆盖当天已有记录？',
            message: '这一天已有 ' + existingCount + ' 项记录。保存会用这次导入的内容覆盖喂养、尿布、睡眠、补剂、护理、早教和心得。',
            confirmText: '覆盖并保存',
            danger: true,
            iconName: 'info',
          });
          if (!ok) return;
        }

        // 先清空当天对应数据，再写入核对后的内容
        existing.feeds.slice().forEach((item) => store.removeFeed(dateKey, item.id));
        existing.diapers.slice().forEach((item) => store.removeDiaper(dateKey, item.id));
        existing.sleeps.slice().forEach((item) => store.removeSleep(dateKey, item.id));
        Object.keys(existing.supplements || {}).forEach((key) => store.setSupplement(dateKey, key, false));
        Object.keys(existing.cares || {}).forEach((key) => store.setCare(dateKey, key, false));
        Object.keys(existing.early || {}).forEach((key) => store.setEarly(dateKey, key, { done: false }));

        store.updateDay(dateKey, {
          weather,
          mood,
          temperature,
          vaccine,
          adverse,
          note,
        });

        feeds.forEach((feed) => store.addFeed(dateKey, feed));

        const now = store.nowHM();
        const totalDiapers = Math.max(diaperCount, poopCount);
        for (let i = 0; i < totalDiapers; i += 1) {
          const isPoop = i < poopCount;
          store.addDiaper(dateKey, {
            time: now,
            type: isPoop ? 'poop' : 'pee',
            color: isPoop ? diaperColor : '',
            amount: diaperAmount,
            note: '纸质表汇总导入',
          });
        }

        if (sleepStart && sleepEnd) {
          store.addSleep(dateKey, { start: sleepStart, end: sleepEnd, direction: 'back', note: '纸质表导入' });
        }

        supplements.forEach((key) => store.setSupplement(dateKey, key, true));
        cares.forEach((key) => store.setCare(dateKey, key, true));
        Object.keys(early).forEach((key) => store.setEarly(dateKey, key, early[key]));

        haptic();
        closeFn();
        toast('已导入 ' + feeds.length + ' 条喂养、' + totalDiapers + ' 条尿布记录');
        if (typeof options.onSaved === 'function') options.onSaved(dateKey);
      }
    },
  });

  return sheet;
}
