export const GRID_WIDTH = 60;
export const GRID_HEIGHT = 20;
export const MIN_GRID_WIDTH = 1;
export const MAX_GRID_WIDTH = 100;
export const MIN_GRID_HEIGHT = 1;
export const MAX_GRID_HEIGHT = 60;
export const TOP_WIDTH = 60;
export const BOTTOM_WIDTH = 60;
export const CELL_COUNT = GRID_WIDTH * GRID_HEIGHT;
export const CONTACT_COUNT = BOTTOM_WIDTH;
export const BOTTOM_LEFT = Math.floor((GRID_WIDTH - BOTTOM_WIDTH) / 2);
export const rowWidth = (y) => Math.round(TOP_WIDTH - (TOP_WIDTH - BOTTOM_WIDTH) * y / (GRID_HEIGHT - 1));
export const rowLeft = (y) => Math.floor((GRID_WIDTH - rowWidth(y)) / 2);
export const isActiveCell = (x, y) => Number.isInteger(x) && Number.isInteger(y) && y >= 0 && y < GRID_HEIGHT && x >= rowLeft(y) && x < rowLeft(y) + rowWidth(y);
export const ACTIVE_CELL_COUNT = Array.from({ length: GRID_HEIGHT }, (_, y) => rowWidth(y)).reduce((sum, width) => sum + width, 0);
export const ROAD_LENGTH = 128;
export const roadLength = (width = GRID_WIDTH) => width + 68;
export const ROAD_CAPACITY = 6;
export const GARAGE_COLUMNS = 3;
export const GARAGE_ROWS = 12;
export const ROAD_CAPACITY_MAX = GARAGE_COLUMNS * GARAGE_ROWS;
export const CONFIG_VERSION = 5;
export const COLORS = Object.freeze({
  R: { name: '红', hex: '#f36c6c' },
  B: { name: '蓝', hex: '#59a9ec' },
  Y: { name: '黄', hex: '#f5c753' },
  G: { name: '绿', hex: '#72c987' },
  O: { name: '橙', hex: '#f39858' },
  P: { name: '紫', hex: '#ad80df' }
});
export const COLOR_KEYS = Object.freeze(Object.keys(COLORS));

export function roadCapacityOf(level) {
  return level?.roadCapacity === undefined ? ROAD_CAPACITY : level.roadCapacity;
}

export function levelSize(level) {
  return { width: level?.width ?? GRID_WIDTH, height: level?.height ?? GRID_HEIGHT };
}

export function validSize(width, height) {
  return Number.isInteger(width) && width >= MIN_GRID_WIDTH && width <= MAX_GRID_WIDTH &&
    Number.isInteger(height) && height >= MIN_GRID_HEIGHT && height <= MAX_GRID_HEIGHT;
}

export function cellIndex(x, y, width = GRID_WIDTH) {
  return y * width + x;
}

export function insideGrid(x, y, width = GRID_WIDTH, height = GRID_HEIGHT) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < width && y >= 0 && y < height;
}

export function resizeLevel(level, width, height) {
  if (!validSize(width, height)) throw new Error(`球区宽度须为 ${MIN_GRID_WIDTH}–${MAX_GRID_WIDTH}、高度须为 ${MIN_GRID_HEIGHT}–${MAX_GRID_HEIGHT} 的整数。`);
  const old = levelSize(level);
  const balls = Array(width * height).fill(null);
  let removed = 0;
  for (let y = 0; y < old.height; y++) for (let x = 0; x < old.width; x++) {
    const color = level.balls[cellIndex(x, y, old.width)];
    if (x < width && y < height) balls[cellIndex(x, y, width)] = color;
    else if (color !== null) removed++;
  }
  return { level: { ...clone(level), width, height, balls }, removed };
}

export function clone(value) {
  return structuredClone(value);
}

export function reindexGarage(garage) {
  for (const column of garage) {
    column.forEach((car, slot) => { car.slot = slot; });
  }
  return garage;
}
