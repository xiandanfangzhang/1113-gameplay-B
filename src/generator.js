import {
  COLOR_KEYS, GARAGE_COLUMNS, GARAGE_ROWS, GRID_HEIGHT, GRID_WIDTH,
  ROAD_CAPACITY, ROAD_CAPACITY_MAX, cellIndex, validSize
} from './constants.js';

const GROUP_SIZE = 5;

export function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

/** Build one capacity-matched candidate. The editor verifies a real win before using it. */
export function generateRandomGarage({ balls, columns, rows, seed, width = GRID_WIDTH, height = GRID_HEIGHT }) {
  if (!validSize(width, height) || !Array.isArray(balls) || balls.length !== width * height ||
      balls.some((color) => color !== null && !COLOR_KEYS.includes(color))) {
    throw new Error(`球区必须是宽 ${width}、高 ${height} 的有效矩形网格。`);
  }
  if (!Number.isInteger(columns) || columns < 1 || columns > GARAGE_COLUMNS) {
    throw new Error(`列数必须是 1–${GARAGE_COLUMNS} 的整数。`);
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > GARAGE_ROWS) {
    throw new Error(`行数必须是 1–${GARAGE_ROWS} 的整数。`);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('随机种子必须是 0–4294967295 的整数。');
  }

  const counts = Object.fromEntries(COLOR_KEYS.map((color) => [color, 0]));
  for (const color of balls) if (color !== null) counts[color]++;
  const activeColors = COLOR_KEYS.filter((color) => counts[color] > 0);
  const slots = columns * rows;
  const totalBalls = activeColors.reduce((total, color) => total + counts[color], 0);
  if (totalBalls === 0) throw new Error('当前球区没有小球，无法生成正容量车辆。');
  const nonMultiples = activeColors.filter((color) => counts[color] % 5 !== 0);
  if (nonMultiples.length) {
    throw new Error(`${nonMultiples.map((color) => `${color} 色有 ${counts[color]} 个球`).join('，')}；要精确匹配且每车容量为 5 的倍数，每种颜色的球数也必须是 5 的倍数。`);
  }
  if (slots < activeColors.length) {
    throw new Error(`需要 ${slots} 辆车，但球区有 ${activeColors.length} 种颜色；至少每色一辆。`);
  }
  if (slots > totalBalls / 5) {
    throw new Error(`需要 ${slots} 辆车，但只有 ${totalBalls} 个小球；每辆车容量至少为 5。`);
  }

  const random = randomSource(seed);
  const units = Object.fromEntries(activeColors.map((color) => [color, counts[color] / 5]));
  const allocations = Object.fromEntries(COLOR_KEYS.map((color) => [color, 0]));
  for (const color of activeColors) allocations[color] = 1;
  for (let remaining = slots - activeColors.length; remaining > 0; remaining--) {
    const eligible = activeColors.filter((color) => allocations[color] < units[color]);
    const weightSum = eligible.reduce((sum, color) => sum + units[color] - allocations[color], 0);
    let choice = random() * weightSum;
    let selected = eligible.at(-1);
    for (const color of eligible) {
      choice -= units[color] - allocations[color];
      if (choice < 0) { selected = color; break; }
    }
    allocations[selected]++;
  }

  const cars = [];
  for (const color of activeColors) {
    const count = allocations[color];
    const base = Math.floor(units[color] / count);
    const capacities = Array(count).fill(base);
    for (let extra = units[color] % count; extra > 0; extra--) capacities[extra - 1]++;
    // Move a little capacity between cars while keeping every capacity positive.
    for (let n = 0; n < count * 2 && count > 1; n++) {
      const from = Math.floor(random() * count);
      const to = Math.floor(random() * count);
      if (from !== to && capacities[from] > 1) {
        const amount = 1 + Math.floor(random() * Math.min(capacities[from] - 1, Math.max(1, Math.floor(base / 3))));
        capacities[from] -= amount;
        capacities[to] += amount;
      }
    }
    for (const capacity of capacities) cars.push({ color, capacity: capacity * 5 });
  }
  shuffle(cars, random);
  const garage = Array.from({ length: GARAGE_COLUMNS }, () => []);
  for (let index = 0; index < cars.length; index++) {
    const column = Math.floor(index / rows);
    const slot = index % rows;
    garage[column].push({
      id: `random-car-${seed}-${index + 1}`,
      color: cars[index].color,
      capacity: cars[index].capacity,
      slot
    });
  }
  return garage;
}

/** A reproducible, capacity-matched draft with one car per color. */
export function generateRandomLevel({ id, colors, seed, roadCapacity = ROAD_CAPACITY, width = GRID_WIDTH, height = GRID_HEIGHT }) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('缺少当前关卡 ID。');
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > COLOR_KEYS.length ||
      new Set(colors).size !== colors.length || colors.some((color) => !COLOR_KEYS.includes(color))) {
    throw new Error(`请选择 1–${COLOR_KEYS.length} 种不重复的有效颜色。`);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('随机种子必须是 0–4294967295 的整数。');
  }
  if (!Number.isInteger(roadCapacity) || roadCapacity < 1 || roadCapacity > ROAD_CAPACITY_MAX) {
    throw new Error(`道路车位上限必须是 1–${ROAD_CAPACITY_MAX} 的整数。`);
  }
  if (!validSize(width, height)) throw new Error('球区宽度或高度超出允许范围。');
  if (width * height < GROUP_SIZE) throw new Error('随机生成至少需要 5 个球格，以满足车辆容量为 5 的倍数。');
  if (Math.floor(width * height / GROUP_SIZE) < colors.length) {
    throw new Error(`当前 ${width}×${height} 球区不足以给 ${colors.length} 种颜色各分配至少 5 个球。`);
  }

  const random = randomSource(seed);
  const groups = Array.from({ length: Math.floor(width * height / GROUP_SIZE) }, (_, index) => colors[index % colors.length]);
  shuffle(groups, random);
  const balls = Array(width * height).fill(null);
  let order = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (order < groups.length * GROUP_SIZE) balls[cellIndex(x, y, width)] = groups[Math.floor(order / GROUP_SIZE)];
      order++;
    }
  }
  const garage = Array.from({ length: GARAGE_COLUMNS }, () => []);
  for (let index = 0; index < colors.length; index++) {
    const color = colors[index];
    const column = index % GARAGE_COLUMNS;
    const slot = garage[column].length;
    garage[column].push({
      id: `random-${color}-${seed}`,
      color,
      capacity: balls.filter((ball) => ball === color).length,
      slot
    });
  }
  return {
    id,
    width,
    height,
    name: `随机关卡 · ${colors.join('')} · #${seed}`,
    roadCapacity,
    balls,
    garage
  };
}
