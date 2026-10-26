import {
  COLOR_KEYS, CONFIG_VERSION, GARAGE_COLUMNS, GARAGE_ROWS,
  MAX_GRID_HEIGHT, MAX_GRID_WIDTH, MIN_GRID_HEIGHT, MIN_GRID_WIDTH, ROAD_CAPACITY_MAX,
  clone, levelSize, roadCapacityOf, validSize
} from './constants.js';

export function countColors(level) {
  const balls = Object.fromEntries(COLOR_KEYS.map((color) => [color, 0]));
  const capacity = Object.fromEntries(COLOR_KEYS.map((color) => [color, 0]));
  if (Array.isArray(level?.balls)) {
    for (const color of level.balls) if (color in balls) balls[color]++;
  }
  if (Array.isArray(level?.garage)) {
    for (const column of level.garage) {
      if (!Array.isArray(column)) continue;
      for (const car of column) {
        if (car && car.color in capacity && Number.isInteger(car.capacity)) {
          capacity[car.color] += car.capacity;
        }
      }
    }
  }
  return { balls, capacity };
}

export function validateLevel(level) {
  const errors = [];
  const warnings = [];
  if (!level || typeof level !== 'object' || Array.isArray(level)) {
    return { errors: ['关卡必须是对象。'], warnings, counts: countColors(null) };
  }
  if (typeof level.id !== 'string' || !level.id.trim()) errors.push('缺少关卡 ID。');
  if (typeof level.name !== 'string' || !level.name.trim()) errors.push('缺少关卡名称。');
  if (typeof level.name === 'string' && level.name.length > 40) errors.push('关卡名称不能超过 40 字。');
  const { width, height } = levelSize(level);
  if (!validSize(width, height)) {
    errors.push(`球区宽度须为 ${MIN_GRID_WIDTH}–${MAX_GRID_WIDTH}、高度须为 ${MIN_GRID_HEIGHT}–${MAX_GRID_HEIGHT} 的整数。`);
  }
  const roadCapacity = roadCapacityOf(level);
  if (!Number.isInteger(roadCapacity) || roadCapacity < 1 || roadCapacity > ROAD_CAPACITY_MAX) {
    errors.push(`道路车位上限必须是 1–${ROAD_CAPACITY_MAX} 的整数。`);
  }
  if (validSize(width, height) && (!Array.isArray(level.balls) || level.balls.length !== width * height)) {
    errors.push(`宽 ${width}、高 ${height} 的矩形球区必须有 ${width}×${height} = ${width * height} 个格子。`);
  } else if (validSize(width, height)) {
    level.balls.forEach((color, index) => {
      const x = index % width + 1;
      const y = Math.floor(index / width) + 1;
      if (color !== null && !COLOR_KEYS.includes(color)) {
        errors.push(`球区第 ${y} 行第 ${x} 列颜色无效。`);
      }
    });
  }
  if (!Array.isArray(level.garage) || level.garage.length !== GARAGE_COLUMNS) {
    errors.push(`车库必须有 ${GARAGE_COLUMNS} 列。`);
  } else {
    const ids = new Set();
    level.garage.forEach((column, columnIndex) => {
      if (!Array.isArray(column)) {
        errors.push(`车库第 ${columnIndex + 1} 列必须是车辆列表。`);
        return;
      }
      if (column.length > GARAGE_ROWS) errors.push(`车库第 ${columnIndex + 1} 列超过 ${GARAGE_ROWS} 个合法车位。`);
      const slots = new Set();
      column.forEach((car, arrayIndex) => {
        const position = `车库第 ${columnIndex + 1} 列第 ${arrayIndex + 1} 位`;
        if (!car || typeof car !== 'object' || Array.isArray(car)) {
          errors.push(`${position}缺少车辆字段。`);
          return;
        }
        if (typeof car.id !== 'string' || !car.id.trim()) errors.push(`${position}缺少车辆 ID。`);
        else if (ids.has(car.id)) errors.push(`${position}车辆 ID 重复：${car.id}。`);
        else ids.add(car.id);
        if (!COLOR_KEYS.includes(car.color)) errors.push(`${position}颜色无效。`);
        if (!Number.isInteger(car.capacity) || car.capacity < 1 || car.capacity > width * height) {
          errors.push(`${position}容量必须是 1–${width * height} 的整数。`);
        }
        if (!Number.isInteger(car.slot) || car.slot < 0 || car.slot >= GARAGE_ROWS) {
          errors.push(`${position}车位非法。`);
        } else if (slots.has(car.slot)) {
          errors.push(`${position}与同列车辆发生位置冲突。`);
        } else {
          slots.add(car.slot);
          if (car.slot !== arrayIndex) errors.push(`${position}车位不连续，应为 ${arrayIndex}。`);
        }
      });
    });
  }
  const counts = countColors(level);
  if (errors.length === 0) {
    for (const color of COLOR_KEYS) {
      const difference = counts.capacity[color] - counts.balls[color];
      if (difference !== 0) warnings.push(`${color} 色容量与球数相差 ${difference > 0 ? '+' : ''}${difference}；数量检查不能证明可通关。`);
    }
  }
  return { errors, warnings, counts };
}

export function normalizeLevel(level) {
  const copy = clone(level);
  const { width, height } = levelSize(copy);
  copy.width = width;
  copy.height = height;
  copy.roadCapacity = roadCapacityOf(copy);
  return copy;
}

export function exportLevel(level) {
  const result = validateLevel(level);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  return JSON.stringify({ version: CONFIG_VERSION, level: normalizeLevel(level) }, null, 2);
}

export function importLevel(json, targetId) {
  let document;
  try { document = JSON.parse(json); }
  catch (error) { throw new Error(`JSON 语法错误：${error.message}`); }
  if (!document || ![4, CONFIG_VERSION].includes(document.version)) {
    throw new Error(`配置版本无效，需要 version: 4 或 ${CONFIG_VERSION}。`);
  }
  if (!document.level || typeof document.level !== 'object') throw new Error('缺少 level 字段。');
  const next = normalizeLevel(document.level);
  const result = validateLevel(next);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  next.id = targetId;
  return next;
}
