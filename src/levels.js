import { BOTTOM_LEFT, GRID_WIDTH, GRID_HEIGHT, CELL_COUNT, GARAGE_COLUMNS, ROAD_CAPACITY, cellIndex, isActiveCell, clone } from './constants.js';

function garage(columns) {
  return Array.from({ length: GARAGE_COLUMNS }, (_, column) =>
    (columns[column] ?? []).map(([color, capacity], slot) => ({
      id: `car-${column}-${slot}`, color, capacity, slot
    }))
  );
}

function orderedBalls(colorForCell) {
  const balls = Array(CELL_COUNT).fill(null);
  let order = 0;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (isActiveCell(x, y)) balls[cellIndex(x, y)] = colorForCell(order++, x, y);
    }
  }
  return balls;
}

export const BUILTIN_LEVELS = Object.freeze([
  {
    id: 'tutorial',
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    name: '第 1 关 · 规则教学',
    roadCapacity: ROAD_CAPACITY,
    balls: orderedBalls((order) => order < 600 ? 'B' : 'R'),
    garage: garage([[['R', 600]], [['B', 600]]])
  },
  {
    id: 'split',
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    name: '第 2 关 · 分批装满',
    roadCapacity: ROAD_CAPACITY,
    balls: orderedBalls((order, x, y) => {
      if (y === GRID_HEIGHT - 1) return x < BOTTOM_LEFT + 5 ? 'Y' : x < BOTTOM_LEFT + 10 ? 'B' : 'R';
      return order < 750 ? 'B' : 'R';
    }),
    garage: garage([[['Y', 5], ['B', 755]], [['R', 440]]])
  },
  {
    id: 'parking',
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    name: '第 3 关 · 车位管理',
    roadCapacity: ROAD_CAPACITY,
    balls: orderedBalls((order) => order < 400 ? 'B' : order < 800 ? 'Y' : 'R'),
    garage: garage([
      [['B', 200], ['R', 400]],
      [['Y', 100], ['Y', 100], ['Y', 100], ['Y', 100]],
      [['B', 100], ['B', 100]]
    ])
  }
]);

export function getBuiltinLevel(id) {
  const level = BUILTIN_LEVELS.find((item) => item.id === id);
  if (!level) throw new Error(`未知关卡：${id}`);
  return clone(level);
}
