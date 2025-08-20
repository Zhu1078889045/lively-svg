/**
 * SVG 虚线动画工具
 * - 识别虚线：通过 getComputedStyle 检测 stroke-dasharray
 * - 预览动画：在 SVG 内注入 keyframes，对标注的元素应用动画
 * - 导出 GIF：按帧计算 stroke-dashoffset 渲染到 Canvas，并用 gif.js 生成 GIF
 */

const fileInput = document.getElementById('fileInput');
const addAnimBtn = document.getElementById('addAnimBtn');
const exportGifBtn = document.getElementById('exportGifBtn');
const exportSvgBtn = document.getElementById('exportSvgBtn');
const exportWebmBtn = document.getElementById('exportWebmBtn');
const webmToGifBtn = document.getElementById('webmToGifBtn');
const originalPane = document.getElementById('originalPane');
const effectPane = document.getElementById('effectPane');
const statusEl = document.getElementById('status');
const previewDurationInput = document.getElementById('previewDuration');
const gifFpsInput = document.getElementById('gifFps');
const gifDurationInput = document.getElementById('gifDuration');
const gifScaleInput = document.getElementById('gifScale');
const gifQualityInput = document.getElementById('gifQuality');
const gifDitherInput = document.getElementById('gifDither');

let lastWebmBlob = null;

let previewDurationBound = false;
function bindPreviewDurationLive() {
  if (previewDurationBound) return;
  if (!previewDurationInput) return;
  previewDurationInput.addEventListener('input', () => {
    if (!effectSvgEl) return;
    const dur = getPreviewDurationSec();
    effectSvgEl.querySelectorAll('[data-dash-id]').forEach((el) => {
      el.style.setProperty('--dash-duration', `${dur}s`);
      el.style.setProperty('animation', `dash ${dur}s linear infinite`, 'important');
    });
  });
  previewDurationBound = true;
}

let originalSvgText = '';
let effectSvgEl = null;
/** @type {{id: string, cycle: number}[]} */
let dashedRegistry = []; // 记录需要动画的元素及其周期

fileInput.addEventListener('change', async (e) => {
  resetUI();
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  originalSvgText = text;
  // 显示原图
  originalPane.innerHTML = text;
  neutralizeOriginalAnimation(originalPane);
  addAnimBtn.disabled = false;
  setStatus('已加载 SVG，点击“识别虚线并让它动起来”。');
});

addAnimBtn.addEventListener('click', () => {
  if (!originalSvgText) return;
  try {
    buildEffectPreview(originalSvgText);
    exportGifBtn.disabled = false;
    if (exportSvgBtn) exportSvgBtn.disabled = false;
    if (exportWebmBtn) exportWebmBtn.disabled = false;
    if (webmToGifBtn) webmToGifBtn.disabled = false;
    setStatus('虚线已添加动画。可点击“导出 GIF/动效SVG/WebM/高质量GIF(由WebM)”。');
  } catch (err) {
    console.error(err);
    setStatus('添加动画失败：' + (err && err.message ? err.message : String(err)));
  }
});

exportGifBtn.addEventListener('click', async () => {
  try {
    setStatus('开始导出 GIF...');
    exportGifBtn.disabled = true;
    await exportGifFromEffect();
  } catch (err) {
    console.error(err);
    setStatus('导出 GIF 失败：' + (err && err.message ? err.message : String(err)));
  } finally {
    exportGifBtn.disabled = false;
  }
});

if (exportSvgBtn) {
  exportSvgBtn.addEventListener('click', () => {
    try {
      setStatus('导出动效 SVG...');
      exportSvgBtn.disabled = true;
      exportAnimatedSvg();
    } catch (err) {
      console.error(err);
      setStatus('导出动效 SVG 失败：' + (err && err.message ? err.message : String(err)));
    } finally {
      exportSvgBtn.disabled = false;
    }
  });
}

if (exportWebmBtn) {
  exportWebmBtn.addEventListener('click', async () => {
    try {
      setStatus('开始导出 WebM...');
      exportWebmBtn.disabled = true;
      await exportWebMFromEffect();
    } catch (err) {
      console.error(err);
      setStatus('导出 WebM 失败：' + (err && err.message ? err.message : String(err)));
    } finally {
      exportWebmBtn.disabled = false;
    }
  });
}

if (webmToGifBtn) {
  webmToGifBtn.addEventListener('click', async () => {
    try {
      setStatus('开始转码 WebM → 高质量 GIF...');
      webmToGifBtn.disabled = true;
      let webmBlob = lastWebmBlob;
      if (!webmBlob) {
        webmBlob = await pickWebMFile();
      }
      if (!webmBlob) { setStatus('未选择 WebM 文件'); return; }
      const fps = clampInt(parseFloat(gifFpsInput && gifFpsInput.value), 1, 60) || 12;
      await webMToGifWithFFmpeg(webmBlob, fps);
    } catch (err) {
      console.error(err);
      setStatus('转码失败：' + (err && err.message ? err.message : String(err)));
    } finally {
      webmToGifBtn.disabled = false;
    }
  });
}

function resetUI() {
  originalPane.innerHTML = '';
  effectPane.innerHTML = '';
  effectSvgEl = null;
  dashedRegistry = [];
  addAnimBtn.disabled = true;
  exportGifBtn.disabled = true;
  if (exportSvgBtn) exportSvgBtn.disabled = true;
  if (exportWebmBtn) exportWebmBtn.disabled = true;
  if (webmToGifBtn) webmToGifBtn.disabled = true;
  lastWebmBlob = null;
  setStatus('');
}

function setStatus(msg) {
  statusEl.textContent = msg || '';
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function readNum(inputEl, def) {
  const v = inputEl ? parseFloat(inputEl.value) : NaN;
  return Number.isFinite(v) ? v : def;
}
function getPreviewDurationSec() {
  const v = previewDurationInput ? parseFloat(previewDurationInput.value) : NaN;
  return Number.isFinite(v) && v > 0 ? v : 4;
}

function neutralizeOriginalAnimation(container) {
  try {
    const svg = container.querySelector('svg');
    if (!svg) return;
    // 移除脚本注入/原文件中的 anim 样式块
    const s = svg.querySelector('style#anim');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    // 在原图容器内强制禁止动画
    const style = document.createElement('style');
    style.textContent = '#originalPane svg *{animation:none!important}';
    container.appendChild(style);
  } catch (e) {}
}

/**
 * 构建效果预览（右侧）
 */
function buildEffectPreview(svgText) {
  // Fast path: direct replace into SVG string if possible
  const replaced = tryDirectAnimationReplace(svgText, getPreviewDurationSec());
  if (replaced) {
    effectPane.innerHTML = replaced;
    effectSvgEl = effectPane.querySelector('svg');
    setStatus('已应用“直接替换样式”预览模式');
    if (effectSvgEl) {
      // ensure export registry
      dashedRegistry = forceMarkDashed(effectSvgEl);
    } else {
      dashedRegistry = [];
    }
    return;
  }

  // 用 DOMParser 解析为 SVG 元素
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  let svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('不是有效的 SVG 文件');
  }

  // 将预览 SVG 挂到文档中，便于 getComputedStyle
  effectPane.innerHTML = '';
  effectPane.appendChild(svg);
  // 特定资源的遮挡层处理（若存在则隐藏）
  const overlay = svg.querySelector('#w1d0ieb11a48gsq');
  if (overlay) {
    overlay.setAttribute('style', mergeInlineStyle(overlay.getAttribute('style') || '', 'display:none'));
  }

  // 查找虚线元素，记录 dash 周期，并标注 data-dash-id
  dashedRegistry = detectDashedElements(svg);
  if (!dashedRegistry.length) {
    // 兜底：强制标记一批候选元素为虚线，保证预览能动起来
    dashedRegistry = forceMarkDashed(svg);
  }

  // 注入动画样式，仅针对标注过的元素
  injectDashAnimationStyle(svg);

  // 设置变量（可选：统一动画节奏）
  dashedRegistry.forEach((item) => {
    const el = svg.querySelector(`[data-dash-id="${item.id}"]`);
    if (el) {
      el.style.setProperty('--dash-cycle', String(item.cycle || 300));
      // 统一时长：由输入控制，单位秒
      el.style.setProperty('--dash-duration', `${getPreviewDurationSec()}s`);
      // 提高优先级，避免被 SVG 内部样式覆盖
      el.style.setProperty('animation', `dash ${getPreviewDurationSec()}s linear infinite`, 'important');
    }
  });

  // 绑定预览时长的即时更新
  bindPreviewDurationLive();

  effectSvgEl = svg;
}

/**
 * 检测所有形状元素是否为虚线，并返回记录
 * @param {SVGSVGElement} svg
 * @returns {{id:string, cycle:number}[]}
 */
function detectDashedElements(svg) {
  const shapesSelector = 'path, line, polyline, polygon, circle, rect, ellipse';
  const nodes = Array.from(svg.querySelectorAll(shapesSelector));
  let dashed = [];
  let seq = 0;

  nodes.forEach((el) => {
    // 优先读取元素或祖先上的内联 stroke-dasharray，再回退到 getComputedStyle
    let sda = getEffectivePresentation(el, 'stroke-dasharray');
    if (!sda) {
      const cs = getComputedStyle(el);
      sda = (cs.strokeDasharray || '').trim();
    }
    // 没有定义或显式 none 则跳过
    if (!sda || sda.toLowerCase() === 'none') return;

    // 解析数值；若解析不到有效周期，则回退到 300，保证能“动起来”
    const nums = parseDashArray(sda);
    const sum = nums.reduce((a, b) => a + b, 0);
    const cycle = sum > 0 ? sum : 300;

    const id = `dash-${++seq}`;
    el.setAttribute('data-dash-id', id);
    // 初始 offset 设为 0 方便预览
    el.style.strokeDashoffset = '0';
    dashed.push({ id, cycle });
  });

  return dashed;
}

function forceMarkDashed(svg) {
  // 仅限已知虚线分组，避免误把实线变成虚线
  // const shapesSelector = '#items g[id*="dashed-stroke"] path';
  const shapesSelector = '#items g[stroke-dasharray] path';
  const nodes = Array.from(svg.querySelectorAll(shapesSelector));
  let dashed = [];
  let seq = 0;
  nodes.forEach((el) => {
    const id = `dash-${++seq}`;
    el.setAttribute('data-dash-id', id);
    el.style.strokeDashoffset = '0';
    dashed.push({ id, cycle: 300 });
  });
  return dashed;
}

/**
 * 将 "5, 7" / "5px, 7px" / "5 7" 解析为数字数组
 */
function parseDashArray(s) {
  return s
    .split(/[\s,]+/g)
    .map((t) => parseFloat(String(t).replace(/px$/i, '')))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

/**
 * 解析 style 行内声明为 Map（小写键）
 */
function parseStyleDecls(styleText) {
  const map = new Map();
  String(styleText || '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((kv) => {
      const i = kv.indexOf(':');
      if (i > 0) {
        const k = kv.slice(0, i).trim().toLowerCase();
        const v = kv.slice(i + 1).trim();
        map.set(k, v);
      }
    });
  return map;
}

/**
 * 从元素或其祖先上读取展示属性（如 stroke-dasharray）
 * 优先顺序：
 * 1) 元素的同名属性
 * 2) 元素的 style 行内属性
 * 3) 最近祖先的同名属性或 style 行内属性
 */
function getEffectivePresentation(el, attrName) {
  const lower = String(attrName || '').toLowerCase();
  let node = el;
  while (node && node.nodeType === 1) {
    if (node.hasAttribute(lower)) {
      const v = node.getAttribute(lower);
      if (v) return v;
    }
    const styleAttr = node.getAttribute('style');
    if (styleAttr) {
      const decls = parseStyleDecls(styleAttr);
      if (decls.has(lower)) {
        const v = decls.get(lower);
        if (v) return v;
      }
    }
    node = node.parentElement;
  }
  return '';
}

/**
 * 在 SVG 内注入动画样式，限定到 data-dash-id 元素
 */
function injectDashAnimationStyle(svg) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const style = document.createElementNS(svgNS, 'style');
  style.setAttribute('id', 'dash-anim-style');
  style.textContent = `
/* 仅作用于标注为 data-dash-id 的元素 */
[data-dash-id] {
  animation: dash var(--dash-duration, 12s) linear infinite;
  will-change: stroke-dashoffset;
}
@keyframes dash {
  from { stroke-dashoffset: calc(var(--dash-cycle, 300) * -1); }
  to   { stroke-dashoffset: 0; }
}
  `.trim();
  // 插入到第一个孩子前，尽量提高优先级
  svg.insertBefore(style, svg.firstChild);
}

async function exportAnimatedSvg() {
  if (!effectSvgEl) {
    setStatus('无预览 SVG，无法导出。');
    return;
  }
  const svg = /** @type {SVGSVGElement} */ (effectSvgEl.cloneNode(true));

  // 隐藏遮挡层
  const overlay = svg.querySelector('#w1d0ieb11a48gsq');
  if (overlay) {
    overlay.setAttribute('style', mergeInlineStyle(overlay.getAttribute('style') || '', 'display:none'));
  }

  // 若无动画样式，则注入针对 data-dash-id 的动画样式
  if (!svg.querySelector('#dash-anim-style') && !svg.querySelector('style#anim')) {
    const dur = getPreviewDurationSec();
    const svgNS = 'http://www.w3.org/2000/svg';
    const style = document.createElementNS(svgNS, 'style');
    style.setAttribute('id', 'dash-anim-style');
    style.textContent = `
[data-dash-id]{animation:dash var(--dash-duration, ${dur}s) linear infinite;will-change:stroke-dashoffset;}
@keyframes dash{from{stroke-dashoffset:0}to{stroke-dashoffset:calc(var(--dash-cycle,300)*-1)}}
    `.trim();
    svg.insertBefore(style, svg.firstChild);
  }

  // 确保每个目标元素带有周期与时长，并内联 animation
  const dur = getPreviewDurationSec();
  svg.querySelectorAll('[data-dash-id]').forEach((el) => {
    let cycle = 0;
    const id = el.getAttribute('data-dash-id') || '';
    const rec = dashedRegistry.find(d => d.id === id);
    cycle = rec ? rec.cycle : 0;
    if (!cycle) {
      const sda = getEffectivePresentation(el, 'stroke-dasharray') || '';
      const nums = parseDashArray(sda);
      const sum = nums.reduce((a,b)=>a+b,0);
      cycle = sum > 0 ? sum : 300;
    }
    el.style.setProperty('--dash-cycle', String(cycle));
    el.style.setProperty('--dash-duration', `${dur}s`);
    el.style.setProperty('animation', `dash ${dur}s linear infinite`, 'important');
  });

  const text = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  downloadBlob(url, 'animated-dash.svg');
  setStatus('完成：animated-dash.svg 已下载。');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * 导出 WebM（CCapture）：逐帧计算 stroke-dashoffset，绘制到 Canvas 并录制为 WebM
 */
async function exportWebMFromEffect() {
  if (!effectSvgEl) {
    setStatus('无预览 SVG，无法导出。');
    return;
  }

  // 克隆导出 SVG，去掉 CSS 动画并清理外部依赖
  const exportSvg = /** @type {SVGSVGElement} */ (effectSvgEl.cloneNode(true));
  // 移除预览样式
  const styleAnim = exportSvg.querySelector('#dash-anim-style');
  if (styleAnim && styleAnim.parentNode) styleAnim.parentNode.removeChild(styleAnim);
  const styleAnim2 = exportSvg.querySelector('style#anim');
  if (styleAnim2 && styleAnim2.parentNode) styleAnim2.parentNode.removeChild(styleAnim2);
  // 移除外部字体导入，避免 taint
  exportSvg.querySelectorAll('style, link').forEach((el) => {
    const text = (el.textContent || '').toLowerCase();
    const hasImport = text.includes('@import') || text.includes('url(');
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (hasImport || cls.includes('fontimports')) {
      el.parentNode && el.parentNode.removeChild(el);
    }
  });
  // 隐藏遮挡层
  const overlay = exportSvg.querySelector('#w1d0ieb11a48gsq');
  if (overlay) {
    overlay.setAttribute('style', mergeInlineStyle(overlay.getAttribute('style') || '', 'display:none'));
  }
  // 禁用动画并补 dasharray
  exportSvg.querySelectorAll('[data-dash-id]').forEach((el) => {
    el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', 'animation:none !important'));
    let sda = getEffectivePresentation(el, 'stroke-dasharray');
    if (!sda || sda.toLowerCase() === 'none') {
      el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', 'stroke-dasharray:8 8'));
    }
  });

  // 尺寸与缩放
  const { width, height } = measureSvgSize(exportSvg);
  const scale = readNum(gifScaleInput, 1) || 1;
  let widthScaled = Math.max(1, Math.round(width * scale));
  let heightScaled = Math.max(1, Math.round(height * scale));
  // 面积上限，避免体积与耗时
  const maxPixels = 300000;
  if (widthScaled * heightScaled > maxPixels) {
    const scale2 = Math.sqrt(maxPixels / (widthScaled * heightScaled));
    widthScaled = Math.max(1, Math.floor(widthScaled * scale2));
    heightScaled = Math.max(1, Math.floor(heightScaled * scale2));
  }
  const canvas = document.createElement('canvas');
  canvas.width = widthScaled;
  canvas.height = heightScaled;
  const ctx = canvas.getContext('2d');

  // 参数
  const fps = clampInt(parseFloat(gifFpsInput && gifFpsInput.value), 1, 60) || 12;
  const durationSec = Math.max(0.1, readNum(gifDurationInput, 1.5));
  let totalFrames = Math.max(8, Math.round(fps * durationSec));
  const maxFrames = 120;
  if (totalFrames > maxFrames) totalFrames = maxFrames;
  const delay = Math.round(1000 / fps);

  // 质量映射（从 GIF 的 1-30 映射到 WebM 0.4-0.99）
  const gifQ = clampInt(parseFloat(gifQualityInput && gifQualityInput.value), 1, 30) || 20;
  let webmQ = 1 - (gifQ - 1) / 29 * 0.6; // 1..0.4
  webmQ = Math.max(0.4, Math.min(0.99, webmQ));

  // 构造导出目标
  const dashedLookup = new Map(dashedRegistry.map((d) => [d.id, d.cycle || 300]));
  const exportTargets = [];
  const candidates = Array.from(exportSvg.querySelectorAll('[data-dash-id], #items g[id*="dashed-stroke"] path'));
  candidates.forEach((el) => {
    const id = el.getAttribute('data-dash-id') || '';
    let cycle = (id && dashedLookup.get(id)) || 0;
    if (!cycle) {
      const sda = getEffectivePresentation(el, 'stroke-dasharray') || '';
      const nums = parseDashArray(sda);
      const sum = nums.reduce((a, b) => a + b, 0);
      cycle = sum > 0 ? sum : 300;
    }
    // 确保 dasharray 存在
    let sda2 = getEffectivePresentation(el, 'stroke-dasharray');
    if (!sda2 || sda2.toLowerCase() === 'none') {
      el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', 'stroke-dasharray:8 8'));
    }
    exportTargets.push({ el, cycle });
  });

  // CCapture 录制
  // @ts-ignore
  const capturer = new CCapture({ format: 'webm', framerate: fps, quality: webmQ, verbose: false });
  capturer.start();

  setStatus(`参数(WebM): ${widthScaled}x${heightScaled}, fps=${fps}, 时长=${durationSec}s, 帧数=${totalFrames}, 质量=${webmQ.toFixed(2)}`);
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    exportTargets.forEach(({ el, cycle }) => {
      const offset = -cycle * (1 - t);
      el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', `stroke-dashoffset:${offset} !important`));
    });
    const svgText = new XMLSerializer().serializeToString(exportSvg);
    const url = svgStringToObjectURL(svgText);
    await drawSvgImageToCanvas(ctx, url, widthScaled, heightScaled);
    URL.revokeObjectURL(url);
    capturer.capture(canvas);
    setStatus(`录制帧 ${i + 1}/${totalFrames}...`);
    // 控制帧间间隔（尽量与 fps 对齐）
    await new Promise(r => setTimeout(r, delay));
  }

  capturer.stop();
  // 优先获取 Blob 写入缓存，并自定义文件名下载
  capturer.save((blob) => {
    try {
      if (blob && blob.size) {
        lastWebmBlob = blob;
      }
      const outUrl = URL.createObjectURL(blob);
      const filename = `animated-dash-${widthScaled}x${heightScaled}-${fps}fps-${durationSec}s-${totalFrames}f.webm`;
      downloadBlob(outUrl, filename);
      setTimeout(() => URL.revokeObjectURL(outUrl), 60000);
      setStatus(`完成：${filename} 已下载（已缓存，可直接“WebM转高质量GIF”）。`);
    } catch (e) {
      setStatus('完成：WebM 已导出（已缓存）。');
    }
  });
}

/**
 * 导出 GIF：逐帧计算每个虚线元素的 offset，绘制到 Canvas，交给 gif.js
 */
async function exportGifFromEffect() {
  if (!effectSvgEl || dashedRegistry.length === 0) {
    setStatus('未检测到虚线元素，无法导出。');
    return;
  }

  // 克隆一个用于导出的 SVG（去掉 CSS 动画，转成逐帧）
  const exportSvg = /** @type {SVGSVGElement} */ (effectSvgEl.cloneNode(true));
  // 移除为预览注入的动画样式
  const style = exportSvg.querySelector('#dash-anim-style');
  if (style && style.parentNode) style.parentNode.removeChild(style);
  // 移除外部字体导入，避免 taint 画布
  exportSvg.querySelectorAll('style, link').forEach((el) => {
    const text = (el.textContent || '').toLowerCase();
    const hasImport = text.includes('@import') || text.includes('url(');
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (hasImport || cls.includes('fontimports')) {
      el.parentNode && el.parentNode.removeChild(el);
    }
  });

  // 移除直通模式注入的 style#anim，避免导出时依赖 CSS 动画
  const animStyle = exportSvg.querySelector('style#anim');
  if (animStyle && animStyle.parentNode) animStyle.parentNode.removeChild(animStyle);

  // 禁用 data-dash-id 元素上的 CSS 动画，并在缺失时补 dasharray，确保偏移可见
  exportSvg.querySelectorAll('[data-dash-id]').forEach((el) => {
    el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', 'animation:none !important'));
    let sda = getEffectivePresentation(el, 'stroke-dasharray');
    if (!sda || sda.toLowerCase() === 'none') {
      el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', 'stroke-dasharray:8 8'));
    }
  });

  // 隐藏特定遮挡元素（若存在）
  const overlay2 = exportSvg.querySelector('#w1d0ieb11a48gsq');
  if (overlay2) {
    overlay2.setAttribute('style', mergeInlineStyle(overlay2.getAttribute('style') || '', 'display:none'));
  }

  // 尺寸
  const { width, height } = measureSvgSize(exportSvg);
  const scale = readNum(gifScaleInput, 1) || 1;
  let widthScaled = Math.max(1, Math.round(width * scale));
  let heightScaled = Math.max(1, Math.round(height * scale));
  // 若像素面积过大，自动二次缩放，降低体积与编码耗时
  const maxPixels = 300000; // ~ 548x548
  if (widthScaled * heightScaled > maxPixels) {
    const scale2 = Math.sqrt(maxPixels / (widthScaled * heightScaled));
    widthScaled = Math.max(1, Math.floor(widthScaled * scale2));
    heightScaled = Math.max(1, Math.floor(heightScaled * scale2));
  }
  const canvas = document.createElement('canvas');
  canvas.width = widthScaled;
  canvas.height = heightScaled;
  const ctx = canvas.getContext('2d');

  // GIF 配置（可调）
  const fps = clampInt(parseFloat(gifFpsInput && gifFpsInput.value), 1, 60) || 12;
  const durationSec = Math.max(0.1, readNum(gifDurationInput, 1.5));
  let totalFrames = Math.max(8, Math.round(fps * durationSec));
  const maxFrames = 120;
  let capped = false;
  if (totalFrames > maxFrames) { totalFrames = maxFrames; capped = true; }
  const delay = Math.round(1000 / fps);
  const quality = clampInt(parseFloat(gifQualityInput && gifQualityInput.value), 1, 30) || 20;

  const maxWorkers = 4;
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 2;
  const workers = Math.min(maxWorkers, Math.max(1, (hc || 2) - 1));

  const gif = new GIF({
    workers,
    quality,
    background: '#fff',
    workerScript: 'scripts/gif.worker.js',
    width: widthScaled,
    height: heightScaled,
  });

  // 输出一次导出参数，确认实际生效值
  setStatus(`参数: ${widthScaled}x${heightScaled}, fps=${fps}, 时长=${durationSec}s, 帧数=${totalFrames}${capped ? ' (已限制为上限)' : ''}, 质量=${quality}, 抖动=${!!(gifDitherInput && gifDitherInput.checked)}, workers=${workers}`);

  gif.on('progress', (p) => {
    setStatus(`编码中 ${(p * 100).toFixed(0)}%`);
  });

  // 生成导出目标列表：优先 data-dash-id 的周期；否则由 dasharray 计算；最后回退 300
  const dashedLookup = new Map(dashedRegistry.map((d) => [d.id, d.cycle || 300]));
  const exportTargets = [];
  // const candidates = Array.from(exportSvg.querySelectorAll('[data-dash-id], #items g[id*="dashed-stroke"] path'));
  const candidates = Array.from(exportSvg.querySelectorAll('[data-dash-id], #items g[stroke-dasharray] path'));
  candidates.forEach((el) => {
    const id = el.getAttribute('data-dash-id') || '';
    let cycle = (id && dashedLookup.get(id)) || 0;
    if (!cycle) {
      const sda = getEffectivePresentation(el, 'stroke-dasharray') || '';
      const nums = parseDashArray(sda);
      const sum = nums.reduce((a, b) => a + b, 0);
      cycle = sum > 0 ? sum : 300;
    }
    // 确保 dasharray 存在，保证偏移可见
    let sda2 = getEffectivePresentation(el, 'stroke-dasharray');
    if (!sda2 || sda2.toLowerCase() === 'none') {
      el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', 'stroke-dasharray:8 8'));
    }
    exportTargets.push({ el, cycle });
  });

  // 逐帧绘制
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames; // [0,1)
    // 更新每个导出目标的 offset
    exportTargets.forEach(({ el, cycle }) => {
      const offset = -cycle * (1 - t);
      el.setAttribute('style', mergeInlineStyle(el.getAttribute('style') || '', `stroke-dashoffset:${offset} !important`));
    });

    // 序列化为 Blob URL，再绘制到 Canvas（比 base64 dataURL 更高效）
    const svgText = new XMLSerializer().serializeToString(exportSvg);
    const url = svgStringToObjectURL(svgText);
    await drawSvgImageToCanvas(ctx, url, widthScaled, heightScaled);
    URL.revokeObjectURL(url);
    gif.addFrame(canvas, { delay, copy: true, dither: !!(gifDitherInput && gifDitherInput.checked), dispose: 2, globalPalette: true });
    setStatus(`渲染帧 ${i + 1}/${totalFrames}...`);
  }

  setStatus('编码 GIF...');
  gif.on('finished', (blob) => {
    const url = URL.createObjectURL(blob);
    const filename = `animated-dash-${widthScaled}x${heightScaled}-${fps}fps-${durationSec}s-${totalFrames}f.gif`;
    downloadBlob(url, filename);
    setStatus(`完成：${filename} 已下载。`);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  gif.render();
}

/**
 * 直接在 SVG 文本中注入/替换动画样式，返回替换后的字符串；失败返回空串
 * - 替换 <style id="anim">...</style> 的内部内容；如不存在则插入
 * - 动画选择器沿用你的脚本：#items g[id*="dashed-stroke"] path
 * - 隐藏遮挡层：#w1d0ieb11a48gsq
 */
function tryDirectAnimationReplace(svgString, durationSec) {
  try {
    if (!svgString) return '';
    const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 12;
    // const css =
    //   `#items g[id*="dashed-stroke"] path{stroke-dasharray:8 8;animation:dash ${dur}s linear infinite}` +
    //   `#w1d0ieb11a48gsq{display:none}` +
    //   `@keyframes dash{from{stroke-dashoffset:0}to{stroke-dashoffset:-300}}`;
    const css =
      `#items g[stroke-dasharray] path{stroke-dasharray:8 8;animation:dash ${dur}s linear infinite}` +
      `#w1d0ieb11a48gsq{display:none}` +
      `@keyframes dash{from{stroke-dashoffset:-300}to{stroke-dashoffset:0}}`;
    const re = /(<style\s+id=["']anim["'][^>]*>)([\s\S]*?)(<\/style>)/i;
    if (re.test(svgString)) {
      return svgString.replace(re, `$1${css}$3`);
    }
    // no style#anim, insert after opening <svg ...>
    const reOpen = /<svg\b[^>]*>/i;
    const m = svgString.match(reOpen);
    if (!m) return '';
    const insert = `${m[0]}<style id="anim">${css}</style>`;
    return svgString.replace(reOpen, insert);
  } catch {
    return '';
  }
}

/**
 * 合并/覆盖内联样式
 */
function mergeInlineStyle(orig, patch) {
  const map = new Map();
  const putAll = (s) => {
    s.split(';').map((x) => x.trim()).filter(Boolean).forEach((kv) => {
      const i = kv.indexOf(':');
      if (i > 0) {
        const k = kv.slice(0, i).trim();
        const v = kv.slice(i + 1).trim();
        map.set(k, v);
      }
    });
  };
  putAll(orig || '');
  putAll(patch || '');
  return Array.from(map.entries()).map(([k, v]) => `${k}:${v}`).join(';');
}

/**
 * 将 SVG 字符串转为 data URL（base64）
 */
function svgStringToDataURL(s) {
  // 防止非 ASCII 字符问题
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return `data:image/svg+xml;base64,${b64}`;
}

/**
 * 将 SVG 字符串转为 Blob URL（更高效，便于及时释放）
 */
function svgStringToObjectURL(s) {
  const blob = new Blob([s], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
}

/**
 * 将 data:image/svg+xml 绘制到 Canvas
 */
function drawSvgImageToCanvas(ctx, dataURL, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // dataURL 不需要跨域，若引入外部资源可能会失败，已在上游尽量剔除
    img.onload = () => {
      try {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(new Error('加载 SVG 图像失败'));
    img.src = dataURL;
  });
}

/**
 * 获取 SVG 的像素尺寸
 */
function measureSvgSize(svg) {
  // 优先 viewBox
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(parseFloat);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [, , w, h] = parts;
      return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
    }
  }
  // 再看 width/height 属性
  const wAttr = svg.getAttribute('width');
  const hAttr = svg.getAttribute('height');
  const w = wAttr ? parseFloat(wAttr) : NaN;
  const h = hAttr ? parseFloat(hAttr) : NaN;
  if (Number.isFinite(w) && Number.isFinite(h)) {
    return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  }
  // 最后用实际渲染尺寸（可能受布局影响）
  const bbox = svg.getBoundingClientRect();
  return { width: Math.max(1, Math.round(bbox.width || 1024)), height: Math.max(1, Math.round(bbox.height || 768)) };
}

/** 选择本地 WebM 文件 */
function pickWebMFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'video/webm';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      resolve(f || null);
    };
    inp.click();
  });
}

/** 确保 ffmpeg.wasm (FFmpegWASM) 已加载，返回 FFmpeg 类构造函数 */
async function ensureFfmpegLoaded() {
  // 优先使用页面已引入的 FFmpegWASM.FFmpeg
  if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) return window.FFmpegWASM.FFmpeg;

  // 若命名空间为 default 或本体是构造函数
  if (window.FFmpegWASM) {
    const cand = window.FFmpegWASM.FFmpeg || window.FFmpegWASM.default || window.FFmpegWASM;
    if (typeof cand === 'function') return cand;
  }

  // 动态注入本地 UMD（若尚未注入）
  await new Promise((resolve) => {
    const tag = document.querySelector('script[data-ffmpeg-umd]');
    if (tag) {
      tag.addEventListener('load', resolve, { once: true });
      tag.addEventListener('error', resolve, { once: true });
    } else {
      const s = document.createElement('script');
      s.src = 'scripts/ffmpeg.js';
      s.async = true;
      s.setAttribute('data-ffmpeg-umd', '1');
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    }
  });

  if (window.FFmpegWASM && window.FFmpegWASM.FFmpeg) return window.FFmpegWASM.FFmpeg;
  if (window.FFmpegWASM) {
    const cand2 = window.FFmpegWASM.FFmpeg || window.FFmpegWASM.default || window.FFmpegWASM;
    if (typeof cand2 === 'function') return cand2;
  }

  setStatus('ffmpeg.wasm 未加载（找不到 FFmpegWASM.FFmpeg 类）');
  return null;
}

/** 使用 ffmpeg.wasm 将 WebM 转为高质量 GIF（palettegen/paletteuse） */
async function webMToGifWithFFmpeg(webmBlob, fps) {
  const logBuf = [];
  const pushLog = (m) => { try { if (!m) return; const s = String(m); logBuf.push(s); if (logBuf.length > 80) logBuf.shift(); } catch(_){} };
  try {
    const FFmpegClass = await ensureFfmpegLoaded();
    if (!FFmpegClass) { setStatus('ffmpeg.wasm 加载失败'); return; }

    // 实例化并按环境选择核心：优先本地(含单线程 core-st) → 再回退 CDN；输出环境诊断
    const bind = (inst) => {
      if (typeof inst.on === 'function') {
        try {
          inst.on('log', ({ message }) => { console.log('[ffmpeg]', message); pushLog(message); });
          inst.on('progress', (e) => {
            const pct = e && typeof e.progress === 'number' ? (e.progress * 100).toFixed(1) : '';
            if (pct) setStatus(`转码中 ${pct}%`);
          });
        } catch (_) {}
      }
    };
    const iso = !!window.crossOriginIsolated;
    console.log('[ffmpeg] crossOriginIsolated=', iso, 'FFmpegClass=', FFmpegClass && FFmpegClass.name);
    pushLog('iso=' + iso + ', class=' + (FFmpegClass && FFmpegClass.name));
    let ffmpeg;
    try {
      if (!iso) {
        // 未跨源隔离：优先本地单线程核心（避免 CDN 依赖），失败再 CDN 单线程
        setStatus('环境未跨源隔离，优先本地单线程核心...');
        ffmpeg = new FFmpegClass();
        bind(ffmpeg);
        try {
          await ffmpeg.load({
            coreURL: new URL('./scripts/ffmpeg-core.js', location.href).href,
            wasmURL: new URL('./scripts/ffmpeg-core.wasm', location.href).href,
            workerURL: new URL('./scripts/ffmpeg-core.worker.js', location.href).href,
          });
          console.log('本地单线程核心加载成功');
        } catch (errSTLocal) {
          console.error('本地单线程核心加载失败:', errSTLocal);
          setStatus('本地单线程失败，改用 CDN 单线程核心...' + (errSTLocal && errSTLocal.message ? (' ' + errSTLocal.message) : ''));
          ffmpeg = new FFmpegClass();
          bind(ffmpeg);
          await ffmpeg.load({
            coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/umd/ffmpeg-core.js',
            wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/umd/ffmpeg-core.wasm',
            workerURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/umd/ffmpeg-core.worker.js',
          });
        }
      } else {
        // 已跨源隔离：本地多线程 → 本地单线程 → CDN 多线程 → CDN 单线程
        setStatus('加载 ffmpeg 核心(本地多线程)...');
        ffmpeg = new FFmpegClass();
        bind(ffmpeg);
        try {
          await ffmpeg.load({
            coreURL: new URL('./scripts/ffmpeg-core.js', location.href).href,
            wasmURL: new URL('./scripts/ffmpeg-core.wasm', location.href).href,
            workerURL: new URL('./scripts/ffmpeg-core.worker.js', location.href).href,
          });
        } catch (errCoreLocal) {
          console.error('本地多线程核心加载失败:', errCoreLocal);
          setStatus('本地多线程失败，尝试本地单线程...' + (errCoreLocal && errCoreLocal.message ? (' ' + errCoreLocal.message) : ''));
          // 本地单线程
          ffmpeg = new FFmpegClass();
          bind(ffmpeg);
          try {
            await ffmpeg.load({
              coreURL: new URL('./scripts/ffmpeg-core.js', location.href).href,
              wasmURL: new URL('./scripts/ffmpeg-core.wasm', location.href).href,
              workerURL: new URL('./scripts/ffmpeg-core.worker.js', location.href).href,
            });
          } catch (errSTLocal2) {
            console.error('本地单线程核心加载失败:', errSTLocal2);
            setStatus('本地单线程失败，改用 CDN 多线程...' + (errSTLocal2 && errSTLocal2.message ? (' ' + errSTLocal2.message) : ''));
            // CDN 多线程
            ffmpeg = new FFmpegClass();
            bind(ffmpeg);
            try {
              await ffmpeg.load({
                coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',
                wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',
                workerURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.worker.js',
              });
            } catch (errCDNCore) {
              console.error('CDN 多线程核心加载失败:', errCDNCore);
              setStatus('CDN 多线程失败，改用 CDN 单线程...' + (errCDNCore && errCDNCore.message ? (' ' + errCDNCore.message) : ''));
              ffmpeg = new FFmpegClass();
              bind(ffmpeg);
              await ffmpeg.load({
                coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/umd/ffmpeg-core.js',
                wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/umd/ffmpeg-core.wasm',
                workerURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.10/dist/umd/ffmpeg-core.worker.js',
              });
            }
          }
        }
      }
    } catch (loadErr) {
      console.error('核心加载总失败:', loadErr);
      throw loadErr;
    }

    // 写入输入
    setStatus('写入输入文件...');
    const inData = new Uint8Array(await webmBlob.arrayBuffer());
    await ffmpeg.writeFile('in.webm', inData);

    // 高质量调色板生成与应用
    const filter = `fps=${fps},split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=floyd_steinberg`;
    setStatus('转码中（palettegen/paletteuse）...');
    await ffmpeg.exec(['-y', '-i', 'in.webm', '-filter_complex', filter, '-loop', '0', 'out.gif']);

    // 读取输出并下载
    const out = await ffmpeg.readFile('out.gif'); // Uint8Array
    const gifBlob = new Blob([out], { type: 'image/gif' });
    const url = URL.createObjectURL(gifBlob);
    const name = `converted-${fps}fps.gif`;
    downloadBlob(url, name);
    setStatus(`完成：${name} 已下载。`);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error(e);
    const tail = (typeof logBuf !== 'undefined' && logBuf.length) ? ' | 日志: ' + logBuf.slice(-8).join(' | ') : '';
    setStatus('转码失败：' + (e && e.message ? e.message : String(e)) + tail);
  }
}

/**
 * 触发下载
 */
function downloadBlob(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
