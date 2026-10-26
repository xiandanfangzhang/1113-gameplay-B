import assert from 'node:assert/strict';
import test from 'node:test';
import { cellIndex, CELL_COUNT, CONTACT_COUNT, BOTTOM_LEFT, GRID_HEIGHT, GRID_WIDTH, ROAD_LENGTH } from '../src/constants.js';
import {
  advanceGame, capacityWarnings, clearGarageCar, createGame, dispatchCar,
  magnetRoadCar, remainingByColor, setPaused, setSpeed, shuffleGarage
} from '../src/engine.js';
import { getBuiltinLevel } from '../src/levels.js';

function smallLevel(balls, columns) {
  const grid = Array(CELL_COUNT).fill(null);
  for (const [x, y, color] of balls) grid[cellIndex(x, y)] = color;
  return {
    id: 'test', name: '测试', balls: grid,
    garage: Array.from({ length: 3 }, (_, column) => (columns[column] ?? [])
      .map(([color, capacity], slot) => ({ id: `c${column}-${slot}`, color, capacity, slot })))
  };
}

test('只接道路正上方且同色的小球，其他外轮廓和对角不接', () => {
  const game = createGame(smallLevel([
    [BOTTOM_LEFT, 19, 'B'], [BOTTOM_LEFT + 1, 19, 'R'], [BOTTOM_LEFT + 2, 19, 'B'], [BOTTOM_LEFT, 18, 'R']
  ], [[['R', 2]], [['B', 2]]]));
  assert.equal(dispatchCar(game, 'c0-0').ok, true);
  advanceGame(game, 3); // entrance phase -> 0,1,2
  assert.equal(game.ballsLeft, 3);
  assert.equal(game.balls[cellIndex(BOTTOM_LEFT, 19)], 'B');
  assert.equal(game.balls[cellIndex(BOTTOM_LEFT + 1, 19)], 'R'); // 旁边的红球斜落，但本次不再接走它。
  assert.equal(game.balls[cellIndex(BOTTOM_LEFT + 2, 19)], 'B');
  assert.equal(game.road[0].remaining, 1);
});

test('接球后向下补位，本次接球事件不递归吸走新球', () => {
  const bottom = Array.from({ length: CONTACT_COUNT }, (_, phase) => [BOTTOM_LEFT + phase, 19, 'R']);
  const game = createGame(smallLevel([[BOTTOM_LEFT, 18, 'R'], ...bottom], [[['R', CONTACT_COUNT + 1]]]));
  dispatchCar(game, 'c0-0');
  advanceGame(game, 1);
  assert.equal(game.ballsLeft, CONTACT_COUNT);
  assert.equal(game.balls[cellIndex(BOTTOM_LEFT, 19)], 'R');
  assert.equal(game.road[0].remaining, CONTACT_COUNT);
  advanceGame(game, ROAD_LENGTH);
  assert.equal(game.status, 'won');
});

test('前车阻挡、道路六车上限、满载立即释放车位', () => {
  const level = smallLevel([[BOTTOM_LEFT, 19, 'R']], [
    [['B', 1], ['R', 1], ['B', 1]],
    [['B', 1], ['B', 1]],
    [['B', 1], ['B', 1]]
  ]);
  const game = createGame(level);
  assert.match(dispatchCar(game, 'c0-1').message, /前车阻挡/);
  for (const id of ['c0-0', 'c1-0', 'c1-1', 'c2-0', 'c2-1', 'c0-1']) {
    assert.equal(dispatchCar(game, id).ok, true);
  }
  // 红车已在道路上，因此满位时仍有未来可接球，不应提前判负。
  assert.equal(game.status, 'playing');
  assert.equal(game.road.length, 6);
  assert.match(dispatchCar(game, 'c0-2').message, /道路已满/);
  advanceGame(game, 6);
  assert.equal(game.road.length, 5);
  assert.equal(game.ballsLeft, 0);
});

test('六辆无可接触球的车构成真实死局', () => {
  const game = createGame(smallLevel([[BOTTOM_LEFT, 19, 'R']], [
    [['B', 1], ['B', 1]], [['B', 1], ['B', 1]], [['B', 1], ['B', 1]]
  ]));
  for (const id of ['c0-0', 'c0-1', 'c1-0', 'c1-1', 'c2-0', 'c2-1']) dispatchCar(game, id);
  assert.equal(game.status, 'failed');
});

test('自定义道路车位上限控制派车、释放和满位死局', () => {
  const narrow = smallLevel([[BOTTOM_LEFT, 19, 'R'], [BOTTOM_LEFT + 1, 19, 'R']], [[['R', 1], ['R', 1]]]);
  narrow.roadCapacity = 1;
  const game = createGame(narrow);
  assert.equal(game.roadCapacity, 1);
  assert.equal(dispatchCar(game, 'c0-0').ok, true);
  assert.match(dispatchCar(game, 'c0-1').message, /1\/1/);
  advanceGame(game, 1);
  assert.equal(game.road.length, 0);
  assert.equal(dispatchCar(game, 'c0-1').ok, true);
  advanceGame(game, 2);
  assert.equal(game.status, 'won');

  const wide = smallLevel([[BOTTOM_LEFT, 19, 'R']], [
    [['B', 1], ['B', 1], ['B', 1]],
    [['B', 1], ['B', 1], ['B', 1]],
    [['B', 1], ['B', 1]]
  ]);
  wide.roadCapacity = 8;
  const crowded = createGame(wide);
  for (const id of ['c0-0', 'c0-1', 'c0-2', 'c1-0', 'c1-1', 'c1-2']) {
    assert.equal(dispatchCar(crowded, id).ok, true);
  }
  assert.equal(crowded.status, 'playing');
  assert.equal(dispatchCar(crowded, 'c2-0').ok, true);
  assert.equal(crowded.status, 'playing');
  assert.equal(dispatchCar(crowded, 'c2-1').ok, true);
  assert.equal(crowded.status, 'failed');
  assert.equal(crowded.road.length, 8);

  const allSlots = smallLevel([[BOTTOM_LEFT, 19, 'R']], Array.from({ length: 3 }, () =>
    Array.from({ length: 12 }, () => ['B', 1])));
  allSlots.roadCapacity = 36;
  const fullRoad = createGame(allSlots);
  for (const car of fullRoad.garage.flat().map((item) => item.id)) {
    assert.equal(dispatchCar(fullRoad, car).ok, true);
  }
  assert.equal(new Set(fullRoad.road.map((car) => car.phase)).size, 36);
  assert.equal(fullRoad.status, 'failed');
});

test('清除和磁铁只删除车；打乱保持车辆属性与路上车辆', () => {
  const game = createGame(smallLevel([[BOTTOM_LEFT, 19, 'R'], [BOTTOM_LEFT + 1, 19, 'B']], [
    [['R', 1], ['B', 1]], [['B', 1]]
  ]));
  const beforeBalls = [...game.balls];
  dispatchCar(game, 'c0-0');
  const roadBefore = structuredClone(game.road);
  assert.equal(clearGarageCar(game, 'c0-1').ok, true);
  assert.deepEqual(game.balls, beforeBalls);
  assert.equal(game.garage[0].length, 0);
  // 添加一辆待发车只为验证打乱保留属性。
  game.garage[0].push({ id: 'extra', color: 'Y', capacity: 7, slot: 0 });
  const carSet = game.garage.flat().map(({ id, color, capacity }) => `${id}:${color}:${capacity}`).sort();
  assert.equal(shuffleGarage(game).ok, true);
  assert.deepEqual(game.garage.flat().map(({ id, color, capacity }) => `${id}:${color}:${capacity}`).sort(), carSet);
  assert.deepEqual(game.road, roadBefore);
  assert.equal(magnetRoadCar(game, 'c0-0').ok, true);
  assert.deepEqual(game.balls, beforeBalls);
  assert.equal(game.road.length, 0);
  assert.deepEqual(capacityWarnings(game).map((item) => item.color), ['R']);
});

test('清除列头后方关键车辆立即可派出，球区保持不变', () => {
  const game = createGame(smallLevel([[BOTTOM_LEFT, 19, 'R']], [[['B', 1], ['R', 1]]]));
  const before = [...game.balls];
  assert.match(dispatchCar(game, 'c0-1').message, /前车阻挡/);
  assert.equal(clearGarageCar(game, 'c0-0').ok, true);
  assert.deepEqual(game.balls, before);
  assert.equal(game.garage[0][0].id, 'c0-1');
  assert.equal(dispatchCar(game, 'c0-1').ok, true);
});

test('相同关卡、模拟时点与操作的打乱结果可复现', () => {
  const level = smallLevel([], [[['R', 1], ['B', 2]], [['Y', 3]], [['G', 4]]]);
  const first = createGame(level);
  const second = createGame(level);
  shuffleGarage(first);
  shuffleGarage(second);
  assert.deepEqual(first.garage, second.garage);
});

test('暂停冻结推进；加速不改游戏规则与模拟步结果', () => {
  const level = smallLevel([[BOTTOM_LEFT, 19, 'R']], [[['R', 1]]]);
  const game = createGame(level);
  dispatchCar(game, 'c0-0');
  setPaused(game, true);
  advanceGame(game, 50);
  assert.equal(game.tick, 0);
  setPaused(game, false);
  setSpeed(game, 4);
  advanceGame(game, 1);
  assert.equal(game.status, 'won');
  assert.equal(game.tick, 1);
  assert.equal(remainingByColor(game).balls.R, 0);
  assert.deepEqual([GRID_WIDTH, GRID_HEIGHT, CONTACT_COUNT], [60, 20, 60]);
});
