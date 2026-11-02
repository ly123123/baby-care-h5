/**
 * 本机离线 OCR（PaddleOCR PP-OCRv5）
 *
 * - 模型、ONNX Runtime、OpenCV 全部随应用一起部署；
 * - 第一次识别时下载到本机缓存，之后离线可用；
 * - 照片只在本机内存/Canvas 中处理，不上传。
 */

let bundlePromise = null;
let ocrPromise = null;
let ocrInstance = null;

const BUNDLE_URL = new URL('../vendor/paddleocr.bundle.js', import.meta.url).href;
const DET_URL = new URL('../models/PP-OCRv5_mobile_det.tar', import.meta.url).href;
const REC_URL = new URL('../models/PP-OCRv5_mobile_rec.tar', import.meta.url).href;
const ORT_DIR = new URL('../vendor/ort/', import.meta.url).href;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-paddleocr]');
    if (existing) {
      if (window.PaddleOCR) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.paddleocr = '1';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('OCR 引擎加载失败，请检查网络后重试')), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureBundle() {
  if (window.PaddleOCR) return window.PaddleOCR;
  if (!bundlePromise) bundlePromise = loadScript(BUNDLE_URL);
  await bundlePromise;
  if (!window.PaddleOCR) throw new Error('OCR 引擎初始化失败');
  return window.PaddleOCR;
}

async function ensureOcr(onProgress) {
  if (ocrInstance) return ocrInstance;
  if (!ocrPromise) {
    ocrPromise = (async () => {
      const PaddleOCR = await ensureBundle();
      if (onProgress) onProgress({ stage: 'model', message: '首次准备本机 OCR 模型…' });
      const instance = await PaddleOCR.create({
        lang: 'ch',
        ocrVersion: 'PP-OCRv5',
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textDetectionModelAsset: { url: DET_URL },
        textRecognitionModelName: 'PP-OCRv5_mobile_rec',
        textRecognitionModelAsset: { url: REC_URL },
        ortOptions: {
          backend: 'wasm',
          wasmPaths: ORT_DIR,
          numThreads: 1,
          simd: true,
        },
      });
      ocrInstance = instance;
      return instance;
    })().catch((err) => {
      ocrPromise = null;
      throw err;
    });
  }
  return ocrPromise;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('照片读取失败'));
    img.src = url;
  });
}

async function prepareBlob(file, rotation) {
  let source;
  let revoke = '';
  try {
    if (window.createImageBitmap) {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
  } catch (err) {
    source = null;
  }
  if (!source) {
    revoke = URL.createObjectURL(file);
    source = await loadImage(revoke);
  }
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const angle = ((Number(rotation) || 0) % 360 + 360) % 360;
  const swap = angle === 90 || angle === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  ctx.restore();
  if (source.close) source.close();
  if (revoke) URL.revokeObjectURL(revoke);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('照片处理失败'))), 'image/jpeg', 0.9);
  });
}

function itemsToText(items) {
  const clean = (items || [])
    .filter((item) => item && item.text && String(item.text).trim() && Number(item.score || 0) >= 0.3)
    .map((item) => {
      const poly = item.poly || [];
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      return {
        text: String(item.text).trim(),
        score: Number(item.score || 0),
        x: xs.length ? Math.min(...xs) : 0,
        y: ys.length ? Math.min(...ys) : 0,
      };
    });

  clean.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  clean.forEach((item) => {
    let line = lines.find((entry) => Math.abs(entry.y - item.y) < 18);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  });
  lines.sort((a, b) => a.y - b.y);
  return lines
    .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '))
    .join('\n')
    .replace(/[|｜]/g, ' ')
    .replace(/[、]/g, '.')
    .replace(/(\d)\s*\.\s*:/g, '$1:')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function scoreText(text) {
  const keys = ['宝宝第', '成长记录', '日期', '喂养记录', '总奶量', '尿布', '补剂', '护理记录', '今日心得', '睡眠记录'];
  let score = 0;
  keys.forEach((key) => { if (text.indexOf(key) >= 0) score += 1; });
  const milkCount = (text.match(/ml/gi) || []).length;
  const colonCount = (text.match(/\d{1,2}:\d{2}/g) || []).length;
  return score * 10 + Math.min(milkCount, 12) + Math.min(colonCount, 12);
}

function rotateLabel(angle) {
  return angle === 0 ? '原始方向' : angle + '°';
}

/**
 * @param {File|Blob} file
 * @param {{rotation?: number, autoRotate?: boolean, onProgress?: Function}} options
 * @returns {Promise<{text:string, angle:number, score:number, metrics:object}>}
 */
export async function recognizePaper(file, options = {}) {
  if (!file) throw new Error('请先选择照片');
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  onProgress({ stage: 'loading', message: '正在加载本机 OCR…' });
  const ocr = await ensureOcr(onProgress);
  const baseRotation = ((Number(options.rotation) || 0) % 360 + 360) % 360;
  const angles = options.autoRotate === false
    ? [baseRotation]
    : [baseRotation, (baseRotation + 90) % 360, (baseRotation + 270) % 360];

  let best = null;
  for (let i = 0; i < angles.length; i += 1) {
    const angle = angles[i];
    onProgress({
      stage: 'recognizing',
      message: '正在识别' + (angles.length > 1 ? '（方向 ' + (i + 1) + '/' + angles.length + '）' : '') + '…',
    });
    const blob = await prepareBlob(file, angle);
    const started = performance.now();
    const results = await ocr.predict(blob);
    const result = results && results[0];
    const text = itemsToText(result ? result.items : []);
    const score = scoreText(text);
    const item = {
      text,
      angle,
      score,
      metrics: Object.assign({ totalMs: Math.round(performance.now() - started) }, result ? result.metrics : {}),
    };
    if (!best || item.score > best.score) best = item;
    // 已经找到足够多的栏目标题，不再试其他方向，节省时间
    if (best.score >= 80) break;
  }
  if (!best) throw new Error('没有识别到文字，请换一张更清晰的照片');
  onProgress({ stage: 'done', message: '识别完成，用时 ' + Math.round(best.metrics.totalMs / 100) / 10 + ' 秒' });
  return best;
}

export function resetOcrCache() {
  ocrInstance = null;
  ocrPromise = null;
}

export { rotateLabel };
