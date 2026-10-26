import { COLORS, COLOR_KEYS, validSize } from './constants.js';

export const LAYOUT_FORMAT = 'color-transit-ball-layout';
export const LAYOUT_VERSION = 1;

export function createBallLayout(width, height, balls) {
  if (!validSize(width, height)) throw new Error('球区宽度须为 1–100、高度须为 1–60 的整数。');
  if (!Array.isArray(balls) || balls.length !== width * height) {
    throw new Error(`球格数量须为 ${width * height}。`);
  }
  if (balls.some((color) => color !== null && !COLOR_KEYS.includes(color))) {
    throw new Error(`球格只能使用 ${COLOR_KEYS.join('、')} 或 null。`);
  }
  return { format: LAYOUT_FORMAT, version: LAYOUT_VERSION, width, height, balls: [...balls] };
}

export function parseBallLayout(json) {
  let value;
  try { value = JSON.parse(json); }
  catch (error) { throw new Error(`JSON 语法错误：${error.message}`); }
  if (!value || value.format !== LAYOUT_FORMAT || value.version !== LAYOUT_VERSION) {
    throw new Error('文件不是受支持的球区排布文件。');
  }
  return createBallLayout(value.width, value.height, value.balls);
}

export function parsePatternText(input, width, height) {
  if (!validSize(width, height)) throw new Error('球区宽度须为 1–100、高度须为 1–60 的整数。');
  const lines = input.trim().split(/\r?\n/).map((line) => line.replace(/[\s,，|]/g, '').toUpperCase());
  if (lines.length !== height) throw new Error(`图案需要 ${height} 行，当前为 ${lines.length} 行。`);
  const balls = [];
  for (let y = 0; y < height; y++) {
    const cells = Array.from(lines[y]);
    if (cells.length !== width) throw new Error(`第 ${y + 1} 行需要 ${width} 格，当前为 ${cells.length} 格。`);
    for (const cell of cells) {
      if (cell !== '.' && !COLOR_KEYS.includes(cell)) {
        throw new Error(`第 ${y + 1} 行含无效字符 ${cell}；请用 ${COLOR_KEYS.join('/')} 或 .。`);
      }
      balls.push(cell === '.' ? null : cell);
    }
  }
  return createBallLayout(width, height, balls);
}

// Input is the ImageData of a source image. Each output cell samples the centre
// of an equal-sized region, with the source fitted inside the requested grid.
export function imagePixelsToLayout(imageData, width, height) {
  if (!validSize(width, height)) throw new Error('球区宽度须为 1–100、高度须为 1–60 的整数。');
  const { data, width: sourceWidth, height: sourceHeight } = imageData;
  if (!sourceWidth || !sourceHeight || data.length !== sourceWidth * sourceHeight * 4) {
    throw new Error('图片像素数据无效。');
  }
  const palette = Object.fromEntries(COLOR_KEYS.map((key) => [
    key, COLORS[key].hex.match(/[\da-f]{2}/gi).map((hex) => Number.parseInt(hex, 16))
  ]));
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  const balls = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sourceX = Math.floor((x + 0.5 - offsetX) / scale);
    const sourceY = Math.floor((y + 0.5 - offsetY) / scale);
    if (sourceX < 0 || sourceX >= sourceWidth || sourceY < 0 || sourceY >= sourceHeight) {
      balls.push(null);
      continue;
    }
    const index = (sourceY * sourceWidth + sourceX) * 4;
    const rgb = [data[index], data[index + 1], data[index + 2]];
    const [red, green, blue] = rgb;
    if (data[index + 3] < 128 || (Math.max(...rgb) - Math.min(...rgb) < 22 && red > 225)) {
      balls.push(null);
      continue;
    }
    const color = COLOR_KEYS.reduce((best, key) => {
      const distance = palette[key].reduce((sum, channel, i) => sum + (rgb[i] - channel) ** 2, 0);
      return distance < best.distance ? { key, distance } : best;
    }, { key: 'R', distance: Infinity }).key;
    balls.push(color);
  }
  return createBallLayout(width, height, balls);
}
