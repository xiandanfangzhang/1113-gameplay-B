import { COLORS, COLOR_KEYS, validSize } from './constants.js';
import { imagePixelsToLayout, parsePatternText } from './pattern-layout.js';

const $ = (id) => document.getElementById(id);
let layout = null;

function status(message, error = false) {
  $('patternStatus').textContent = message;
  $('patternStatus').classList.toggle('error-text', error);
}

function draw(layoutToDraw) {
  const canvas = $('patternPreview');
  const cell = Math.max(3, Math.min(24, Math.floor(720 / layoutToDraw.width)));
  canvas.width = layoutToDraw.width * cell;
  canvas.height = layoutToDraw.height * cell;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  layoutToDraw.balls.forEach((color, index) => {
    if (!color) return;
    context.fillStyle = COLORS[color].hex;
    context.fillRect(index % layoutToDraw.width * cell, Math.floor(index / layoutToDraw.width) * cell, cell, cell);
  });
  if (cell >= 8) {
    context.strokeStyle = '#00000022';
    context.lineWidth = 1;
    for (let x = 0; x <= layoutToDraw.width; x++) {
      context.beginPath(); context.moveTo(x * cell + 0.5, 0); context.lineTo(x * cell + 0.5, canvas.height); context.stroke();
    }
    for (let y = 0; y <= layoutToDraw.height; y++) {
      context.beginPath(); context.moveTo(0, y * cell + 0.5); context.lineTo(canvas.width, y * cell + 0.5); context.stroke();
    }
  }
  const counts = Object.fromEntries(COLOR_KEYS.map((key) => [key, 0]));
  let empty = 0;
  for (const color of layoutToDraw.balls) color ? counts[color]++ : empty++;
  $('patternCounts').textContent = `${layoutToDraw.width} × ${layoutToDraw.height} · ${COLOR_KEYS.map((key) => `${COLORS[key].name} ${counts[key]}`).join(' · ')} · 空 ${empty}`;
}

async function imageDataFromFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); }
}

document.querySelectorAll('input[name="patternMode"]').forEach((input) => input.addEventListener('change', () => {
  const textMode = document.querySelector('input[name="patternMode"]:checked').value === 'text';
  $('imageField').classList.toggle('hidden', textMode);
  $('textField').classList.toggle('hidden', !textMode);
  layout = null;
  $('downloadLayout').disabled = true;
  status('图案来源已切换，请重新生成。');
}));

for (const id of ['patternImage', 'patternText', 'patternWidth', 'patternHeight']) {
  $(id).addEventListener(id === 'patternImage' ? 'change' : 'input', () => {
    layout = null;
    $('downloadLayout').disabled = true;
    status('输入已改变，请重新生成排布。');
  });
}

$('makeLayout').addEventListener('click', async () => {
  layout = null;
  $('downloadLayout').disabled = true;
  try {
    const width = Number($('patternWidth').value);
    const height = Number($('patternHeight').value);
    if (!validSize(width, height)) throw new Error('球区宽度须为 1–100、高度须为 1–60 的整数。');
    if (document.querySelector('input[name="patternMode"]:checked').value === 'text') {
      layout = parsePatternText($('patternText').value, width, height);
    } else {
      const file = $('patternImage').files?.[0];
      if (!file) throw new Error('请先选择图片。');
      layout = imagePixelsToLayout(await imageDataFromFile(file), width, height);
    }
    draw(layout);
    $('downloadLayout').disabled = false;
    status('排布已生成。可下载 JSON 并导入 Demo 编辑器。');
  } catch (error) { status(`生成失败：${error.message}`, true); }
});

$('downloadLayout').addEventListener('click', () => {
  if (!layout) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ball-layout-${layout.width}x${layout.height}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('球区排布 JSON 已下载。');
});
