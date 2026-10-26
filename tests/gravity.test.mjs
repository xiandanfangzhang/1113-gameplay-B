import assert from 'node:assert/strict';
import test from 'node:test';
import { BOTTOM_LEFT, CELL_COUNT, GRID_HEIGHT, GRID_WIDTH, cellIndex, isActiveCell, rowLeft, rowWidth } from '../src/constants.js';
import { animatedPosition, nextFallPosition, settleBalls } from '../src/gravity.js';
import { advanceGame, createGame, dispatchCar, setSpeed } from '../src/engine.js';

function grid(cells) {
  const balls = Array(CELL_COUNT).fill(null);
  for (const [x, y, color] of cells) balls[cellIndex(x, y)] = color;
  return balls;
}

function destination(cells, x = 20, y = 18) {
  return nextFallPosition(grid([[x, y, 'R'], ...cells]), x, y);
}

test('直落优先于斜落；左右都通时固定向右下', () => {
  assert.deepEqual(destination([]), { x: 20, y: 19 });
  assert.deepEqual(destination([[20, 19, 'B']]), { x: 21, y: 19 });
});

test('仅左下或仅右下可进入时分别斜落', () => {
  assert.deepEqual(destination([[20, 19, 'B'], [21, 19, 'B']]), { x: 19, y: 19 });
  assert.deepEqual(destination([[20, 19, 'B'], [19, 19, 'B']]), { x: 21, y: 19 });
});

test('三个方向都受阻、球区边界和斜向路径阻挡', () => {
  assert.equal(destination([[19, 19, 'B'], [20, 19, 'B'], [21, 19, 'B']]), null);
  const rightEdge = rowLeft(18) + rowWidth(18) - 1;
  assert.deepEqual(destination([], rightEdge), { x: rightEdge, y: 19 });
  assert.deepEqual(destination([[rightEdge, 19, 'B']], rightEdge), { x: rightEdge - 1, y: 19 });
  assert.equal(destination([[rightEdge, 19, 'B'], [rightEdge - 1, 19, 'B']], rightEdge), null);
  assert.equal(destination([[20, 19, 'B'], [19, 19, 'B'], [21, 18, 'B']]), null);
  assert.equal(destination([[20, 19, 'B'], [21, 19, 'B'], [19, 18, 'B']]), null);
});

test('跨列补位持续到稳定，颜色数量守恒且动画路径可插值', () => {
  const balls = grid([
    [20, 15, 'R'], [20, 16, 'B'], [20, 17, 'Y'],
    [20, 18, 'G'], [20, 19, 'B']
  ]);
  const before = balls.filter(Boolean).sort();
  const ids = balls.map((color, index) => color === null ? null : index);
  const { paths } = settleBalls(balls, ids);
  assert.deepEqual(balls.filter(Boolean).sort(), before);
  assert.equal(new Set(ids.filter((id) => id !== null)).size, before.length);
  assert.ok([...paths.values()].some((path) => path.some((point, index) => index > 0 && point.x !== path[index - 1].x)));
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!isActiveCell(x, y)) assert.equal(balls[cellIndex(x, y)], null);
      if (balls[cellIndex(x, y)] !== null) assert.equal(nextFallPosition(balls, x, y), null);
    }
  }
  const path = [...paths.values()].find((item) => item.length > 1);
  const halfway = animatedPosition({ path, startTick: 10, durationTicks: 10 }, 15);
  assert.ok(Number.isFinite(halfway.x) && Number.isFinite(halfway.y));
});

test('落球动画期间不提前判六车死局；暂停冻结逻辑时间', () => {
  const level = {
    id: 'falling-deadlock', name: '落球死局测试',
    balls: grid([[BOTTOM_LEFT, 18, 'Y'], [BOTTOM_LEFT, 19, 'R'], [BOTTOM_LEFT + 1, 19, 'B']]),
    garage: Array.from({ length: 3 }, (_, column) => [0, 1].map((slot) => ({
      id: `car-${column}-${slot}`, color: 'R', capacity: 2, slot
    })))
  };
  const game = createGame(level);
  for (const column of level.garage) for (const car of column) assert.equal(dispatchCar(game, car.id).ok, true);
  assert.equal(game.status, 'playing');
  advanceGame(game, 1);
  assert.equal(game.balls[cellIndex(BOTTOM_LEFT, 19)], 'Y');
  assert.equal(game.ballAnimations.size > 0, true);
  assert.equal(game.status, 'playing');
  game.paused = true;
  advanceGame(game, 50);
  assert.equal(game.tick, 1);
  game.paused = false;
  advanceGame(game, 29);
  assert.equal(game.status, 'playing');
  advanceGame(game, 1);
  assert.equal(game.status, 'failed');
});

test('相同模拟步与派车操作在不同倍速下保持一致', () => {
  const level = {
    id: 'determinism', name: '倍速一致性',
    balls: grid([[BOTTOM_LEFT, 18, 'Y'], [BOTTOM_LEFT, 19, 'B'], [BOTTOM_LEFT + 1, 19, 'R']]),
    garage: [[{ id: 'red', color: 'R', capacity: 1, slot: 0 }], [], []]
  };
  const normal = createGame(level);
  const fast = createGame(level);
  setSpeed(fast, 4);
  assert.equal(dispatchCar(normal, 'red').ok, true);
  assert.equal(dispatchCar(fast, 'red').ok, true);
  advanceGame(normal, 12);
  advanceGame(fast, 12);
  assert.deepEqual(fast.balls, normal.balls);
  assert.deepEqual(fast.ballIds, normal.ballIds);
  assert.deepEqual(fast.road, normal.road);
  assert.deepEqual([...fast.ballAnimations], [...normal.ballAnimations]);
  assert.equal(fast.status, normal.status);
});
