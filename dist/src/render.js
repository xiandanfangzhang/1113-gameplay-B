import { COLORS, GRID_HEIGHT, GRID_WIDTH, cellIndex, insideGrid, roadLength } from './constants.js';
import { animatedPosition } from './gravity.js';

export function createView(canvas, { zoom = 1, centerX = GRID_WIDTH / 2, centerY = 13 } = {}) {
  return { canvas, zoom, centerX, centerY, gridWidth: GRID_WIDTH, gridHeight: GRID_HEIGHT,
    focus: 'custom', width: 1, height: 1, dpr: 1, cell: 1 };
}

export function setViewSize(view, width, height) {
  if (view.gridWidth === width && view.gridHeight === height) return;
  view.gridWidth = width;
  view.gridHeight = height;
  fitView(view);
}

export function resizeView(view) {
  const rect = view.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (view.canvas.width !== Math.round(width * dpr) || view.canvas.height !== Math.round(height * dpr)) {
    view.canvas.width = Math.round(width * dpr);
    view.canvas.height = Math.round(height * dpr);
  }
  view.width = width;
  view.height = height;
  view.dpr = dpr;
  view.cell = Math.min(width / (view.gridWidth + 4), height / (view.gridHeight + 9)) * view.zoom;
  if (view.focus === 'bottom') {
    const bottomMargin = Math.min(52, height * 0.12);
    view.centerY = view.gridHeight + 0.5 - (height / 2 - bottomMargin) / view.cell;
  }
}

export function screenPoint(view, worldX, worldY) {
  return {
    x: view.width / 2 + (worldX - view.centerX) * view.cell,
    y: view.height / 2 + (worldY - view.centerY) * view.cell
  };
}

export function worldPoint(view, clientX, clientY) {
  const rect = view.canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.width / 2) / view.cell + view.centerX,
    y: (clientY - rect.top - view.height / 2) / view.cell + view.centerY
  };
}

export function gridPoint(view, clientX, clientY) {
  const point = worldPoint(view, clientX, clientY);
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  return insideGrid(x, y, view.gridWidth, view.gridHeight) ? { x, y } : null;
}

export function zoomView(view, multiplier) {
  view.focus = 'custom';
  view.zoom = Math.min(5, Math.max(0.8, view.zoom * multiplier));
  resizeView(view);
}

export function fitView(view) {
  view.focus = 'fit';
  view.zoom = 1;
  view.centerX = view.gridWidth / 2;
  view.centerY = (view.gridHeight + 6) / 2;
  resizeView(view);
}

export function focusBottom(view) {
  view.focus = 'bottom';
  view.zoom = 1.35;
  view.centerX = view.gridWidth / 2;
  resizeView(view);
}

export function panView(view, dxPixels, dyPixels) {
  view.focus = 'custom';
  view.centerX = Math.min(view.gridWidth + 1, Math.max(-1, view.centerX - dxPixels / view.cell));
  view.centerY = Math.min(view.gridHeight + 8, Math.max(0, view.centerY - dyPixels / view.cell));
}

export function roadPosition(phase, width = GRID_WIDTH, height = GRID_HEIGHT) {
  if (phase < width) return { x: phase + 0.5, y: height + 0.5 };
  const points = [
    { x: width - 0.5, y: height + 0.5 }, { x: width + 0.5, y: height + 1.5 },
    { x: width + 0.5, y: height + 4.5 }, { x: width - 0.5, y: height + 5.5 },
    { x: 0.5, y: height + 5.5 }, { x: -0.5, y: height + 4.5 },
    { x: -0.5, y: height + 1.5 }, { x: 0.5, y: height + 0.5 }
  ];
  const segments = points.slice(1).map((to, index) => {
    const from = points[index];
    return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y) };
  });
  const returnLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let distance = (phase - width + 1) / (roadLength(width) - width + 1) * returnLength;
  for (const segment of segments) {
    if (distance <= segment.length) {
      const fraction = distance / segment.length;
      return { x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
        y: segment.from.y + (segment.to.y - segment.from.y) * fraction };
    }
    distance -= segment.length;
  }
  return points.at(-1);
}

function roundedRect(ctx, x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawBoard(view, balls, road = [], options = {}) {
  resizeView(view);
  const { gridWidth, gridHeight } = view;
  const ctx = view.canvas.getContext('2d');
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = '#0c2733';
  ctx.fillRect(0, 0, view.width, view.height);
  const cell = view.cell;
  const left = (worldX) => screenPoint(view, worldX, 0).x;
  const top = (worldY) => screenPoint(view, 0, worldY).y;
  const firstX = Math.max(0, Math.floor(view.centerX - view.width / (2 * cell)) - 1);
  const lastX = Math.min(gridWidth - 1, Math.ceil(view.centerX + view.width / (2 * cell)) + 1);
  const firstY = Math.max(0, Math.floor(view.centerY - view.height / (2 * cell)) - 1);
  const lastY = Math.min(gridHeight - 1, Math.ceil(view.centerY + view.height / (2 * cell)) + 1);
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) {
      if (!insideGrid(x, y, gridWidth, gridHeight)) continue;
      ctx.fillStyle = '#163642';
      ctx.fillRect(left(x), top(y), cell, cell);
      if (options.editor && cell >= 7) {
        ctx.strokeStyle = '#60909b45';
        ctx.lineWidth = 1;
        ctx.strokeRect(left(x), top(y), cell, cell);
      }
      const color = balls[cellIndex(x, y, gridWidth)];
      if (color === null) continue;
      const id = options.ballIds?.[cellIndex(x, y, gridWidth)];
      const animation = options.ballAnimations?.get(id);
      const position = animation
        ? animatedPosition(animation, options.animationTime ?? 0)
        : { x: x + 0.5, y: y + 0.5 };
      const point = screenPoint(view, position.x, position.y);
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(2, cell * 0.38), 0, Math.PI * 2);
      ctx.fillStyle = COLORS[color].hex;
      ctx.fill();
      if (cell >= 7) {
        ctx.beginPath();
        ctx.arc(point.x - cell * 0.12, point.y - cell * 0.13, cell * 0.105, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff80';
        ctx.fill();
      }
    }
  }
  const length = roadLength(gridWidth);
  const path = [roadPosition(length - 1, gridWidth, gridHeight), ...Array.from({ length }, (_, index) => roadPosition(index, gridWidth, gridHeight))];
  ctx.beginPath();
  path.forEach((point, index) => {
    const screen = screenPoint(view, point.x, point.y);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.closePath();
  ctx.lineWidth = Math.max(5, cell * 0.7);
  ctx.strokeStyle = '#58737b';
  ctx.stroke();
  ctx.lineWidth = Math.max(2, cell * 0.35);
  ctx.strokeStyle = '#263d46';
  ctx.stroke();
  const contactStart = screenPoint(view, 0.5, gridHeight + 0.5);
  const contactEnd = screenPoint(view, gridWidth - 0.5, gridHeight + 0.5);
  ctx.beginPath();
  ctx.moveTo(contactStart.x, contactStart.y);
  ctx.lineTo(contactEnd.x, contactEnd.y);
  ctx.lineWidth = Math.max(2, cell * 0.16);
  ctx.strokeStyle = '#ffd474';
  ctx.stroke();
  for (const car of road) {
    const point = roadPosition(car.phase, gridWidth, gridHeight);
    const screen = screenPoint(view, point.x, point.y);
    const width = Math.max(10, cell * 0.95);
    const height = Math.max(8, cell * 0.65);
    roundedRect(ctx, screen.x - width / 2, screen.y - height / 2, width, height, 3, COLORS[car.color].hex);
    ctx.strokeStyle = options.selectedRoadCar === car.id ? '#fff2a8' : '#ffffffb0';
    ctx.lineWidth = options.selectedRoadCar === car.id ? 3 : 1;
    ctx.strokeRect(screen.x - width / 2, screen.y - height / 2, width, height);
  }
  if (options.previewRect) {
    const { x1, y1, x2, y2 } = options.previewRect;
    const sx = left(Math.min(x1, x2));
    const sy = top(Math.min(y1, y2));
    const sw = (Math.abs(x2 - x1) + 1) * cell;
    const sh = (Math.abs(y2 - y1) + 1) * cell;
    ctx.fillStyle = '#ffdc6a45';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#ffe69b';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
  }
  ctx.beginPath();
  ctx.moveTo(left(0), top(0));
  ctx.lineTo(left(gridWidth), top(0));
  ctx.lineTo(left(gridWidth), top(gridHeight));
  ctx.lineTo(left(0), top(gridHeight));
  ctx.closePath();
  ctx.strokeStyle = '#8eb6ba';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawMini(canvas, balls, view) {
  const width = 160;
  const height = 54;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0e2934';
  ctx.fillRect(0, 0, width, height);
  const stepX = width / view.gridWidth;
  const stepY = height / view.gridHeight;
  for (let y = 0; y < view.gridHeight; y++) {
    for (let x = 0; x < view.gridWidth; x++) {
      const color = balls[cellIndex(x, y, view.gridWidth)];
      ctx.fillStyle = color === null ? '#163642' : COLORS[color].hex;
      ctx.fillRect(x * stepX, y * stepY, stepX + 0.2, stepY + 0.2);
    }
  }
  const worldLeft = view.centerX - view.width / (2 * view.cell);
  const worldTop = view.centerY - view.height / (2 * view.cell);
  ctx.strokeStyle = '#fff4ac';
  ctx.lineWidth = 2;
  ctx.strokeRect(worldLeft * stepX, worldTop * stepY,
    view.width / view.cell * stepX, view.height / view.cell * stepY);
}
